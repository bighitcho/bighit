"""Six-shot UGC production plan and deterministic assembly.

TopView generation is performed through authenticated host MCP tools; this module
does not invent private API endpoints, model IDs, credits or successful outputs.
It produces bounded stage requests and consumes actual returned media files.
"""
import argparse
import json
import subprocess
from pathlib import Path

ANCHOR = """One fictional Korean adult woman, approximately 30 years old, oval face,
dark brown almond-shaped eyes, natural slightly asymmetrical smile, medium-length
dark brown hair tucked behind one ear. Ivory cotton T-shirt and light beige apron.
Natural pores, subtle skin-tone variation and fine baby hairs, no beauty filter.
Same face, age, hair, outfit, accessories and proportions in every shot.
Compact lived-in Korean apartment kitchen, warm white cabinets, light oak counter,
soft window daylight from camera left, consistent soft contact shadows."""

LOCK = """Use the approved character-sheet asset ID and the exact uploaded product
reference asset IDs. Preserve product shape, dimensions, color, material, lid,
handle, buttons and logo orientation. Never invent an unseen functional part.
One clear subject action and one camera movement per clip. Stable hands and grip.
No face swap, extra fingers, floating product, plastic skin, warped labels,
unrequested logos, rendered captions or watermarks. Add Korean captions in editing.
For a continuation shot only, start from the previous approved last frame;
for a new angle, use the original character and product references again."""

SHOTS = [
    ("01_hook", 3, "extreme close-up", "구매자의 실제 불편을 한 장면으로 보여준다"),
    ("02_problem", 4, "over-the-shoulder", "불편이 발생하는 생활 상황을 보여준다"),
    ("03_reveal", 4, "eye-level medium", "고정 인물이 원본과 같은 제품을 소개한다"),
    ("04_demo", 6, "top-down", "공식 사용법에 맞는 한 가지 동작만 보여준다"),
    ("05_detail", 5, "side macro", "검증된 제품 특징 하나를 가까이 보여준다"),
    ("06_close", 4, "three-quarter medium", "제품과 인물을 함께 보여주며 짧게 정리한다"),
]


def build(product):
    if not product.get("name") or not product.get("url"):
        raise ValueError("제품명과 실제 상품 URL 필요")
    refs = product.get("reference_asset_ids", [])
    evidence = product.get("evidence", [])
    locked = bool(product.get("character_asset_id")) and len(refs) >= 3
    return {
        "product": product, "status": "READY_FOR_STORYBOARD" if locked and evidence else "RESEARCH_REQUIRED",
        "duration_seconds": 26, "aspect_ratio": "9:16", "character_anchor": ANCHOR,
        "continuity_lock": LOCK, "generation_model": "LIVE_MODEL_LIST_REQUIRED",
        "generation_submitted": False, "spent_credits": None,
        "stage_requests": [
            {"stage": "research", "prompt": "실제 상품 리뷰·공식 상품 정보·확인 가능한 SNS 반응을 조사한다. 불만 3개, 도입 3개, 경쟁 콘텐츠의 빈틈 3개를 작성한다. 각 근거에 원본 URL·확인시각·공개 작성자 ID(없으면 확인 불가)를 붙인다. 조회수·리뷰·인용문을 지어내지 않는다."},
            {"stage": "brief", "prompt": "확인된 근거만으로 UGC 문제해결형, 언박싱형, 제품소개형 기획 3안을 비교하고 1안을 선택한다. 이번 파일럿은 26초 6컷. 구매·사용 경험과 측정하지 않은 전후 효과를 주장하지 않는다."},
            {"stage": "character", "prompt": "정면·반측면·측면의 동일 가상 성인 인물 시트 1장. 아래 캐릭터 앵커 준수. 결과와 실제 asset ID를 반환하고 보드에 보관한다. 기존 확정 시트가 있으면 재생성하지 않는다.\n" + ANCHOR},
            {"stage": "storyboard", "prompt": "선정 기획으로 6개의 독립된 9:16 키프레임을 만든다. 인물 시트와 제품의 정면·측면·사용부 참조를 모든 컷에 사용한다. 서로 다른 앵글을 적용하고 각 컷 내레이션과 근거를 별도 작성한다.\n" + LOCK},
            {"stage": "video", "prompt": "현재 사용 가능한 모델·길이·크레딧을 먼저 조회한다. 검수 통과 키프레임만 이미지투비디오로 변환한다. 모델명을 추정하지 않는다. 손·제품·입 모양을 확인하고 실패한 컷만 최대 1회 다시 만든다. 한국어 발음이 어색하면 무성 클립과 별도 음성으로 합성한다."},
        ],
        "shots": [{"id": i, "duration": d, "angle": a, "action": act,
                   "character_asset_id": product.get("character_asset_id"), "product_asset_ids": refs,
                   "image_asset_id": None, "video_asset_id": None, "clip_path": None,
                   "narration": "", "qa_passed": False, "retry_count": 0} for i, d, a, act in SHOTS],
        "narration_path": None, "rights_evidence": "", "final_qa_passed": False,
        "note": "기획·프롬프트 생성은 TopView 생성 성공 또는 게시 완료를 의미하지 않습니다."
    }


