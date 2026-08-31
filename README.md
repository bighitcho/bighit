# 인스타그램 카드뉴스 자동화 봇

유튜브 링크 / 일반 웹 링크 / 주제어를 넣으면 Gemini AI가 카드뉴스 콘텐츠를 만들고,
카드 이미지를 렌더링한 뒤, 인스타그램과 스레드(Threads)에 자동으로 게시합니다.
GitHub Actions로 **하루 3번 자동 실행**됩니다.

## 동작 방식

1. `data/queue.json` 에 채워둔 소재(유튜브 링크 / 링크 / 주제)를 순서대로 하나씩 사용
2. 큐가 비어있으면 `data/topics-config.json` 의 카테고리로 구글 뉴스에서 자동으로 소재 발굴 (혼합 방식)
3. Gemini API로 카드뉴스 제목/본문/캡션/스레드 텍스트 생성
4. `satori` + `resvg`로 카드 이미지 여러 장을 PNG로 렌더링 (템플릿 3종: `gray`/`blue`/`square`)
5. 이미지를 저장소에 커밋해 공개 URL(raw.githubusercontent.com)로 만듦
6. Instagram Graph API로 캐러셀 게시, Threads API로 동일 이미지 게시
7. 사용한 소재/게시 결과를 `data/history.json` 에 기록

## 시작하기

### 1. 필요한 자격 증명 발급

아래 안내서를 순서대로 따라가면 됩니다 (Gemini 키, 인스타그램 프로페셔널 전환, Meta 앱, 액세스 토큰, Threads API까지 전부 포함):

> 채팅에서 전달받은 "API 발급 안내서" 아티팩트 참고 (Gemini API → 인스타 프로페셔널 전환 → Meta 앱 생성 → 액세스 토큰 → 60일 장기 토큰 → IG 계정 ID → Threads 토큰 순서)

### 2. GitHub Secrets 등록

저장소 **Settings → Secrets and variables → Actions → New repository secret** 에서 아래 값을 등록하세요.

| Secret 이름 | 설명 |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio에서 발급한 Gemini API 키 |
| `META_APP_ID` / `META_APP_SECRET` | Meta for Developers 앱의 App ID / Secret |
| `IG_LONG_LIVED_TOKEN` | 인스타그램 60일 장기 액세스 토큰 |
| `IG_BUSINESS_ACCOUNT_ID` | 게시할 인스타그램 비즈니스 계정 ID |
| `IG_HANDLE` | 카드 이미지 하단에 표시할 계정 핸들 (예: `@my_instagram`) |
| `THREADS_LONG_LIVED_TOKEN` | 스레드 60일 장기 액세스 토큰 |
| `THREADS_USER_ID` | 스레드 사용자 ID |
| `GH_PAT` *(선택, 토큰 자동 갱신용)* | `repo` 스코프가 있는 GitHub Personal Access Token |

**Settings → Secrets and variables → Actions → Variables** 탭에는 선택적으로 아래를 등록할 수 있습니다.

| Variable 이름 | 설명 | 기본값 |
|---|---|---|
| `CARD_THEME` | 카드 템플릿: `gray` / `blue` / `square` | `gray` |
| `DRY_RUN` | `true`면 게시 없이 이미지 생성까지만 실행 | `false` |

### 3. 소재 큐 채우기

`data/queue.json` 을 직접 수정해서 큐를 채워두세요.

```json
[
  { "id": "1", "type": "youtube", "value": "https://www.youtube.com/watch?v=xxxx", "used": false },
  { "id": "2", "type": "link", "value": "https://example.com/article", "used": false },
  { "id": "3", "type": "topic", "value": "아침 공복에 마시면 좋은 습관 5가지", "used": false }
]
```

- `type: "youtube"` — Gemini가 영상을 직접 분석 (공개 영상만 가능)
- `type: "link"` — 해당 URL의 본문 텍스트를 가져와 요약
- `type: "topic"` — 주제어만 주고 Gemini의 일반 지식으로 작성

큐에 있는 항목을 다 쓰면 자동으로 `data/topics-config.json` 의 카테고리를 순환하며
구글 뉴스에서 새 소재를 자동 발굴합니다 (직접 채운 큐가 항상 우선).

### 4. 로컬 테스트 (게시 없이 이미지만 생성)

```bash
npm install
cp .env.example .env   # GEMINI_API_KEY 등 입력, DRY_RUN=true 유지
npm run run-once       # ./out/ 폴더에 카드 이미지 생성됨
```

