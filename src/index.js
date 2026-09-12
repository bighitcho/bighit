import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getNextTopic, recordPostResult, readHistory } from "./queue.js";
import { resolveContentSource } from "./content-source/resolve.js";
import { generateCardNewsContent, toDeck } from "./generator/gemini.js";
import { planNextPost } from "./strategy/rotation.js";
import { reviewDeck, printReview } from "./quality/checklist.js";
import { renderCardNews } from "./render/cardRenderer.js";
import { publishImages } from "./publish/imageHost.js";
import { publishInstagramCarousel } from "./publish/instagram.js";
import { publishStory } from "./publish/story.js";
import { publishThreadsCarousel } from "./publish/threads.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 자동 검수에서 반려되면 위반 내용을 돌려주며 다시 쓰게 한다. 이 횟수를 넘기면 게시하지 않는다.
const MAX_GENERATION_ATTEMPTS = 3;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name} 가 설정되어 있지 않습니다.`);
  return value;
}

function loadBrand() {
  return JSON.parse(readFileSync(path.join(__dirname, "..", "data", "brand-config.json"), "utf-8"));
}

/**
 * 갑작스러운 활동 폭증은 스팸 신호로 잡힌다(커뮤니티 가이드라인 3).
 * 워크플로가 중복 실행되거나 수동 실행이 겹쳐도 하루 상한과 최소 간격을 넘기지 않게 막는다.
 */
function checkRateLimit(history, publishing) {
  const now = Date.now();
  const posts = (history.posts || []).filter((p) => p.postedAt);
  const last24h = posts.filter((p) => now - new Date(p.postedAt).getTime() < 24 * 60 * 60 * 1000);

  if (last24h.length >= publishing.maxPostsPerDay) {
    return `최근 24시간에 이미 ${last24h.length}건 게시했습니다 (상한 ${publishing.maxPostsPerDay}건).`;
  }

  const last = posts[posts.length - 1];
  if (last) {
    const minutesSince = (now - new Date(last.postedAt).getTime()) / 60000;
    if (minutesSince < publishing.minMinutesBetweenPosts) {
      return `직전 게시로부터 ${Math.round(minutesSince)}분 지났습니다 (최소 간격 ${publishing.minMinutesBetweenPosts}분).`;
    }
  }
  return null;
}

function commitDataFiles(message) {
  try {
    execSync(`git config user.name "card-news-bot"`);
    execSync(`git config user.email "card-news-bot@users.noreply.github.com"`);
    execSync(`git add data/queue.json data/history.json`);
    execSync(`git commit -m "${message}"`);
    const branch = process.env.GITHUB_REF_NAME || execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
    execSync(`git push origin HEAD:${branch}`);
  } catch (err) {
    // data/ 변경사항이 없으면 commit이 실패하는데, 정상적인 상황이므로 무시
    console.log("data/ 커밋 스킵:", err.message.split("\n")[0]);
  }
}

/** 자동 검수를 통과할 때까지 다시 쓰게 한다. 끝내 통과 못 하면 게시하지 않는다. */
async function generateApprovedDeck(source, { apiKey, themeName, brand, plan }) {
  let violations = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const content = await generateCardNewsContent(source, { apiKey, brand, plan, violations });
    const deck = toDeck(content, { themeName, brand, plan });
    const review = reviewDeck(deck, brand, plan);

    console.log(`   시도 ${attempt}/${MAX_GENERATION_ATTEMPTS}`);
    printReview(review);

    if (review.errors.length === 0) return { deck, review };
    violations = review.errors;
  }

  throw new Error(
    `자동 검수를 ${MAX_GENERATION_ATTEMPTS}번 통과하지 못해 게시를 중단했습니다.\n마지막 위반:\n- ${violations.join("\n- ")}`
  );
}

async function main() {
  const dryRun = process.env.DRY_RUN === "true";
  const geminiApiKey = requireEnv("GEMINI_API_KEY");
  const brand = loadBrand();
  const themeName = process.env.CARD_THEME || "gray";
  // IG_HANDLE 환경변수가 있으면 그걸 쓰고, 없으면 brand-config 값을 쓴다.
  if (process.env.IG_HANDLE) brand.account.handle = process.env.IG_HANDLE;

  const history = readHistory();

  if (!dryRun) {
    const blocked = checkRateLimit(history, brand.publishing);
    if (blocked) {
      console.log(`게시 상한에 걸려 이번 실행은 건너뜁니다. ${blocked}`);
      return;
    }
  }

  console.log("1) 이번 게시물 전략 결정 중...");
  const plan = planNextPost(history);
  console.log(`   -> ${plan.goal.label} / 후킹 ${plan.hook.label} / 설득 ${plan.principle.label}`);

  console.log("2) 다음 소재 가져오는 중...");
  const topic = await getNextTopic();
  console.log(`   -> [${topic.source}] ${topic.type}: ${topic.value}`);

  console.log("3) 소재 콘텐츠 로딩 중...");
  const source = await resolveContentSource(topic);

  console.log("4) 카드뉴스 원고 생성 + 자동 검수 중...");
  const { deck, review } = await generateApprovedDeck(source, { apiKey: geminiApiKey, themeName, brand, plan });

  console.log("5) 카드 이미지 렌더링 중...");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const files = await renderCardNews(deck, `./out/${runId}`);
  console.log(`   -> ${files.length}장 생성 완료 (./out/${runId})`);

  if (dryRun) {
    console.log("DRY_RUN=true 이므로 게시는 건너뜁니다.");
    commitDataFiles(`chore: 큐 소진 기록 (dry-run, ${runId})`);
    return;
  }

  console.log("6) 이미지를 공개 URL로 호스팅하는 중...");
  const imageUrls = publishImages(files, runId);

  console.log("7) 인스타그램에 게시하는 중...");
  const igToken = requireEnv("IG_LONG_LIVED_TOKEN");
  const igUserId = requireEnv("IG_BUSINESS_ACCOUNT_ID");
  const igResult = await publishInstagramCarousel(imageUrls, deck.igCaption, {
    token: igToken,
    igUserId,
    locationId: process.env.IG_LOCATION_ID || undefined,
  });
  console.log("   -> 인스타그램 게시 완료:", igResult.permalink || igResult.mediaId);

  if (process.env.POST_STORY === "true") {
    console.log("8) 표지 카드를 스토리에 리포스트하는 중...");
    const storyId = await publishStory(imageUrls[0], { token: igToken, igUserId });
    if (storyId) console.log("   -> 스토리 게시 완료:", storyId);
  }

  console.log("9) 스레드(Threads)에 게시하는 중...");
  const threadsToken = requireEnv("THREADS_LONG_LIVED_TOKEN");
  const threadsUserId = requireEnv("THREADS_USER_ID");
  const threadsResult = await publishThreadsCarousel(imageUrls, deck.threadsText, {
    token: threadsToken,
    userId: threadsUserId,
  });
  console.log("   -> 스레드 게시 완료:", threadsResult.mediaId);

  recordPostResult({
    topic,
    deck,
    igMediaId: igResult.mediaId,
    igPermalink: igResult.permalink,
    threadsPermalink: threadsResult.mediaId,
    review,
  });
  commitDataFiles(`chore: 게시 기록 업데이트 (${runId})`);

  console.log("완료!");
}

main().catch((err) => {
  console.error("실행 중 오류 발생:", err);
  process.exit(1);
});
