# 인스타그램 카드뉴스 자동화 봇 — 작업 맥락

이 파일은 Claude Code가 세션마다 처음부터 파악하지 않도록 프로젝트 규칙·스택·제약을 한곳에 모아둔 것이다.
새로 알게 된 사실(특히 API 제약과 디버깅으로 확인한 것)은 대화에 남기지 말고 여기에 적는다. 다음 세션은 대화를 기억하지 못한다.

## 이 저장소가 하는 일

유튜브 링크 / 웹 링크 / 주제어를 받아 Gemini로 카드뉴스 원고를 만들고, satori+resvg로 PNG 10장을 렌더링해
인스타그램 캐러셀과 스레드에 자동 게시한다. GitHub Actions가 하루 3회 돌린다. 서버는 없다.

## 스택

- Node 20+, ESM (`"type": "module"`). TypeScript 아님. 빌드 단계 없음.
- 의존성 3개뿐: `satori`(HTML 트리 → SVG), `@resvg/resvg-js`(SVG → PNG), `libsodium-wrappers`(Actions 시크릿 암호화).
  새 의존성은 꼭 필요할 때만 추가한다. Actions에서 `npm ci` 로 매번 새로 설치되므로 무거운 패키지는 실행 시간을 늘린다.
- 외부 API: Gemini(생성), Instagram Graph API, Threads API, Apify(선택, 트렌드 조사).

## 실행 경로

| 명령 | 하는 일 |
|---|---|
| `npm run check` | API 키 없이 샘플 원고로 전략→검수→렌더까지 전부 돌려본다. **코드 고친 뒤 항상 이것부터 실행한다.** |
| `npm run run-once` | 실제 파이프라인 1회 (DRY_RUN=true면 게시 직전까지) |
| `npm run lint-deck out/<runId>/deck.json` | 이미 만든 원고 재검수 |
| `npm run comment-dm` | 댓글 키워드 → 자동 DM |
| `npm run insights` | 24시간 지난 게시물의 도달·저장·공유 수집 |
| `npm run trend-report` | Apify로 벤치마크 계정 반응 조사 |

## 구조

```
src/
  index.js              파이프라인 (전략 → 소재 → 생성/검수 → 렌더 → 게시 → 기록)
  strategy/rotation.js  4:3:2:1 목적 배분 + 후킹/설득 원리 로테이션
  generator/gemini.js   프롬프트·스키마·캡션 조립
  quality/checklist.js  발행 전 자동 검수 (여기서 막히면 게시 안 됨)
  render/               satori 슬라이드 트리 + PNG 렌더
  publish/              인스타/스레드/스토리 게시, 이미지 공개 호스팅
  queue.js              소재 큐 → 인스타 트렌드 → 구글 뉴스 순서
data/
  brand-config.json     계정 키워드·CTA·해시태그 3계층·금칙어 (콘텐츠 규칙의 단일 소스)
  queue.json            직접 채우는 소재 큐
  history.json          게시 기록 + 전략 + 성과 지표
  dm-templates.json     댓글 키워드별 DM 문구 (여러 개 = 반복 패턴 방지)
```

## 반드시 지킬 규칙

1. **자동 검수를 우회하지 않는다.** `src/quality/checklist.js` 의 error 는 게시 차단이다.
   통과가 어렵다고 규칙을 끄지 말고, 원고 쪽을 고친다. 규칙 자체를 바꿀 때는 근거(docs/instagram-checklist-30.md)를 같이 고친다.
2. **메타 공식 API만 쓴다.** 쿠키 스크래핑, 비공식 자동화 앱, 팔로워 증대 서비스는 계정 정지 사유다.
3. **남의 콘텐츠를 복사하지 않는다.** Apify에서 가져오는 건 "요즘 이 주제가 반응 좋다"는 신호뿐이고, 문장은 항상 새로 쓴다.
4. **단정·보장 표현 금지.** `brand-config.json` 의 `bannedPhrases` 참고. 광고 규정 위반이자 계정 위험이다.
5. **발행 속도 상한을 낮추지 않는다.** `publishing.maxPostsPerDay` / `minMinutesBetweenPosts` 는 스팸 판정을 피하기 위한 것이다.
6. **콘텐츠 규칙은 `data/brand-config.json` 한 곳에서만 바꾼다.** 프롬프트·검수기·캡션 조립이 전부 이 파일을 읽는다.

## 실측 지식 (디버깅으로 확인한 것 — 추측으로 되돌리지 말 것)

- 인스타그램 캐러셀은 **이미지 10장이 상한**이다. 그래서 "10장 + CTA 1장"이 아니라 표지 1 + 본문 7 + 요약 1 + CTA 1 = 10장 구조를 쓴다.
- Graph API는 **공개 URL로만** 이미지를 받는다. 그래서 렌더 결과를 저장소에 커밋해 `raw.githubusercontent.com` 링크로 넘긴다.
- 비공개 답장(자동 DM)은 **댓글이 달린 지 7일 이내**에만 보낼 수 있다.
- 미디어 인사이트는 계정·미디어 종류에 따라 지원 지표가 다르다. 넓은 집합부터 시도하고 실패하면 줄여 가야 한다(`scripts/insights.js`).
- satori는 CSS 일부만 지원한다. 텍스트 노드를 감싸는 div에는 `display: flex` 가 반드시 있어야 하고, 조건부로 뺄 때는 `display: none` 더미를 넣는다.
- GitHub Actions의 `schedule` 트리거는 **기본 브랜치의 워크플로 파일만** 실행한다. 작업 브랜치에서는 수동 실행으로만 테스트된다.
- 렌더 폰트 크기는 28px 미만이면 렌더러가 예외를 던진다(모바일 가독성 하한).

## 모델 분담 (Claude Code + Codex 같이 쓸 때)

같은 저장소를 두 에이전트가 함께 본다. 설계는 Claude, 반복 구현은 Codex로 나누면 양쪽 요금제가 주중에 안 터진다.

- **Claude에게**: 카드 레이아웃·카피 구조 설계, 체크리스트 규칙 판단, 처음 보는 코드 파악, 사용자에게 보이는 문구.
- **Codex에게**: 기획대로 밀어붙이는 구현, 파일 여러 개 걸친 리팩터링, 테스트 작성, 배포 전 코드 리뷰, 오래 걸리는 작업.

토큰을 아끼려면 기계적인 작업(스키마 필드 추가, 반복 수정)을 Claude에게 시키지 않는다.
Codex 설정은 `.codex/config.toml` 에 있다(루틴 작업은 `reasoning_effort = "medium"`).
