"""Drive-backed YouTube worker. Python 3.11+, ffmpeg/ffprobe; no pip packages.

Only run one worker against a Drive state folder. GitHub Actions provides the
global concurrency lock; local runs require stopping that schedule first.
Credentials and resumable session URLs never appear in reports or logs.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

API = "https://www.googleapis.com"
DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
AI_DISCLOSURE = "광고, 인공지능(AI)을 기반으로 생성된 가상인물이 포함된 게시물입니다"
MAX_BYTES = 2 * 1024**3
CHUNK = 8 * 1024**2


class Blocked(Exception):
    pass


class RemoteError(Exception):
    def __init__(self, status, reason=""):
        self.status = status
        self.reason = reason if re.fullmatch(r"[A-Za-z0-9_.-]{0,80}", reason) else "api_error"
        super().__init__(f"외부 API 응답 {status}: {self.reason}")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def request(method, url, token=None, payload=None, headers=None, raw=None):
    """No automatic retries of POST/PUT: caller must reconcile side effects."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in {
        "www.googleapis.com", "oauth2.googleapis.com", "generativelanguage.googleapis.com"
    }:
        raise Blocked("허용되지 않은 API 주소")
    h = dict(headers or {})
    if token:
        h["Authorization"] = "Bearer " + token
    data = raw
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=120) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        body = e.read()
        if e.code == 308:
            return 308, dict(e.headers), body
        reason = ""
        try:
            err = json.loads(body).get("error", {})
            reason = err.get("errors", [{}])[0].get("reason", err.get("status", "")) if isinstance(err, dict) else err
        except (ValueError, KeyError, IndexError):
            pass
        raise RemoteError(e.code, reason) from None
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        raise RemoteError(503, "network_uncertain") from None


def utc():
    return datetime.now(timezone.utc)


def stamp():
    return utc().isoformat()


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise Blocked(f"연결 설정 필요: {name}")
    return value


def token(refresh_token):
    form = urllib.parse.urlencode({
        "client_id": required("GOOGLE_CLIENT_ID"),
        "client_secret": required("GOOGLE_CLIENT_SECRET"),
        "refresh_token": refresh_token, "grant_type": "refresh_token"
    }).encode()
    _, _, body = request("POST", "https://oauth2.googleapis.com/token", raw=form,
                         headers={"Content-Type": "application/x-www-form-urlencoded"})
    return json.loads(body)["access_token"]