카드 템플릿만 빠르게 미리보고 싶다면:

```bash
node scripts/render-sample.js gray   # gray / blue / square
```

### 5. 자동 게시 활성화

이 브랜치를 저장소의 기본 브랜치(main/master)에 병합하세요. GitHub Actions의 `schedule`
트리거는 **기본 브랜치의 워크플로 파일만** 실행하기 때문에, 병합 전까지는 자동 실행되지 않습니다.
그 전까지는 **Actions 탭 → 카드뉴스 하루 3회 자동 게시 → Run workflow** 로 수동 테스트할 수 있습니다.

## 폴더 구조

```
src/
  index.js              메인 실행 스크립트 (1회 실행 = 1개 게시)
  queue.js              소재 큐 + 트렌드 자동 발굴
  compliance/           쿠팡 파트너스 / AI 생성물 의무 표시 문구 (문구의 유일한 출처)
  content-source/       유튜브/링크/주제 → Gemini 입력으로 변환
  generator/gemini.js   Gemini API 호출 + 카드 데이터 변환
  render/               satori 기반 카드 이미지 렌더러 + 템플릿 3종
  publish/              인스타그램 / 스레드 게시, 이미지 공개 호스팅
data/
  queue.json            소재 큐 (직접 편집)
  topics-config.json    자동 발굴용 카테고리 목록 (직접 편집)
  history.json          게시 기록 / 중복 방지용 로그
test/
  disclosure.test.js         표시 문구 규칙 테스트
  publish-disclosure.test.js 실제 게시 요청에 문구가 담기는지 검증
scripts/
  disclosure.js         수동 게시용 표시 문구 CLI
docs/
  coupang-partners-disclosure.md  채널별 적용 / 다른 프로젝트 이식 가이드
.github/workflows/
  post-3x-daily.yml     하루 3회 cron 실행 (게시 전 npm test 로 문구 규칙 확인)
  refresh-tokens.yml    60일 토큰 자동 갱신 (주 1회)
```

## 쿠팡 파트너스 / AI 생성물 의무 표시 문구

쿠팡 파트너스 링크나 AI로 만든 이미지·가상인물이 들어간 게시물에는 **채널과 관계없이**
아래 두 줄이 반드시 들어갑니다.

```
(긴급공지) 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
광고, 인공지능(AI)을 기반으로 생성된 가상인물이 포함된 게시물입니다
```

- 인스타그램·스레드 자동 게시는 **코드에서 자동으로** 붙입니다 (`src/compliance/disclosure.js`).
  캡션에 문구가 없으면 게시 API를 호출하지 않고 에러로 중단됩니다.
- 길이 제한(인스타 2200자 / 스레드 500자)에 걸리면 표시 문구가 아니라 본문이 줄어듭니다.
- 이미 문구가 들어있는 본문에는 다시 붙지 않습니다(중복 방지).

네이버 블로그, 쿠팡 쇼핑처럼 **직접 손으로 올리는 채널**은 아래 명령으로 문구를 받아 쓰세요.

```bash
npm run disclosure                          # 문구 2줄만 출력 (복사용)
node scripts/disclosure.js 초안.txt          # 초안 뒤에 문구를 붙여서 출력
node scripts/disclosure.js 초안.txt --start  # 초안 맨 앞에 붙여서 출력 (블로그 권장)
node scripts/disclosure.js 초안.txt --check  # 문구가 빠졌는지 검사
```

다른 프로젝트에도 똑같이 적용하는 방법(전역 `~/.claude/CLAUDE.md` 설정 포함)은
[`docs/coupang-partners-disclosure.md`](docs/coupang-partners-disclosure.md) 를 보세요.

## 참고 사항

- 매 실행은 **게시물 1개**를 만듭니다. 하루 3개는 워크플로가 하루 3번 실행되기 때문입니다.
- 인스타그램/스레드 장기 토큰은 60일 후 만료됩니다. `GH_PAT` 를 등록해두면 매주 자동 갱신됩니다.
- Instagram Graph API는 이미지가 "공개 URL"이어야 하므로, 렌더링한 이미지를 저장소 `public/media/`
  아래에 커밋하고 `raw.githubusercontent.com` 링크로 사용합니다. 저장소가 계속 커지는 게
  싫다면 나중에 별도 이미지 호스팅(예: Cloudinary, Supabase Storage)으로 바꿀 수 있습니다.
