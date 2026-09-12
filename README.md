# 인스타그램 카드뉴스 자동화 봇

유튜브 링크 / 일반 웹 링크 / 주제어를 넣으면 Gemini가 카드뉴스 원고를 만들고,
**발행 전 체크리스트 30을 자동으로 검수한 뒤** 카드 이미지를 렌더링해 인스타그램과 스레드에 게시합니다.
GitHub Actions로 **하루 3번 자동 실행**됩니다.

## 동작 방식

1. **이번 게시물의 전략을 정합니다** — 4:3:2:1 비율(도달형 4 / 저장형 3 / 공감형 2 / 전환형 1)에서
   가장 뒤처진 유형을 고르고, 후킹 유형 5가지와 설득 원리를 돌려씁니다
2. `data/queue.json` 의 소재를 순서대로 사용합니다. 큐가 비면 인스타 벤치마크 계정 트렌드(Apify) →
   구글 뉴스 순으로 새 소재를 발굴합니다
3. Gemini로 **10장 5막 구조** 원고를 만듭니다 (표지 1 + 본문 7 + 요약 1 + CTA 1)
4. **자동 검수**에서 위반이 나오면 위반 목록을 돌려주며 다시 쓰게 합니다 (최대 3회, 끝내 실패하면 게시 안 함)
5. `satori` + `resvg`로 4:5(1080×1350) PNG 10장을 렌더링합니다
6. 이미지를 저장소에 커밋해 공개 URL로 만들고, 인스타그램 캐러셀 + 스레드에 게시합니다
7. 24시간 뒤 도달·저장·공유를 수집해 어떤 전략이 먹혔는지 집계합니다

## 이 봇이 자동으로 지키는 것

| | 내용 |
|---|---|
| 구조 | 10장 5막 구조 (후킹 → 문제 압력 → 증거 → 반전 → 저장 장치), 요약 슬라이드, CTA 1개 |
| 비주얼 | 4:5 캔버스, 최소 폰트 28px, 악센트 컬러 1개, 그라디언트·장식 아이콘 없음 |
| 카피 | 영어 약어·이모지·단정 표현·제작 메타 정보 차단, 제목 마침표 금지, 슬라이드당 어절 30개 이내 |
| 캡션 | 첫 줄 후킹(표지와 다른 후킹) → 본문 → 저장 유도 → 질문 → CTA → 해시태그 순서로 조립 |
| 해시태그 | 5~10개, 대형 2 + 중형 3 + 니치 2~5 3계층 믹스 |
| 계정 안전 | 하루 게시 상한·최소 간격, 공식 API만 사용, 민감 주제 면책 문구 자동 삽입 |

전체 매핑은 [docs/instagram-checklist-30.md](docs/instagram-checklist-30.md) 에 있습니다.
운영 전략(콘텐츠 비율, DM 깔때기, 계정 정지 예방)은 [docs/operations-playbook.md](docs/operations-playbook.md) 를 보세요.

## 시작하기

### 1. 계정 설정 채우기 — `data/brand-config.json`

콘텐츠 규칙의 단일 소스입니다. 프롬프트·검수기·캡션 조립이 전부 이 파일을 읽습니다.

```jsonc
{
  "account": {
    "handle": "@내계정",
    "profileKeyword": "직장인 부업",       // 캡션 앞부분에 자동으로 들어가는 검색 키워드
    "target": "퇴근 후 부업을 준비하는 30~40대 직장인"
  },
  "cta": {
    "commentKeyword": "자료",              // 댓글 → 자동 DM 트리거
    "freeResource": "1주일 콘텐츠 기획 체크리스트"
  },
  "hashtags": { "large": [...], "medium": [...], "niche": [...] }
}
```

### 2. GitHub Secrets 등록

**Settings → Secrets and variables → Actions → New repository secret**

| Secret 이름 | 설명 |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio에서 발급한 Gemini API 키 |
| `META_APP_ID` / `META_APP_SECRET` | Meta for Developers 앱의 App ID / Secret |
| `IG_LONG_LIVED_TOKEN` | 인스타그램 60일 장기 액세스 토큰 |
| `IG_BUSINESS_ACCOUNT_ID` | 게시할 인스타그램 비즈니스 계정 ID |
| `IG_HANDLE` | 카드 하단에 표시할 계정 핸들 (예: `@my_instagram`) |
| `THREADS_LONG_LIVED_TOKEN` | 스레드 60일 장기 액세스 토큰 |
| `THREADS_USER_ID` | 스레드 사용자 ID |
| `APIFY_TOKEN` *(선택)* | 인스타 트렌드 소재 발굴용 (무료 플랜 월 5달러 크레딧) |
| `GH_PAT` *(선택)* | 토큰 자동 갱신용 `repo` 스코프 PAT |

**Variables** 탭에는 선택적으로:

| Variable | 설명 | 기본값 |
|---|---|---|
| `CARD_THEME` | `gray` / `blue` / `amber` (모두 4:5) | `gray` |
| `DRY_RUN` | `true`면 게시 없이 이미지 생성까지만 | `false` |
| `POST_STORY` | `true`면 발행 직후 표지를 스토리에도 리포스트 | `false` |
| `COMMENT_DM_ENABLED` | `true`면 댓글 키워드 → 자동 DM 실행 | `false` |
| `IG_LOCATION_ID` | 위치 태그로 쓸 장소 페이지 ID | 없음 |