def fid(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{5,200}", value):
        raise Blocked("올바른 Drive 파일 ID가 필요합니다")
    return value


class Drive:
    def __init__(self):
        self.token = token(required("DRIVE_REFRESH_TOKEN"))
        self.state_folder = fid(required("DRIVE_STATE_FOLDER_ID"))

    def api(self, method, path, **kwargs):
        return request(method, API + path, self.token, **kwargs)

    def list(self, folder):
        files, page = [], None
        while True:
            params = {"q": f"'{fid(folder)}' in parents and trashed = false", "pageSize": 100,
                      "fields": "nextPageToken,files(id,name,mimeType,size)", "supportsAllDrives": "true",
                      "includeItemsFromAllDrives": "true"}
            if page:
                params["pageToken"] = page
            body = self.api("GET", "/drive/v3/files?" + urllib.parse.urlencode(params))[2]
            data = json.loads(body)
            files.extend(data.get("files", []))
            page = data.get("nextPageToken")
            if not page:
                return files

    def read(self, file_id):
        return self.api("GET", f"/drive/v3/files/{fid(file_id)}?alt=media&supportsAllDrives=true")[2]

    def write(self, file_id, data):
        self.api("PATCH", f"/upload/drive/v3/files/{fid(file_id)}?uploadType=media&supportsAllDrives=true",
                 raw=data, headers={"Content-Type": "application/json"})

    def create(self, folder, name, data, mime="application/json"):
        # Metadata-first: a lost response never leads to YouTube upload; find by
        # deterministic filename next run. Duplicate state files fail closed.
        body = self.api("POST", "/drive/v3/files?supportsAllDrives=true&fields=id", payload={
            "name": name, "parents": [fid(folder)], "mimeType": mime})[2]
        file_id = json.loads(body)["id"]
        self.api("PATCH", f"/upload/drive/v3/files/{file_id}?uploadType=media&supportsAllDrives=true",
                 raw=data, headers={"Content-Type": mime})
        return file_id

    def download(self, file_id, path):
        meta = json.loads(self.api("GET", f"/drive/v3/files/{fid(file_id)}?fields=size,mimeType&supportsAllDrives=true")[2])
        size = int(meta.get("size", 0))
        if not 0 < size <= MAX_BYTES:
            raise Blocked("영상/음원 파일은 0바이트 초과, 2GB 이하여야 합니다")
        # Download bounded ranges to avoid loading a long music video in RAM.
        with open(path, "wb") as f:
            for start in range(0, size, CHUNK):
                end = min(start + CHUNK, size) - 1
                code, _, data = self.api("GET", f"/drive/v3/files/{file_id}?alt=media&supportsAllDrives=true",
                                        headers={"Range": f"bytes={start}-{end}"})
                if code != 206 or len(data) != end - start + 1:
                    # Some tiny files return 200 to a whole-file request.
                    if not (start == 0 and size <= CHUNK and code == 200 and len(data) == size):
                        raise Blocked("Drive 부분 다운로드 응답 불일치")
                f.write(data)

    def save_video(self, folder, name, path):
        matches = [f for f in self.list(folder) if f["name"] == name]
        if len(matches) > 1:
            raise Blocked("완성 영상 파일명 중복: 확인 필요")
        if matches:
            return matches[0]["id"]
        size = path.stat().st_size
        _, headers, _ = self.api("POST", "/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id",
                                 payload={"name": name, "parents": [fid(folder)]},
                                 headers={"X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)})
        session = next(v for k, v in headers.items() if k.lower() == "location")
        with path.open("rb") as f:
            for offset in range(0, size, CHUNK):
                chunk = f.read(CHUNK)
                code, _, body = request("PUT", session, self.token, raw=chunk,
                                        headers={"Content-Type": "video/mp4", "Content-Range": f"bytes {offset}-{offset+len(chunk)-1}/{size}"})
                if code in (200, 201):
                    return json.loads(body)["id"]
        raise Blocked("완성 영상 Drive 저장 결과 미확인: 다음 실행 전 확인 필요")


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2).encode()


class State:
    def __init__(self, drive, job_id):
        self.drive = drive
        self.name = f"{job_id}.state.json"
        matches = [x for x in drive.list(drive.state_folder) if x["name"] == self.name]
        if len(matches) > 1:
            raise Blocked("상태 파일이 중복되어 게시를 멈췄습니다")
        if matches:
            self.file_id = matches[0]["id"]
            raw = drive.read(self.file_id)
            self.data = json.loads(raw) if raw else {"job_id": job_id, "status": "NEW"}
        else:
            self.data = {"job_id": job_id, "status": "NEW", "attempts": 0}
            self.file_id = drive.create(drive.state_folder, self.name, dump(self.data))

    def save(self, **values):
        self.data.update(values, updated_at=stamp())
        self.drive.write(self.file_id, dump(self.data))


def validate(job):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", str(job.get("id", ""))):
        raise Blocked("작업 ID 형식 오류")
    if job.get("ready") is not True:
        raise Blocked("제작·검수가 완료되지 않은 작업")
    if not isinstance(job.get("rights_evidence"), str) or not job["rights_evidence"].strip() or job.get("qa_passed") is not True:
        raise Blocked("사용권 근거와 완성 영상 검수 기록 필요")
    if job.get("mode") not in ("mp4", "music"):
        raise Blocked("mode는 mp4 또는 music이어야 합니다")
    if job["mode"] == "mp4":
        fid(job.get("video_file_id"))
    else:
        fid(job.get("image_file_id")); fid(job.get("audio_file_id"))
        if not 1 <= float(job.get("duration_seconds", 0)) <= 10800:
            raise Blocked("음악 영상 길이는 1~10800초 범위입니다")
    if not re.fullmatch(r"UC[A-Za-z0-9_-]{22}", str(job.get("channel_id", ""))):
        raise Blocked("핸들이 아닌 실제 YouTube 채널 ID 필요")
    title = job.get("title", "")
    if not isinstance(title, str) or not 1 <= len(title) <= 100 or any(c in title for c in "<>"):
        raise Blocked("제목은 1~100자이며 꺾쇠를 포함할 수 없습니다")
    if not isinstance(job.get("made_for_kids"), bool):
        raise Blocked("아동용 여부를 명시해야 합니다")
    if job.get("visibility") not in ("private", "scheduled"):
        raise Blocked("공개 방식은 private 또는 scheduled입니다")
    if job["visibility"] == "scheduled":
        try:
            when = datetime.fromisoformat(job["publish_at"].replace("Z", "+00:00"))
            if when.tzinfo is None or when < utc() + timedelta(minutes=10):
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            raise Blocked("예약은 시간대가 포함된 ISO 시각으로 10분 이상 뒤여야 합니다")
    description(job)


def description(job):
    prefixes = []
    if job.get("affiliate"):
        prefixes.append(DISCLOSURE)
    if job.get("ai_ad_person"):
        prefixes.append(AI_DISCLOSURE)
    text = "\n\n".join(prefixes + [str(job.get("description", ""))])
    if len(text.encode()) > 5000 or "<" in text or ">" in text:
        raise Blocked("설명 길이/문자 제한을 확인하세요")
    return text


def probe(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                            capture_output=True, check=True, timeout=60)
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    if not any(s.get("codec_type") == "video" for s in streams) or not any(s.get("codec_type") == "audio" for s in streams):
        raise Blocked("영상 또는 음성 트랙이 없습니다")
    if float(data["format"].get("duration", 0)) <= 0:
        raise Blocked("재생 길이가 유효하지 않습니다")
    return data


def render(drive, job, folder):
    output = folder / "output.mp4"
    if job["mode"] == "mp4":
        drive.download(job["video_file_id"], output)
    else:
        image = folder / "image.bin"
        audio = folder / "audio.bin"
        drive.download(job["image_file_id"], image)
        drive.download(job["audio_file_id"], audio)
        portrait = job.get("portrait", False)
        w, h = (1080, 1920) if portrait else (1920, 1080)
        filters = f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1"
        subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-loop", "1", "-i", str(image),
                        "-stream_loop", "-1", "-i", str(audio), "-t", str(float(job["duration_seconds"])),
                        "-vf", filters, "-r", "24", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage",
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(output)],
                       check=True, timeout=3300, capture_output=True)
    probe(output)
    if output.stat().st_size > MAX_BYTES:
        raise Blocked("완성 영상이 2GB 제한을 초과했습니다")
    return output


