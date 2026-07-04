import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "..", "data", "topics-config.json");

function loadCategories() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  return config.categories || ["경제"];
}

function decodeEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseRssItems(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of itemBlocks) {
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    if (titleMatch && linkMatch) {
      items.push({
        title: decodeEntities(titleMatch[1].trim()),
        link: linkMatch[1].trim(),
      });
    }
  }
  return items;
}

/**
 * 큐가 비었을 때 자동으로 소재를 발굴한다. 구글 뉴스 RSS(키 불필요)를 사용해
 * data/topics-config.json 의 카테고리를 순환하며 아직 다루지 않은 기사를 하나 찾는다.
 * @param {{lastTrendCategoryIndex: number, postedTopicKeys: string[]}} history
 * @returns {Promise<{item: {type: "link", value: string, title: string}, nextCategoryIndex: number} | null>}
 */
export async function discoverTrendingTopic(history) {
  const categories = loadCategories();
  const startIndex = (history.lastTrendCategoryIndex + 1) % categories.length;

  for (let offset = 0; offset < categories.length; offset++) {
    const idx = (startIndex + offset) % categories.length;
    const category = categories[idx];
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(category)}&hl=ko&gl=KR&ceid=KR:ko`;

    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CardNewsBot/1.0)" } });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRssItems(xml);

      const fresh = items.find((it) => !history.postedTopicKeys.includes(it.link));
      if (fresh) {
        return {
          item: { type: "link", value: fresh.link, title: fresh.title },
          nextCategoryIndex: idx,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}
