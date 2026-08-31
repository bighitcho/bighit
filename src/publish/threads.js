import { withDisclosure, assertDisclosure } from "../compliance/disclosure.js";

const THREADS_BASE = "https://graph.threads.net/v1.0";

async function postForm(url, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(url, { method: "POST", body });
  const data = await res.json();
  if (!res.ok) throw new Error(`Threads API 오류: ${JSON.stringify(data)}`);
  return data;
}

/**
 * 이미지 URL 배열을 스레드(Threads) 캐러셀 게시물로 발행한다.
 * @param {string[]} imageUrls
 * @param {string} text
 * @param {{token: string, userId: string}} opts
 */
export async function publishThreadsCarousel(imageUrls, text, opts) {
  // 의무 표시 문구는 게시 직전에 한 번 더 보정한다(이미 있으면 그대로).
  const safeText = assertDisclosure(withDisclosure(text, { channel: "threads" }), "스레드 게시글");

  const childIds = [];
  for (const imageUrl of imageUrls) {
    const item = await postForm(`${THREADS_BASE}/${opts.userId}/threads`, {
      media_type: "IMAGE",
      image_url: imageUrl,
      is_carousel_item: "true",
      access_token: opts.token,
    });
    childIds.push(item.id);
  }

  const container = await postForm(`${THREADS_BASE}/${opts.userId}/threads`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    text: safeText,
    access_token: opts.token,
  });

  const published = await postForm(`${THREADS_BASE}/${opts.userId}/threads_publish`, {
    creation_id: container.id,
    access_token: opts.token,
  });

  return { mediaId: published.id };
}
