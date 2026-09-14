const GRAPH_BASE = "https://graph.facebook.com/v21.0";

/**
 * 발행 직후 스토리에 표지 카드를 올린다(체크리스트 25).
 * 처음 1시간의 초기 반응이 알고리즘 평가의 핵심이라, 팔로워에게 시드 트래픽을 흘려보내는 용도다.
 * 실패해도 본 게시물은 이미 올라갔으므로 예외를 던지지 않고 null 을 돌려준다.
 *
 * @param {string} imageUrl 공개 접근 가능한 이미지 URL
 * @param {{token: string, igUserId: string}} opts
 */
export async function publishStory(imageUrl, opts) {
  try {
    const create = await fetch(`${GRAPH_BASE}/${opts.igUserId}/media`, {
      method: "POST",
      body: new URLSearchParams({ image_url: imageUrl, media_type: "STORIES", access_token: opts.token }),
    });
    const container = await create.json();
    if (!create.ok) throw new Error(JSON.stringify(container));

    const publish = await fetch(`${GRAPH_BASE}/${opts.igUserId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: container.id, access_token: opts.token }),
    });
    const published = await publish.json();
    if (!publish.ok) throw new Error(JSON.stringify(published));

    return published.id;
  } catch (err) {
    console.log("   스토리 리포스트 실패(본 게시물에는 영향 없음):", String(err.message).slice(0, 200));
    return null;
  }
}