def file_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for data in iter(lambda: f.read(CHUNK), b""):
            h.update(data)
    return h.hexdigest()


def confirmed_status(video, job):
    if video.get("snippet", {}).get("channelId") != job["channel_id"]:
        raise Blocked("업로드 결과의 채널이 지정 채널과 다릅니다")
    s = video.get("status", {})
    if s.get("uploadStatus") in ("failed", "rejected", "deleted"):
        return "BLOCKED"
    if s.get("privacyStatus") == "public":
        return "PUBLISHED"
    if s.get("publishAt"):
        return "SCHEDULED"
    return "UPLOADED_PRIVATE"


def finish(state, result, job):
    video_id = result.get("id")
    if not video_id:
        raise Blocked("업로드 응답에 영상 ID가 없습니다")
    # Persist ID before any follow-up; no subsequent exception can duplicate upload.
    state.save(video_id=video_id, status="UPLOADED_PRIVATE", session_url=None)


def upload(path, job, state, access_token, call=request):
    total = path.stat().st_size
    session = state.data.get("session_url")
    if state.data.get("video_id"):
        return
    if not session:
        if state.data.get("status") == "INITIATING":
            raise Blocked("업로드 세션 생성 결과 미확인: 수동 대조 후 복구 필요")
        state.save(status="INITIATING")
        status = {"privacyStatus": "private", "selfDeclaredMadeForKids": job["made_for_kids"]}
        if job.get("contains_synthetic_media"):
            status["containsSyntheticMedia"] = True
        if job["visibility"] == "scheduled":
            status["publishAt"] = job["publish_at"]
        payload = {"snippet": {"title": job["title"], "description": description(job),
                               "categoryId": str(job.get("category_id", "22"))}, "status": status}
        _, headers, _ = call("POST", API + "/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", access_token,
                            payload=payload, headers={"X-Upload-Content-Length": str(total), "X-Upload-Content-Type": "video/mp4"})
        session = next((v for k, v in headers.items() if k.lower() == "location"), None)
        if not session or urllib.parse.urlparse(session).hostname != "www.googleapis.com":
            raise Blocked("유효한 업로드 세션 주소를 받지 못했습니다")
        state.save(status="UPLOADING", session_url=session)
    # Always ask the server for its offset, including after an uncertain final PUT.
    code, headers, body = call("PUT", session, access_token, raw=b"", headers={"Content-Range": f"bytes */{total}"})
    if code in (200, 201):
        finish(state, json.loads(body), job)
        return
    if code != 308:
        raise Blocked("업로드 진행 상태를 확인할 수 없습니다")
    header = next((v for k, v in headers.items() if k.lower() == "range"), "")
    offset = int(header.split("-")[-1]) + 1 if header else 0
    if offset > total:
        raise Blocked("업로드 위치가 파일 크기를 초과합니다")
    with open(path, "rb") as f:
        f.seek(offset)
        while offset < total:
            chunk = f.read(CHUNK)
            end = offset + len(chunk) - 1
            code, _, body = call("PUT", session, access_token, raw=chunk,
                                 headers={"Content-Type": "video/mp4", "Content-Range": f"bytes {offset}-{end}/{total}"})
            if code in (200, 201):
                finish(state, json.loads(body), job)
                return
            if code != 308:
                raise Blocked("청크 업로드 상태 오류")
            offset = end + 1
    raise RemoteError(503, "completion_unconfirmed")


