// API 키 없이 도는 자체 점검. 코드를 고친 뒤 `npm test` 로 실행한다.
// 자동 검수기가 "통과시켜야 할 원고는 통과시키고, 막아야 할 원고는 막는지"를 확인한다.
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sampleContent } from "./fixtures/sample-content.js";
import { toDeck, buildHashtags } from "../src/generator/gemini.js";
import { planNextPost, CONTENT_GOALS } from "../src/strategy/rotation.js";
import { reviewDeck } from "../src/quality/checklist.js";
import { resolveTheme, CANVAS } from "../src/render/templates/theme.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brand = JSON.parse(readFileSync(path.join(__dirname, "..", "data", "brand-config.json"), "utf-8"));

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** 샘플 원고를 복제해 한 군데만 망가뜨린다. */
function mutate(fn) {
  const clone = JSON.parse(JSON.stringify(sampleContent));
  fn(clone);
  return clone;
}

function reviewOf(content, plan) {
  return reviewDeck(toDeck(content, { themeName: "gray", brand, plan }), brand, plan);
}

const plan = planNextPost({ posts: [] });
const convertPlan = { ...plan, goal: CONTENT_GOALS.find((g) => g.key === "convert") };

console.log("\n[1] 정상 원고는 통과해야 한다");
const clean = reviewOf(sampleContent, plan);
check("위반 0건", clean.errors.length === 0, clean.errors.join(" / "));
check("경고 0건", clean.warnings.length === 0, clean.warnings.join(" / "));
check("검수 항목 20개 이상 확인", clean.passed.length >= 20, `${clean.passed.length}개`);

console.log("\n[2] 규칙을 어긴 원고는 막아야 한다");
const cases = [
  ["단정·보장 표현", (c) => (c.coreSlides[0].body = "이대로 하면 무조건 성공합니다.")],
  ["영어 약어", (c) => (c.coreSlides[1].body = "월 매출 대비 ROI 를 먼저 계산해보세요.")],
  ["이모지", (c) => (c.headline = "부업 첫 달 🔥")],
  ["제목 마침표", (c) => (c.summarySlide.heading = "첫 달에 이것만 정하세요.")],
  ["제작 메타 정보", (c) => (c.ctaSlide.body = "이 카드는 AI 생성 이미지로 만들었습니다")],
  ["슬라이드 분량 초과", (c) => (c.coreSlides[2].body = "아주 긴 문장 ".repeat(20))],
  ["5막 구조 누락", (c) => c.coreSlides.forEach((s) => (s.act = "문제"))],
  ["요약 슬라이드 부실", (c) => (c.summarySlide.points = ["하나뿐"])],
  ["공유 문장 없음", (c) => (c.shareLine = "")],
  ["캡션 첫 줄이 표지와 동일", (c) => (c.captionFirstLine = c.headline.replace("\n", " "))],
  ["캡션 첫 줄 과다 길이", (c) => (c.captionFirstLine = "가".repeat(90))],
  ["본문 중복", (c) => (c.coreSlides[3].body = c.coreSlides[2].body)],
];

for (const [name, breakIt] of cases) {
  const review = reviewOf(mutate(breakIt), plan);
  check(`${name} 차단`, review.errors.length > 0, "위반으로 잡히지 않았습니다");
}

console.log("\n[3] 민감 주제에는 면책 문구가 자동으로 붙어야 한다");
const sensitive = reviewOf(
  mutate((c) => {
    c.coreSlides[0].body = "투자 상품을 고르기 전에 기간부터 정해보세요.";
  }),
  plan
);
check("면책 문구 삽입 후 통과", sensitive.errors.length === 0, sensitive.errors.join(" / "));

console.log("\n[4] 전환형 게시물은 댓글 키워드 안내가 있어야 한다");
const convertDeck = toDeck(sampleContent, { themeName: "gray", brand, plan: convertPlan });
check("캡션에 댓글 키워드 포함", convertDeck.igCaption.includes(brand.cta.commentKeyword));
check("전환형 검수 통과", reviewDeck(convertDeck, brand, convertPlan).errors.length === 0);

console.log("\n[5] 해시태그는 3계층 5~10개여야 한다");
const tags = buildHashtags(brand, ["#퇴근후40분", "#또다른태그"]);
check("개수 5~10", tags.length >= 5 && tags.length <= 10, `${tags.length}개`);
check("중복 없음", new Set(tags).size === tags.length);
check("모두 # 로 시작", tags.every((t) => t.startsWith("#")));

console.log("\n[6] 모든 테마는 4:5 캔버스여야 한다");
for (const name of ["gray", "blue", "amber", "square", "없는테마"]) {
  const theme = resolveTheme(name);
  check(`${name} → ${theme.width}x${theme.height}`, theme.width === CANVAS.width && theme.height === CANVAS.height);
}

console.log("\n[7] 슬라이드 구성");
const deck = toDeck(sampleContent, { themeName: "gray", brand, plan });
check("10장", deck.slides.length === 10, `${deck.slides.length}장`);
check("1장 표지 / 9장 요약 / 10장 CTA",
  deck.slides[0].type === "cover" && deck.slides[8].type === "summary" && deck.slides[9].type === "cta");
check("표지에 날짜 없음", !("date" in deck.slides[0]));
check("전략 기록됨", Boolean(deck.strategy?.goal && deck.strategy?.hookType));

console.log(failures === 0 ? "\n전체 통과" : `\n실패 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
