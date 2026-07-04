import { execSync } from "child_process";
import { getNextTopic, recordPostResult } from "./queue.js";
import { resolveContentSource } from "./content-source/resolve.js";
import { generateCardNewsContent, toDeck } from "./generator/gemini.js";
import { renderCardNews } from "./render/cardRenderer.js";
import { publishImages } from "./publish/imageHost.js";
import { publishInstagramCarousel } from "./publish/instagram.js";
import { publishThreadsCarousel } from "./publish/threads.js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name} 가 설정되어 있지 않습니다.`);
  return value;
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

async function main() {
  const dryRun = process.env.DRY_RUN === "true";
  const geminiApiKey = requireEnv("GEMINI_API_KEY");
  const themeName = process.env.CARD_THEME || "gray";
  const handle = process.env.IG_HANDLE || "@my_instagram";

  console.log("1) 다음 소재 가져오는 중...");
  const topic = await getNextTopic();
  console.log(`   -> [${topic.source}] ${topic.type}: ${topic.value}`);

  console.log("2) 소재 콘텐츠 로딩 중...");
  const source = await resolveContentSource(topic);

  console.log("3) Gemini로 카드뉴스 콘텐츠 생성 중...");
  const content = await generateCardNewsContent(source, { apiKey: geminiApiKey });
  const deck = toDeck(content, { themeName, handle });

  console.log("4) 카드 이미지 렌더링 중...");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const files = await renderCardNews(deck, `./out/${runId}`);
  console.log(`   -> ${files.length}장 생성 완료 (./out/${runId})`);

  if (dryRun) {
    console.log("DRY_RUN=true 이므로 게시는 건너뜁니다.");
    commitDataFiles(`chore: 큐 소진 기록 (dry-run, ${runId})`);
    return;
  }

  console.log("5) 이미지를 공개 URL로 호스팅하는 중...");
  const imageUrls = publishImages(files, runId);

  console.log("6) 인스타그램에 게시하는 중...");
  const igToken = requireEnv("IG_LONG_LIVED_TOKEN");
  const igUserId = requireEnv("IG_BUSINESS_ACCOUNT_ID");
  const igResult = await publishInstagramCarousel(imageUrls, deck.igCaption, { token: igToken, igUserId });
  console.log("   -> 인스타그램 게시 완료:", igResult.permalink || igResult.mediaId);

  console.log("7) 스레드(Threads)에 게시하는 중...");
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
    igPermalink: igResult.permalink,
    threadsPermalink: threadsResult.mediaId,
  });
  commitDataFiles(`chore: 게시 기록 업데이트 (${runId})`);

  console.log("완료!");
}

main().catch((err) => {
  console.error("실행 중 오류 발생:", err);
  process.exit(1);
});