def sync(job, state, access_token):
    query = urllib.parse.urlencode({"id": state.data["video_id"], "part": "snippet,status,statistics,processingDetails"})
    body = request("GET", API + "/youtube/v3/videos?" + query, access_token)[2]
    items = json.loads(body).get("items", [])
    if not items:
        raise Blocked("기존 영상 확인 불가: 재업로드하지 않고 대조 필요")
    video = items[0]
    actual = confirmed_status(video, job)
    snapshots = state.data.get("metrics", [])[-29:]
    snapshots.append({"checked_at": stamp(), **video.get("statistics", {})})
    state.save(status=actual, processing=video.get("processingDetails", {}).get("processingStatus"),
               actual_publish_at=video.get("status", {}).get("publishAt"), metrics=snapshots,
               video_url="https://www.youtube.com/watch?v=" + video["id"],
               last_error="예약이 확인되지 않았습니다. Studio/API 프로젝트 상태를 확인하세요." if job["visibility"] == "scheduled" and actual == "UPLOADED_PRIVATE" else None)


def run_job(drive, job, channel_tokens):
    # Validate id before looking up state; completed uploads can be reconciled
    # even when their scheduled timestamp is now in the past.
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", str(job.get("id", ""))):
        raise Blocked("작업 ID 형식 오류")
    state = State(drive, job["id"])
    try:
        digest = hashlib.sha256(dump(job)).hexdigest()
        if state.data.get("manifest_hash") not in (None, digest):
            raise Blocked("진행 중인 작업 내용이 변경됐습니다. 원래 파일로 복원 후 대조하세요")
        if state.data.get("status") in ("BLOCKED", "FAILED"):
            return state.data
        if state.data.get("next_attempt_at", 0) > time.time():
            return state.data
        refresh = channel_tokens.get(job.get("channel_id"))
        if not refresh:
            raise Blocked("대상 YouTube 채널의 로그인 연결이 필요합니다")
        access = token(refresh)
        # Even valid OAuth tokens can target the wrong Brand Account.
        mine = json.loads(request("GET", API + "/youtube/v3/channels?part=id&mine=true", access)[2]).get("items", [])
        if job["channel_id"] not in [x["id"] for x in mine]:
            raise Blocked("로그인된 YouTube 채널과 작업 채널이 다릅니다")
        if state.data.get("video_id"):
            sync(job, state, access)
            return state.data
        # Resuming uses already stored scheduling metadata, not a new session.
        if state.data.get("session_url"):
            validation_job = {**job, "visibility": "private"}
            validate(validation_job)
        else:
            validate(job)
        state.save(manifest_hash=digest)
        with tempfile.TemporaryDirectory(prefix="youtube-") as temp:
            path = render(drive, job, Path(temp))
            digest_file = file_hash(path)
            if state.data.get("file_hash") not in (None, digest_file):
                raise Blocked("업로드 중 원본 영상이 변경됐습니다")
            # Cross-job duplicate protection (single worker invariant).
            for other in drive.list(drive.state_folder):
                if other["id"] != state.file_id and other["name"].endswith(".state.json"):
                    data = drive.read(other["id"])
                    previous = json.loads(data) if data else {}
                    if previous.get("channel_id") == job["channel_id"] and previous.get("file_hash") == digest_file:
                        raise Blocked("같은 채널에 동일한 영상이 이미 등록되어 있습니다")
            state.save(file_hash=digest_file, channel_id=job["channel_id"])
            # A long render may outlive the access token; refresh before upload.
            access = token(refresh)
            drive.token = token(required("DRIVE_REFRESH_TOKEN"))
            if job["mode"] == "music" and not state.data.get("output_file_id"):
                output_id = drive.save_video(fid(required("DRIVE_OUTPUT_FOLDER_ID")), job["id"] + ".mp4", path)
                state.save(output_file_id=output_id)
            upload(path, job, state, access)
            sync(job, state, access)
    except Blocked as e:
        state.save(status="BLOCKED", last_error=str(e))
    except RemoteError as e:
        attempts = state.data.get("attempts", 0) + 1
        retryable = e.status in (429, 500, 502, 503, 504)
        state.save(status="RETRY" if retryable and attempts < 3 and state.data.get("status") != "INITIATING" else "BLOCKED",
                   attempts=attempts, next_attempt_at=time.time() + 300 * 2**(attempts - 1), last_error=str(e))
    except (ValueError, KeyError, subprocess.SubprocessError, OSError):
        state.save(status="FAILED", last_error="파일·미디어 처리 오류: 원본과 실행 환경 확인 필요")
    return state.data


