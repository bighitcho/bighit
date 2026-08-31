# 이 저장소에서 지켜야 할 규칙

## 필수: 쿠팡 파트너스 / AI 생성물 의무 표시 문구

쿠팡 파트너스 링크가 들어가거나 AI로 만든 이미지·가상인물이 들어간 게시물은,
**채널과 관계없이** 본문에 아래 두 줄이 반드시 포함되어야 한다.

```
(긴급공지) 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
광고, 인공지능(AI)을 기반으로 생성된 가상인물이 포함된 게시물입니다
```

적용 대상: 인스타그램, 스레드, 네이버 블로그, 네이버 카페, 쿠팡 쇼핑·체험단 후기,
유튜브 설명란, 티스토리, 그 외 새로 추가되는 모든 채널.

### 코드로 게시할 때

문구를 문자열로 직접 적지 말고 항상 `src/compliance/disclosure.js` 를 쓴다.
문구를 바꿔야 하면 그 파일 한 곳만 고친다.

```js
import { withDisclosure, assertDisclosure } from "./src/compliance/disclosure.js";

const caption = withDisclosure(본문, { channel: "instagram" }); // 이미 있으면 다시 붙이지 않음
assertDisclosure(caption, "인스타그램 캡션");                    // 없으면 게시 대신 에러
```

- 새 게시 함수(`src/publish/*.js`)를 추가하면 **API 호출 직전에** 위 두 줄을 반드시 넣는다.
- 길이 제한이 있는 채널은 `channel` 옵션을 넘긴다. 제한에 걸리면 표시 문구가 아니라 본문이 줄어든다.
- 표시 문구를 지우거나, 선택 사항으로 만들거나, 조건부로 건너뛰는 코드는 넣지 않는다.

### 손으로 올릴 때 (네이버 블로그, 쿠팡 쇼핑 등)

```bash
npm run disclosure                          # 문구 2줄 출력 (복사해서 붙여넣기)
node scripts/disclosure.js 초안.txt          # 초안 뒤에 문구를 붙여서 출력
node scripts/disclosure.js 초안.txt --check  # 문구가 빠졌는지 검사 (빠지면 종료 코드 1)
```

자세한 내용과 다른 프로젝트에 옮기는 방법: `docs/coupang-partners-disclosure.md`

## 변경 후 확인

```bash
npm test        # 표시 문구 규칙 테스트
npm run run-once   # DRY_RUN=true 상태에서 이미지 생성까지만 확인
```
