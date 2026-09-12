// 샘플 원고로 (1) 전략 로테이션 (2) 자동 검수 (3) 카드 렌더링까지 한 번에 돌려본다.
// 사용법: node scripts/render-sample.js [gray|blue|amber]
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sampleContent } from "./fixtures/sample-content.js";
import { toDeck } from "../src/generator/gemini.js";
import { planNextPost } from "../src/strategy/rotation.js";
import { reviewDeck, printReview } from "../src/quality/checklist.js";
import { renderCardNews } from "../src/render/cardRenderer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brand = JSON.parse(readFileSync(path.join(__dirname, "..", "data", "brand-config.json"), "utf-8"));

const themeName = process.argv[2] || "gray";
const plan = planNextPost({ posts: [] });
console.log(`전략: ${plan.goal.label} / ${plan.hook.label} / ${plan.principle.label}`);

const deck = toDeck(sampleContent, { themeName, brand, plan });
const review = reviewDeck(deck, brand, plan);
printReview(review);

const files = await renderCardNews(deck, "./out/sample");
console.log(`카드 ${files.length}장 생성:`, files.map((f) => path.basename(f)).join(", "));
console.log("\n--- 조립된 캡션 ---\n" + deck.igCaption);

if (review.errors.length) {
  console.error("\n자동 검수 위반이 있어 실패 처리합니다.");
  process.exit(1);
}
