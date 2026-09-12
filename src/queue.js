import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { discoverTrendingTopic } from "./content-source/trending.js";
import { discoverInstagramTopic } from "./content-source/apify-trends.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = path.join(__dirname, "..", "data", "queue.json");
const HISTORY_PATH = path.join(__dirname, "..", "data", "history.json");
const TOPICS_CONFIG_PATH = path.join(__dirname, "..", "data", "topics-config.json");

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf-8"));
}
function writeJson(p, data) {
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

export function readHistory() {
  return readJson(HISTORY_PATH);
}

/**
 * 소재를 고르는 순서:
 *   1) data/queue.json 에 직접 채워둔 소재 (항상 우선)
 *   2) 인스타 벤치마크 계정 트렌드 (APIFY_TOKEN 이 있을 때만)
 *   3) 구글 뉴스 RSS 카테고리 순환
 * 이 함수는 파일 갱신(used=true, history 기록)까지 수행한다.
 * @returns {Promise<{type: string, value: string, source: "queue"|"instagram"|"trend"}>}
 */
export async function getNextTopic() {
  const queue = readJson(QUEUE_PATH);
  const history = readJson(HISTORY_PATH);

  const nextIndex = queue.findIndex((it) => !it.used);
  if (nextIndex !== -1) {
    queue[nextIndex].used = true;
    writeJson(QUEUE_PATH, queue);
    return { ...queue[nextIndex], source: "queue" };
  }

  const topicsConfig = readJson(TOPICS_CONFIG_PATH);
  const fromInstagram = await discoverInstagramTopic(topicsConfig, history, process.env.APIFY_TOKEN);
  if (fromInstagram) {
    history.postedTopicKeys.push(fromInstagram.item.value);
    writeJson(HISTORY_PATH, history);
    return { ...fromInstagram.item, source: "instagram" };
  }

  const found = await discoverTrendingTopic(history);
  if (!found) {
    throw new Error("큐도 비어있고 트렌드에서도 새 소재를 찾지 못했습니다. data/queue.json 에 소재를 추가해주세요.");
  }

  history.lastTrendCategoryIndex = found.nextCategoryIndex;
  history.postedTopicKeys.push(found.item.value);
  writeJson(HISTORY_PATH, history);

  return { ...found.item, source: "trend" };
}

export function recordPostResult({ topic, deck, igMediaId, igPermalink, threadsPermalink, review }) {
  const history = readJson(HISTORY_PATH);
  history.posts.push({
    postedAt: new Date().toISOString(),
    source: topic.source,
    topicValue: topic.value,
    headline: deck.slides[0]?.headline || null,
    // 어떤 전략으로 쓴 글인지 남겨둬야 24시간 뒤 인사이트와 대조해 먹히는 유형을 찾을 수 있다.
    contentGoal: deck.strategy?.goal || null,
    hookType: deck.strategy?.hookType || null,
    principle: deck.strategy?.principle || null,
    slideCount: deck.slides.length,
    checklistWarnings: review?.warnings?.length ?? null,
    igMediaId: igMediaId || null,
    igPermalink: igPermalink || null,
    threadsPermalink: threadsPermalink || null,
    insights: null,
  });
  writeJson(HISTORY_PATH, history);
}
