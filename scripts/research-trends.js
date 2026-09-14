// 인스타그램 현장 조사를 돌려 data/trends.json 을 갱신한다.
//
//   APIFY_TOKEN=... node scripts/research-trends.js            실제 수집 (주 1회 워크플로가 이걸 실행)
//   node scripts/research-trends.js --from-sample              저장된 실측 표본으로 분석만 (키 불필요)
//
// 조사할 해시태그는 data/topics-config.json 의 researchHashtags 에서 가져온다.
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchHashtagPosts, analyzePosts } from "../src/research/trend-research.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const readJson = (name) => JSON.parse(readFileSync(path.join(DATA_DIR, name), "utf-8"));

const fromSample = process.argv.includes("--from-sample");
const config = readJson("topics-config.json");
const tags = config.researchHashtags || [];

let posts;
if (fromSample) {
  posts = readJson("trends-sample.json").posts;
  console.log(`저장된 표본 ${posts.length}건으로 분석합니다.`);
} else {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error("APIFY_TOKEN 이 없습니다. 키 없이 돌려보려면 --from-sample 을 붙이세요.");
    process.exit(1);
  }
  if (!tags.length) {
    console.error("data/topics-config.json 의 researchHashtags 가 비어 있습니다.");
    process.exit(1);
  }
  console.log(`조사할 해시태그: ${tags.join(", ")}`);
  posts = await fetchHashtagPosts(tags, { token, perTag: config.researchPerTag || 20 });
  console.log(`${posts.length}건 수집 완료.`);
}

if (!posts.length) {
  console.error("수집된 게시물이 없습니다. 해시태그가 비공개이거나 차단됐을 수 있습니다.");
  process.exit(1);
}

const trends = analyzePosts(posts, { seedTags: tags });
writeFileSync(path.join(DATA_DIR, "trends.json"), JSON.stringify(trends, null, 2) + "\n");

console.log(`\n표본 ${trends.sampledPosts}건 / 태그 ${trends.sampledTags.join(", ")}`);
console.log(`해시태그 계층 — 대형 ${trends.hashtagTiers.large.length} / 중형 ${trends.hashtagTiers.medium.length} / 니치 ${trends.hashtagTiers.niche.length}`);
console.log("첫 줄 후킹 분포:");
for (const h of trends.hookPatterns) console.log(`  ${h.label.padEnd(8)} ${h.posts}건`);
console.log(`해시태그 중앙값 ${trends.captionNorms.medianHashtagCount}개 · 저장 유도 ${Math.round(trends.captionNorms.saveLineRate * 100)}% · 댓글 유도 ${Math.round(trends.captionNorms.commentGateRate * 100)}%`);
console.log(`벤치마크 후보: ${trends.benchmarkAccounts.map((a) => "@" + a.username).join(", ") || "없음"}`);
console.log("\ndata/trends.json 갱신 완료.");