def check():
    names = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "DRIVE_REFRESH_TOKEN", "DRIVE_QUEUE_FOLDER_ID",
             "DRIVE_STATE_FOLDER_ID", "DRIVE_OUTPUT_FOLDER_ID", "YOUTUBE_CHANNEL_TOKENS_JSON"]
    return {"enabled": os.environ.get("YOUTUBE_AUTOMATION_ENABLED") == "true",
            "settings": {x: bool(os.environ.get(x)) for x in names},
            "ffmpeg": bool(shutil.which("ffmpeg")), "ffprobe": bool(shutil.which("ffprobe")),
            "topview": "별도 MCP 인증 및 생성 결과 연결 필요"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["check", "run"])
    args = parser.parse_args()
    if args.command == "check":
        print(json.dumps(check(), ensure_ascii=False, indent=2))
        return
    if os.environ.get("YOUTUBE_AUTOMATION_ENABLED") != "true":
        print("자동발행 비활성: 연결 검증 후 활성화하세요.")
        return
    drive = Drive()
    channel_tokens = json.loads(required("YOUTUBE_CHANNEL_TOKENS_JSON"))
    jobs = []
    for item in drive.list(required("DRIVE_QUEUE_FOLDER_ID")):
        if item["name"].endswith(".job.json"):
            try:
                raw = drive.read(item["id"])
                job = json.loads(raw)
                jobs.append(job)
            except (ValueError, RemoteError):
                print("읽을 수 없는 작업 파일 1건: 건너뜀")
    ids = [j.get("id") for j in jobs]
    if len(ids) != len(set(ids)):
        raise Blocked("중복 작업 ID가 있습니다. 실행을 멈췄습니다")
    prior = {}
    for f in drive.list(drive.state_folder):
        if f["name"].endswith(".state.json"):
            raw=drive.read(f["id"])
            if raw:
                s=json.loads(raw)
                prior[s.get("job_id")]=s
    # New jobs first; oldest observation next. Do not starve jobs beyond 20.
    jobs.sort(key=lambda j: (prior.get(j.get("id"),{}).get("status") in ("BLOCKED","FAILED"),
                             prior.get(j.get("id"),{}).get("updated_at","")))
    report = []
    for job in jobs[:20]:
        if not job.get("ready"):
            continue
        try:
            result = run_job(drive, job, channel_tokens)
            # Private state includes secrets/session URLs. Export only allowlist.
            report.append({k: result.get(k) for k in ("job_id", "status", "video_url", "last_error", "updated_at", "metrics")})
        except (Blocked, RemoteError):
            report.append({"job_id": job.get("id"), "status": "BLOCKED", "last_error": "상태 저장 또는 연결 오류"})
    name = utc().strftime("report-%Y%m%d-%H%M%S.json")
    drive.create(drive.state_folder, name, dump(report))
    for row in report:
        print(json.dumps({"job_id": row["job_id"], "status": row["status"]}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (Blocked, RemoteError) as e:
        print(str(e))
        raise SystemExit(1)
