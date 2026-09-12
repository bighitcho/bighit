// 이미 만들어진 원고(out/<runId>/deck.json)를 다시 검수한다.
// 사용법: node scripts/lint-deck.js out/2026-09-12T.../deck.json
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { reviewDeck, printReview } from "../src/quality/checklist.js";
import { CONTENT_GOALS, HOOK_TYPES, PERSUASION_PRINCIPLES } from "../src/strategy/rotation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2];
if (!target) {
  console.error("검수할 deck.json 경로를 넘겨주세요. 예: node scripts/lint-deck.js out/latest/deck.json");
  process.exit(1);
}

const brand = JSON.parse(readFileSync(path.join(__dirname, "..", "data", "brand-config.json"), "utf-8"));
const deck = JSON.parse(readFileSync(target, "utf-8"));

// deck.json 에 기록된 전략을 복원한다(없으면 기본값).
const plan = {
  goal: CONTENT_GOALS.find((g) => g.key === deck.strategy?.goal) || CONTENT_GOALS[0],
  hook: HOOK_TYPES.find((h) => h.key === deck.strategy?.hookType) || HOOK_TYPES[0],
  principle: PERSUASION_PRINCIPLES.find((p) => p.key === deck.strategy?.principle) || PERSUASION_PRINCIPLES[0],
};

const review = reviewDeck(deck, brand, plan);
console.log(`${target} — 목적: ${plan.goal.label}`);
printReview(review);
process.exit(review.errors.length ? 1 : 0);
