// 벤치마크 계정의 반응 좋은 게시물을 표로 뽑아본다(주 1회 정도 수동 실행 권장).
// 사용법: APIFY_TOKEN=... node scripts/trend-report.js
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchBenchmarkPosts } from "../src/content-source/apify-trends.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(path.join(__dirname, "..", "data", "topics-config.json"), "utf-8"));

const token = process.env.APIFY_TOKEN;
if (!token) {
  console.error("APIFY_TOKEN 이 없습니다. https://apify.com 무료 가입 후 토큰을 넣어주세요.");
  process.exit(1);
}

const posts = await fetchBenchmarkPosts(config, { token });
if (!posts.length) {
  console.log("가져온 게시물이 없습니다. data/topics-config.json 의 benchmarkAccounts 를 확인해주세요.");
  process.exit(0);
}

console.log(`상위 ${Math.min(15, posts.length)}개 (반응 순)\n`);
for (const p of posts.slice(0, 15)) {
  console.log(`좋아요 ${String(p.likes).padStart(6)} | 댓글 ${String(p.comments).padStart(5)} | @${p.ownerUsername || "?"}`);
  console.log(`  주제: ${p.topicSeed || "(캡션 없음)"}`);
  console.log(`  태그: ${(p.hashtags || []).slice(0, 8).map((h) => "#" + h).join(" ")}`);
  console.log(`  ${p.url || ""}\n`);
}

const tagCount = {};
for (const p of posts) for (const h of p.hashtags || []) tagCount[h] = (tagCount[h] || 0) + 1;
const top = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log("자주 쓰인 해시태그:", top.map(([h, c]) => `#${h}(${c})`).join(" "));
