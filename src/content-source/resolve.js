// 큐 아이템(youtube/link/topic)을 Gemini에게 넘길 프롬프트 컨텍스트로 변환한다.

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {{type: "youtube"|"link"|"topic", value: string}} item
 * @returns {Promise<{kind: string, sourceLabel: string, youtubeUrl?: string, text?: string}>}
 */
export async function resolveContentSource(item) {
  if (item.type === "youtube") {
    return { kind: "youtube", sourceLabel: item.value, youtubeUrl: item.value };
  }

  if (item.type === "link") {
    const res = await fetch(item.value, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CardNewsBot/1.0)" },
    });
    if (!res.ok) throw new Error(`링크 가져오기 실패 (${res.status}): ${item.value}`);
    const html = await res.text();
    const text = stripHtml(html).slice(0, 8000);
    return { kind: "link", sourceLabel: item.value, text };
  }

  // topic
  return { kind: "topic", sourceLabel: item.value, text: item.value };
}
