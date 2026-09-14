const GRAPH_BASE = "https://graph.facebook.com/v21.0";

async function postForm(url, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(url, { method: "POST", body });
  const data = await res.json();
  if (!res.ok) throw new Error(`Instagram Graph API 오류: ${JSON.stringify(data)}`);
  return data;
}

/**
 * 이미지 URL 배열을 인스타그램 캐러셀 게시물로 발행한다.
 * @param {string[]} imageUrls 공개 접근 가능한 이미지 URL (raw.githubusercontent.com 등)
 * @param {string} caption
 * @param {{token: string, igUserId: string, locationId?: string}} opts
 * @returns {Promise<{permalink: string|null, mediaId: string}>}
 */
export async function publishInstagramCarousel(imageUrls, caption, opts) {
  const childIds = [];
  for (const imageUrl of imageUrls) {
    const item = await postForm(`${GRAPH_BASE}/${opts.igUserId}/media`, {
      image_url: imageUrl,
      is_carousel_item: "true",
      access_token: opts.token,
    });
    childIds.push(item.id);
  }

  const containerParams = {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
    access_token: opts.token,
  };
  // 위치 태그를 달면 지역 도달이 붙는다. IG_LOCATION_ID 는 해당 장소의 페이지 ID.
  if (opts.locationId) containerParams.location_id = opts.locationId;

  const container = await postForm(`${GRAPH_BASE}/${opts.igUserId}/media`, containerParams);

  const published = await postForm(`${GRAPH_BASE}/${opts.igUserId}/media_publish`, {
    creation_id: container.id,
    access_token: opts.token,
  });

  let permalink = null;
  try {
    const res = await fetch(`${GRAPH_BASE}/${published.id}?fields=permalink&access_token=${opts.token}`);
    const data = await res.json();
    permalink = data.permalink || null;
  } catch {
    // permalink 조회 실패는 치명적이지 않음
  }

  return { permalink, mediaId: published.id };
}
