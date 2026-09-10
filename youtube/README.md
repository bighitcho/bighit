# Drive 기반 YouTube·UGC 자동화

Python 3.11+, FFmpeg/FFprobe. 기존 Instagram 실행기와 독립되어 있다.

## 구현 범위

- `ugc.py`: 홍아린 참고 흐름의 조사→기획 3안→인물 시트→제품 다각도 고정→6컷 요청 생성, 인물/제품 참조 검증, 실제 영상 6개와 내레이션·자막 합성.
- `worker.py`: Google Drive `.job.json` 대기열, MP4 다운로드 또는 음악 이미지+음원 합성, 음성/영상 트랙 검사, 채널 OAuth 검증, 중단 후 이어올리기, 예약/비공개 업로드, 실제 공개 상태·조회수·좋아요·댓글 수 수집.
- `authorize.py`: 본인 PC에서 1회 Google OAuth 로그인. Drive Workspace와 YouTube 브랜드 채널을 따로 연결한다.
- GitHub Actions: 30분 주기. 활성화 변수 기본 false. 예약시각은 YouTube에 미리 설정하며 Actions 실행시각의 정확성을 보장하지 않는다.

**아직 가동 아님:** 제공된 환경에는 Google OAuth 클라이언트·장기 토큰과 TopView 인증 도구가 없다. 자동화 코드를 설치해도 이 연결 없이 생성·게시하지 않는다. TopView 전용 모델/요금/API를 추정해 호출하지 않는다. `ugc.py`의 기획 출력은 영상 생성 성공이 아니다.

## 실행

```bash
python -m unittest discover -s youtube/tests -v
python youtube/worker.py check
python youtube/worker.py run
python youtube/ugc.py plan product.json campaign.json
python youtube/ugc.py assemble campaign.json ./output
```

상품 입력: 실제 `name`, `url`, `reference_asset_ids`(정면/측면/사용부 3개 이상), `character_asset_id`, `evidence`(출처 URL·관측시각·확인한 주장). 실제 API asset ID만 저장한다. 캠페인 6컷에 실제 `clip_path`, `narration`, `qa_passed`를 기록하고 `narration_path`, `rights_evidence`를 채운 뒤 합성한다. 합성 후 입모양·제품 외형·자막 타이밍은 별도 검수한다.

## 1회 계정 연결

Google Cloud에서 YouTube Data API v3와 Drive API를 켠 Desktop OAuth 클라이언트를 사용한다. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`을 본인 PC 환경에 설정한다. 코드에 직접 쓰지 않는다.

```bash
python youtube/authorize.py drive
python youtube/authorize.py youtube --channel-id ACTUAL_CHANNEL_ID
```

Drive 로그인은 `@greencap.or.kr`만 허용하고 YouTube 로그인은 지정 채널 ID와 일치할 때만 저장한다. Drive 파일 읽기/수정에 필요한 권한을 사용자 동의 화면에서 확인한다. 토큰은 기본 현재 폴더의 `.youtube-private-tokens.json`에 저장되며 GitHub에 커밋하지 않는다. OAuth 테스트 모드의 토큰 유효기간과 YouTube 업로드 프로젝트 감사 제한은 실제 Google 설정에서 확인해야 한다.

## GitHub 연결값

Secrets: `YOUTUBE_GOOGLE_CLIENT_ID`, `YOUTUBE_GOOGLE_CLIENT_SECRET`, `YOUTUBE_DRIVE_REFRESH_TOKEN`, `YOUTUBE_CHANNEL_TOKENS_JSON`.

마지막 값의 구조는 `{ "실제 UC 채널ID": "해당 채널 refresh token" }`. 계정 스크린샷의 핸들을 UC ID 대신 넣지 않는다. Drive와 YouTube는 다른 Google 계정이어도 된다.

Variables: `YOUTUBE_DRIVE_QUEUE_FOLDER_ID`, `YOUTUBE_DRIVE_STATE_FOLDER_ID`, `YOUTUBE_DRIVE_OUTPUT_FOLDER_ID`, `YOUTUBE_AUTOMATION_ENABLED`.

처음에는 `false` 유지 → 수동 `check` → 검수한 파일럿을 `private`로 1회 업로드 → 실제 재생 확인 → 예약 테스트 → `true` 순서다. `run` 역시 활성화가 false면 게시하지 않는다. 실행기는 `ready:true`, `qa_passed:true`, 사용권 증빙이 있는 파일만 처리한다. 이는 운영자(AI 포함)가 수행할 검수이며 대표자에게 매번 승인 버튼을 요구하는 구조가 아니다.

## Drive 운영

제작 대기 폴더: `job.example.json` 형식의 `고유ID.job.json`. 샘플은 ready=false라 실행되지 않는다. 비공개 운영 상태 폴더에는 상태·업로드 세션·성과 JSON이 저장된다. 이 폴더를 외부 공유하지 않는다. Drive 원본·완성 영상·게시 결과는 공개 GitHub에 저장하지 않는다.

완성 MP4: mode=mp4, video_file_id. 음악: mode=music, image_file_id, audio_file_id, duration_seconds(최대 10800), portrait(선택). 파일당 최대 2GB. 합성한 음악 영상은 완성영상 폴더에 저장한다.

## 복구와 한계

단일 실행기만 사용한다. GitHub concurrency가 실행 충돌을 막지만, 동시에 별도 PC worker를 돌리는 분산 잠금은 지원하지 않는다. 상태 파일은 일반 사용자가 수정하지 않는다.

작업별 파일 해시와 채널을 비교해 중복을 막는다. 응답이 끊겼을 때 기존 세션을 먼저 조회한다. 세션 시작 결과가 불명확하거나 만료되면 임의 신규 업로드 대신 BLOCKED 처리한다. 기존 video_id가 있으면 조회만 한다. 게시 예약 취소·삭제는 구현하지 않았으므로 YouTube Studio에서 수행하고 상태를 다시 확인한다.

BLOCKED 복구: 원인 수정 후 운영자가 기존 영상과 세션을 먼저 대조한다. 새 작업 ID로 무작정 재등록하지 않는다. 상태의 video_id/session_url/file_hash를 보존한 채 status=RETRY, attempts=0, next_attempt_at=0으로 복구한다. INITIATING 상태는 수동 대조 없이 초기화하지 않는다. 작업 원문은 업로드 시작 후 변경하지 않는다.

지표는 Data API의 조회수·좋아요·댓글과 실제 공개 상태다. CTR·시청지속률·광고수익은 Analytics API 추가 연결 전까지 제공하지 않는다. 재사용·양산형 심사 또는 상품 효능 검증을 코드의 기술 검수로 대신하지 않는다. 현재 최대 20작업/실행이며 향후 대량 운영 시 전용 대기열/DB 확장이 필요하다.

TopView 모델 생성은 인증된 MCP를 통해 실행하는 별도 단계다. 외부 웹 크레딧/Unlimited와 자동화 크레딧의 호환성을 확인한다. 아직 제품과 상품 이미지가 정해지지 않은 상태에서 가상의 상품 효능 시연을 생성하지 않는다.

## 공식 근거

- https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- https://developers.google.com/youtube/v3/docs/videos/insert
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://www.topview.ai/mcp
- https://github.com/topviewai/skill

참고자료: 사용자 제공 홍아린 제작 설명, 그록 일관성 프롬프트, Higgsfield 쇼핑쇼츠 자료 2개. 자료의 고정 모델명·100편 대량 생성·임의 후기·미구현 링크 안내를 실제 운영 사실로 가져오지 않는다.
