import copy
import json
import sys
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import worker as w


def job():
    return {"id": "pilot-001", "ready": True, "qa_passed": True,
            "rights_evidence": "own footage license record", "mode": "mp4", "video_file_id": "file123",
            "channel_id": "UC" + "a" * 22, "title": "서니힐 파일럿", "made_for_kids": False,
            "visibility": "private", "affiliate": True, "ai_ad_person": True}


class MemoryState:
    def __init__(self, **data):
        self.data = data
        self.history = []

    def save(self, **values):
        self.data.update(values)
        self.history.append(copy.deepcopy(self.data))


class WorkerTests(unittest.TestCase):
    def test_missing_rights_and_qa_block(self):
        for key in ("rights_evidence", "qa_passed", "ready"):
            j = job(); j[key] = False
            with self.assertRaises(w.Blocked): w.validate(j)

    def test_timezone_and_past_schedule_block(self):
        for value in ("2020-01-01T10:00:00+09:00", "2099-01-01T10:00:00", "garbage"):
            j = job(); j.update(visibility="scheduled", publish_at=value)
            with self.assertRaises(w.Blocked): w.validate(j)
        j["publish_at"] = (w.utc() + timedelta(days=2)).isoformat()
        w.validate(j)

    def test_disclosures(self):
        text = w.description(job())
        self.assertTrue(text.startswith(w.DISCLOSURE))
        self.assertIn(w.AI_DISCLOSURE, text)

    def test_wrong_channel_never_reported_success(self):
        with self.assertRaises(w.Blocked):
            w.confirmed_status({"snippet": {"channelId": "different"}, "status": {"privacyStatus": "public"}}, job())

    def test_private_api_restriction_not_reported_scheduled(self):
        v = {"snippet": {"channelId": job()["channel_id"]}, "status": {"privacyStatus": "private"}}
        self.assertEqual(w.confirmed_status(v, {**job(), "visibility": "scheduled"}), "UPLOADED_PRIVATE")

    def test_resumes_existing_session_without_new_post(self):
        calls = []
        def api(method, url, access, **kw):
            calls.append((method, kw))
            if kw["raw"] == b"": return 308, {"Range": "bytes=0-3"}, b""
            self.assertEqual(kw["raw"], b"5678")
            return 200, {}, json.dumps({"id": "video123"}).encode()
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/"video"; p.write_bytes(b"12345678")
            s = MemoryState(session_url=w.API+"/upload/test", status="RETRY")
            w.upload(p, job(), s, "test", api)
        self.assertEqual([c[0] for c in calls], ["PUT", "PUT"])
        self.assertEqual(s.data["video_id"], "video123")

    def test_lost_final_response_reconciles_without_duplicate(self):
        def api(method, url, access, **kw):
            self.assertEqual(method, "PUT")
            self.assertEqual(kw["raw"], b"")
            return 201, {}, b'{"id":"already-uploaded"}'
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"video"; p.write_bytes(b"done")
            s=MemoryState(session_url=w.API+"/upload/test")
            w.upload(p, job(), s, "test", api)
        self.assertEqual(s.data["video_id"], "already-uploaded")

    def test_lost_initiation_response_blocks_new_post(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"video"; p.write_bytes(b"done")
            with self.assertRaises(w.Blocked):
                w.upload(p, job(), MemoryState(status="INITIATING"), "test", lambda *a, **k: self.fail("must not send"))

    def test_finished_upload_never_reuploads(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"video"; p.write_bytes(b"done")
            w.upload(p, job(), MemoryState(video_id="existing"), "test", lambda *a, **k: self.fail("must not send"))

    def test_unknown_upload_host_rejected(self):
        with self.assertRaises(w.Blocked): w.request("PUT", "https://example.com/upload", "secret", raw=b"")

    def test_secret_status_reports_only_presence(self):
        with patch.dict("os.environ", {"GOOGLE_CLIENT_SECRET": "DO_NOT_LEAK"}):
            self.assertNotIn("DO_NOT_LEAK", json.dumps(w.check()))


if __name__ == "__main__": unittest.main()