def check_campaign(c):
    if len(c.get("shots", [])) != 6:
        raise ValueError("6컷이 필요합니다")
    if len({s["angle"] for s in c["shots"]}) != 6:
        raise ValueError("앵글 중복")
    character = c["product"].get("character_asset_id")
    refs = c["product"].get("reference_asset_ids", [])
    if not character or len(refs) < 3:
        raise ValueError("고정 인물 시트 및 제품 다각도 참조 필요")
    if not c.get("rights_evidence"):
        raise ValueError("원본 사용권 기록 필요")
    for s in c["shots"]:
        if s.get("character_asset_id") != character or s.get("product_asset_ids") != refs:
            raise ValueError("컷의 인물/제품 참조가 기준과 다릅니다")
        if s.get("qa_passed") is not True or not s.get("clip_path"):
            raise ValueError("모든 컷의 실제 영상과 검수 결과 필요")
        if not 0 < float(s["duration"]) <= 15:
            raise ValueError("컷 길이 범위 오류")


def srt_time(seconds):
    ms = round(seconds * 1000)
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"


def assemble(c, root, output):
    check_campaign(c)
    root = root.resolve()
    output.mkdir(parents=True, exist_ok=True)
    output = output.resolve()
    def asset(name):
        p = (root / name).resolve()
        if not p.is_relative_to(root) or not p.is_file():
            raise ValueError("작업 폴더 내 실제 파일만 사용할 수 있습니다")
        return p
    captions, start = [], 0.0
    for n, s in enumerate(c["shots"], 1):
        source = asset(s["clip_path"])
        media = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_format", "-of", "json", str(source)], timeout=30))
        if float(media["format"]["duration"]) + 0.05 < s["duration"]:
            raise ValueError("원본 클립이 기획 길이보다 짧습니다")
        subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", str(source), "-t", str(s["duration"]),
                        "-an", "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1",
                        "-r", "30", "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p", str(output/f"shot-{n}.mp4")], check=True, timeout=600)
        text = s.get("narration", "").replace("\n", " ")
        captions.append(f"{n}\n{srt_time(start)} --> {srt_time(start+s['duration'])}\n{text}\n")
        start += s["duration"]
    narration = asset(c["narration_path"])
    info = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_format", "-of", "json", str(narration)], timeout=30))
    if float(info["format"]["duration"]) > start + 0.1:
        raise ValueError("내레이션이 영상보다 깁니다. 문장을 줄이거나 컷 길이를 조정하세요")
    (output/"cuts.txt").write_text("\n".join(f"file 'shot-{n}.mp4'" for n in range(1, 7)))
    (output/"captions.srt").write_text("\n".join(captions), encoding="utf-8")
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-f", "concat", "-safe", "1", "-i", "cuts.txt",
                    "-i", str(narration), "-map", "0:v", "-map", "1:a", "-af", "apad,loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-t", str(start), "-vf", "subtitles=captions.srt:force_style='FontName=Noto Sans CJK KR,FontSize=18,MarginV=55'",
                    "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "-movflags", "+faststart", "final.mp4"],
                   cwd=output, check=True, timeout=600)
    return output / "final.mp4"


if __name__ == "__main__":
    p=argparse.ArgumentParser(); p.add_argument("command", choices=["plan", "assemble"])
    p.add_argument("input", type=Path); p.add_argument("output", type=Path)
    a=p.parse_args(); data=json.loads(a.input.read_text())
    if a.command == "plan":
        a.output.parent.mkdir(parents=True, exist_ok=True)
        a.output.write_text(json.dumps(build(data), ensure_ascii=False, indent=2))
    else:
        print(assemble(data, a.input.parent, a.output))