### 3. 소재 큐 채우기

`data/queue.json` 을 직접 수정합니다.

```json
[
  { "id": "1", "type": "youtube", "value": "https://www.youtube.com/watch?v=xxxx", "used": false },
  { "id": "2", "type": "link", "value": "https://example.com/article", "used": false },
  { "id": "3", "type": "topic", "value": "아침 공복에 마시면 좋은 습관 5가지", "used": false }
]
```

큐를 다 쓰면 `data/topics-config.json` 의 벤치마크 계정(Apify) → 카테고리별 구글 뉴스 순으로 자동 발굴합니다.

### 4. 로컬 테스트

```bash
npm install
npm run check          # API 키 없이 전략 → 자동 검수 → 카드 10장 렌더까지 확인
```

`./out/sample/` 에 카드 10장과 `deck.json` 이 생깁니다. 실제 파이프라인을 돌리려면:

```bash
cp .env.example .env   # GEMINI_API_KEY 입력, DRY_RUN=true 유지
npm run run-once
```

### 5. 자동 게시 활성화

이 브랜치를 기본 브랜치(main/master)에 병합하세요. GitHub Actions의 `schedule` 트리거는
**기본 브랜치의 워크플로 파일만** 실행합니다. 그 전까지는 Actions 탭에서 수동 실행으로 테스트할 수 있습니다.

## 명령어

| 명령 | 설명 |
|---|---|
| `npm run check` | 샘플 원고로 전략 → 검수 → 렌더 전 구간 점검 (API 키 불필요) |
| `npm run run-once` | 실제 파이프라인 1회 실행 |
| `npm run render-sample -- blue` | 테마별 카드 미리보기 |
| `npm run lint-deck out/<runId>/deck.json` | 이미 만든 원고 재검수 |
| `npm run comment-dm` | 댓글 키워드 → 자동 DM 1회 실행 |
| `npm run insights` | 24시간 지난 게시물의 도달·저장·공유 수집 및 집계 |
| `npm run trend-report` | Apify로 벤치마크 계정 반응 조사 |

## 폴더 구조

```
src/
  index.js              파이프라인 (전략 → 소재 → 생성/검수 → 렌더 → 게시 → 기록)
  strategy/rotation.js  4:3:2:1 목적 배분 + 후킹/설득 원리 로테이션
  queue.js              소재 큐 → 인스타 트렌드 → 구글 뉴스
  content-source/       유튜브/링크/주제 해석, 구글 뉴스·Apify 트렌드 발굴
  generator/gemini.js   프롬프트·스키마·캡션 조립
  quality/checklist.js  발행 전 자동 검수 (위반 시 게시 차단)
  render/               satori 카드 렌더러 + 템플릿 3종 (모두 4:5)
  publish/              인스타 캐러셀 / 스토리 / 스레드 게시, 이미지 공개 호스팅
data/
  brand-config.json     계정 키워드·CTA·해시태그·금칙어·발행 상한
  queue.json            소재 큐 (직접 편집)
  topics-config.json    자동 발굴 설정 (벤치마크 계정 + 뉴스 카테고리)
  dm-templates.json     댓글 키워드별 DM 문구
  history.json          게시 기록 + 전략 + 성과 지표
  insights.json         유형별 성과 집계
scripts/
  render-sample.js      로컬 점검
  lint-deck.js          원고 재검수
  comment-to-dm.js      댓글 → 자동 DM
  insights.js           24시간 후 성과 수집
  trend-report.js       Apify 벤치마크 조사
  refresh-tokens.js     60일 토큰 갱신
.github/workflows/
  post-3x-daily.yml     하루 3회 게시
  comment-to-dm.yml     1시간마다 댓글 확인 → DM
  insights.yml          매일 성과 수집
  refresh-tokens.yml    주 1회 토큰 갱신
```

## 참고 사항

- 매 실행은 **게시물 1개**를 만듭니다. 하루 3개는 워크플로가 하루 3번 실행되기 때문입니다.
- 인스타그램 캐러셀은 이미지 10장이 상한이라, "10장 + CTA 1장" 대신 CTA를 10번째 장에 넣습니다.
- 인스타그램/스레드 장기 토큰은 60일 후 만료됩니다. `GH_PAT` 를 등록해두면 매주 자동 갱신됩니다.
- Instagram Graph API는 이미지가 "공개 URL"이어야 하므로, 렌더링한 이미지를 저장소 `public/media/`
  아래에 커밋하고 `raw.githubusercontent.com` 링크로 사용합니다. 저장소가 커지는 게 싫다면
  나중에 별도 이미지 호스팅(Cloudinary, Supabase Storage 등)으로 바꿀 수 있습니다.
- 댓글 → 자동 DM은 메타 공식 API(비공개 답장)만 사용합니다. 비공인 자동화 앱은 계정 정지의 가장 흔한 원인입니다.
- 코딩 에이전트로 이 저장소를 고칠 때는 [CLAUDE.md](CLAUDE.md) 를 먼저 읽어주세요.
