# 쿠팡 파트너스 / AI 생성물 의무 표시 문구 가이드

## 1. 반드시 들어가야 하는 문구

```
(긴급공지) 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
광고, 인공지능(AI)을 기반으로 생성된 가상인물이 포함된 게시물입니다
```

- 쿠팡 파트너스 링크가 하나라도 들어간 게시물 → 첫 번째 줄 필수
- AI로 만든 이미지·영상·가상인물이 들어간 게시물 → 두 번째 줄 필수
- 이 저장소처럼 둘 다 해당되는 워크플로 → **두 줄 모두** 필수

## 2. 채널별 적용 방법

| 채널 | 넣는 위치 | 방법 |
|---|---|---|
| 인스타그램 | 캡션 끝 | 자동 (`src/publish/instagram.js`) |
| 스레드(Threads) | 본문 끝 | 자동 (`src/publish/threads.js`) |
| 네이버 블로그 | 본문 맨 위 또는 맨 아래 | `node scripts/disclosure.js 초안.txt` 결과 복사 |
| 네이버 카페 | 본문 맨 아래 | 위와 동일 |
| 쿠팡 쇼핑 / 체험단 후기 | 본문 맨 아래 | 위와 동일 |
| 유튜브 | 설명란 첫 줄 | `node scripts/disclosure.js 초안.txt --channel youtube` |
| 그 외 새 채널 | 본문 안 | 아래 3번대로 코드에 연결 |

네이버 블로그처럼 사람이 직접 올리는 채널은 **본문 맨 위**에 넣는 쪽이 안전하다.
"더보기"에 가려지면 고지로 인정받지 못할 수 있기 때문이다. `--start` 옵션을 쓰면 맨 앞에 붙여준다.

```bash
node scripts/disclosure.js 초안.txt --start
```

## 3. 새 게시 코드를 만들 때

문구를 문자열 리터럴로 복사하지 말고 항상 모듈을 쓴다.

```js
import { withDisclosure, assertDisclosure } from "../compliance/disclosure.js";

export async function publishSomewhere(body, opts) {
  // 1) 빠진 문구를 채운다 (이미 있으면 그대로 — 여러 번 호출해도 중복되지 않음)
  const safeBody = withDisclosure(body, { channel: "naverBlog" });
  // 2) 그래도 없으면 게시하지 않고 실패시킨다
  assertDisclosure(safeBody, "네이버 블로그 본문");

  await callApi({ text: safeBody, ...opts });
}
```

### API 요약 (`src/compliance/disclosure.js`)

| 함수 / 상수 | 설명 |
|---|---|
| `COUPANG_PARTNERS_NOTICE` | 쿠팡 파트너스 고지 한 줄 |
| `AI_VIRTUAL_PERSON_NOTICE` | AI 가상인물 고지 한 줄 |
| `DISCLOSURE_BLOCK` | 두 줄을 합친 블록 |
| `withDisclosure(text, opts)` | 빠진 문구만 붙여서 반환 (멱등). `opts`: `channel`, `limit`, `position`, `separator` |
| `hasDisclosure(text)` | 두 문구가 모두 있는지 |
| `missingNotices(text)` | 빠진 문구 배열 |
| `assertDisclosure(text, label)` | 빠지면 예외 — 게시 직전 마지막 방어선 |
| `CHANNEL_LIMITS` | 채널별 본문 길이 제한 (`instagram: 2200`, `threads: 500` 등) |

길이 제한이 있는 채널에서는 **표시 문구를 절대 자르지 않고 본문을 줄인다.**
새 채널을 추가하면 `CHANNEL_LIMITS` 에 한 줄 넣어주면 된다.

띄어쓰기가 다르거나 `(긴급공지)` 가 빠진 표기도 "이미 있는 것"으로 인정하므로,
사람이 직접 써 넣은 본문에 문구가 두 번 붙는 일은 없다.

## 4. 다른 프로젝트에도 똑같이 적용하려면

### (a) Node 프로젝트

`src/compliance/disclosure.js` 파일 하나만 복사해 가면 된다. 의존성이 없다.
`test/disclosure.test.js` 까지 같이 복사하면 규칙이 깨졌을 때 테스트가 잡아준다.

### (b) 어떤 프로젝트에서든 Claude가 기억하게 하기

이 저장소에는 `CLAUDE.md` 에 규칙이 들어 있어서, 이 폴더에서 여는 창은 자동으로 규칙을 읽는다.
**모든 프로젝트/모든 창**에 적용하려면 아래 내용을 `~/.claude/CLAUDE.md` 에 넣어두면 된다
(파일이 없으면 새로 만들면 되고, 이미 있으면 맨 아래에 덧붙이면 된다).

```markdown
## 쿠팡 파트너스 게시물 필수 표시 (모든 프로젝트 공통)

쿠팡 파트너스 링크가 들어가거나 AI 생성 이미지·가상인물이 들어간 게시물을 만들 때는,
채널(인스타그램, 스레드, 네이버 블로그, 네이버 카페, 쿠팡 쇼핑, 유튜브 등)과 관계없이
본문에 아래 두 줄을 반드시 포함시킨다. 물어보지 말고 항상 넣는다.

(긴급공지) 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
광고, 인공지능(AI)을 기반으로 생성된 가상인물이 포함된 게시물입니다

- 게시 코드를 쓸 때는 API 호출 직전에 문구 포함 여부를 검사해서, 없으면 게시하지 말고 실패시킨다.
- 길이 제한에 걸리면 표시 문구가 아니라 본문을 줄인다.
- 이 문구를 빼거나 선택 사항으로 만드는 코드는 작성하지 않는다.
```

터미널에서 한 번에 추가하려면:

```bash
mkdir -p ~/.claude
sed -n '/^## 쿠팡 파트너스 게시물 필수 표시/,/^```$/p' docs/coupang-partners-disclosure.md | sed '$d' >> ~/.claude/CLAUDE.md
```

## 5. 확인 방법

```bash
npm test                                   # 표시 문구 규칙 테스트 12개
node scripts/disclosure.js 초안.txt --check  # 초안에 문구가 있는지 검사
```

게시 코드가 문구 없이 API를 호출하면 `assertDisclosure` 가 예외를 던져 게시가 중단된다.
GitHub Actions 로그에 `의무 표시 문구가 없습니다` 가 찍히면 그 경우다.
