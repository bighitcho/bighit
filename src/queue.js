import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { discoverTrendingTopic } from "./content-source/trending.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = path.join(__dirname, "..", "data", "queue.json");
const HISTORY_PATH = path.join(__dirname, "..", "data", "history.json");

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf-8"));
}
function writeJson(p, data) {
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

/**
 * 큐에 안 쓴 항목이 있으면 그걸 쓰고, 없으면 트렌드에서 자동 발굴한다 (혼합 방식).
 * 이 함수는 파일을 갱신(used=true, history 기록)까지 수행한다.
 * @returns {Promise<{type: string, value: string, source: "queue"|"trend"}>}
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

  const found = await discoverTrendingTopic(history);
  if (!found) {
    throw new Error("큐도 비어있고 트렌드에서도 새 소재를 찾지 못했습니다. data/queue.json 에 소재를 추가해주세요.");
  }

  history.lastTrendCategoryIndex = found.nextCategoryIndex;
  history.postedTopicKeys.push(found.item.value);
  writeJson(HISTORY_PATH, history);

  return { ...found.item, source: "trend" };
}

export function recordPostResult({ topic, deck, igPermalink, threadsPermalink }) {
  const history = readJson(HISTORY_PATH);
  history.posts.push({
    postedAt: new Date().toISOString(),
    source: topic.source,
    topicValue: topic.value,
    headline: deck.slides[0]?.headline || null,
    igPermalink: igPermalink || null,
    threadsPermalink: threadsPermalink || null,
  });
  writeJson(HISTORY_PATH, history);
}
