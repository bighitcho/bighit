"""Typecast narration adapter. Never prints API credentials or raw API errors."""
import argparse
import json
import os
from pathlib import Path
from typecast import Typecast
from typecast.models import TTSRequestWithTimestamps, Output, SmartPrompt

SOURCE = "api-page"
GENERATED_BY = "codex"
MODEL = "ssfm-v30"
SAMPLE = "뒤쪽 물건, 꺼내기 번거로우셨죠? 필요한 물건을 한눈에 정리해 보세요."

def generate(text, destination, voice_id=None):
    if not 1 <= len(text) <= 2000:
        raise ValueError("대본은 1~2000자여야 합니다.")
    destination = Path(destination)
    if destination.exists():
        raise ValueError("이미 생성된 파일입니다. 새 출력 경로를 사용하세요.")
    key = os.environ.get("TYPECAST_API_KEY", "").strip()
    if not key:
        raise ValueError("GitHub Repository secret TYPECAST_API_KEY가 없습니다.")
    client = Typecast(api_key=key, source=SOURCE, generated_by=GENERATED_BY)
    candidates = []
    if voice_id:
        selected = client.voice_v2(voice_id)
    else:
        recommendations = client.recommend_voices(
            "한국어 살림 쇼핑 숏츠, 성인 여성, 자연스럽고 또렷한 중음, "
            "친근하고 활기찬 설명, 속삭임이나 과장된 광고 말투 제외", count=3)
        for item in recommendations:
            detail = client.voice_v2(item.voice_id)
            candidates.append(detail)
        selected = next((v for v in candidates
                         if v.gender and v.gender.value == "female"
                         and v.age and v.age.value in ("young_adult", "middle_age")
                         and any(m.version.value == MODEL for m in v.models)), None)
        if selected is None:
            raise ValueError("조건에 맞는 성인 여성 목소리 확인 불가. TYPECAST_VOICE_ID 설정 필요.")
    if not any(m.version.value == MODEL for m in selected.models):
        raise ValueError("선택한 목소리가 ssfm-v30을 지원하지 않습니다.")
    print("TYPECAST_AUTH_OK; voice=" + selected.voice_name, flush=True)
    request = TTSRequestWithTimestamps(
        text=text, voice_id=selected.voice_id, model=MODEL, language="kor",
        prompt=SmartPrompt(emotion_type="smart"),
        output=Output(audio_format="wav", audio_tempo=1.1, target_lufs=-14),
        seed=42)
    # One paid synthesis request; no automatic retry of paid operations.
    response = client.text_to_speech_with_timestamps(request, granularity="word")
    audio = response.audio_bytes
    if not audio or response.audio_duration <= 0 or not response.words:
        raise ValueError("음성 또는 타임스탬프가 비어 있습니다.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(audio)
    destination.with_suffix(".srt").write_text(
        response.to_srt(max_seconds=1.5, max_chars=16), encoding="utf-8")
    metadata = {
        "source": SOURCE, "generated_by": GENERATED_BY, "model": MODEL,
        "voice": selected.model_dump(mode="json"), "text": text,
        "audio_duration": response.audio_duration,
        "words": [w.model_dump(mode="json") for w in response.words],
        "candidates": [v.model_dump(mode="json") for v in candidates],
        "preview_required": True,
        "note": "언어·억양·벤치마킹 적합성은 실제 청취로 확인해야 합니다."}
    destination.with_suffix(".json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"TYPECAST_SAMPLE_OK; duration={response.audio_duration:.2f}s", flush=True)
    return metadata

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text-file", type=Path)
    parser.add_argument("--output", default="typecast-output/sample.wav")
    parser.add_argument("--voice-id", default=os.environ.get("TYPECAST_VOICE_ID"))
    args = parser.parse_args()
    try:
        text = args.text_file.read_text(encoding="utf-8").strip() if args.text_file else SAMPLE
        generate(text, args.output, args.voice_id)
    except Exception as exc:
        if isinstance(exc, ValueError):
            print("TYPECAST_FAILED: " + str(exc))
        else:
            # SDK errors can include response bodies. Log only safe exception class.
            print("TYPECAST_FAILED: " + type(exc).__name__)
        raise SystemExit(1)

if __name__ == "__main__":
    main()
