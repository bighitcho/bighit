import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ugc

class UGCTests(unittest.TestCase):
    def campaign(self):
        c=ugc.build({"name":"Test", "url":"https://example.com/product", "character_asset_id":"character-1",
                     "reference_asset_ids":["front","side","detail"], "evidence":[{"url":"https://example.com"}]})
        c["rights_evidence"]="own assets"
        for s in c["shots"]: s.update(qa_passed=True, clip_path="clip.mp4")
        return c
    def test_six_distinct_angles_and_same_refs(self):
        c=self.campaign(); ugc.check_campaign(c)
        self.assertEqual(sum(s["duration"] for s in c["shots"]),26)
        self.assertFalse(c["generation_submitted"])
    def test_changed_product_blocked(self):
        c=self.campaign(); c["shots"][3]["product_asset_ids"]=["different"]
        with self.assertRaises(ValueError): ugc.check_campaign(c)
    def test_failed_shot_blocked(self):
        c=self.campaign(); c["shots"][2]["qa_passed"]=False
        with self.assertRaises(ValueError): ugc.check_campaign(c)
    def test_missing_references_not_ready(self):
        c=ugc.build({"name":"Test","url":"https://example.com"})
        self.assertEqual(c["status"],"RESEARCH_REQUIRED")
        with self.assertRaises(ValueError): ugc.check_campaign(c)
    def test_duplicate_angle_blocked(self):
        c=self.campaign(); c["shots"][3]["angle"]=c["shots"][0]["angle"]
        with self.assertRaises(ValueError): ugc.check_campaign(c)
