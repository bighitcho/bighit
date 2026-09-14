// Apify 인스타그램 스크레이퍼로 벤치마크 계정/해시태그의 반응 좋은 게시물을 조사한다.
//
// 왜 Apify인가: 내 인스타 계정으로 로그인해 긁는 방식(쿠키 스크래핑)은 계정이 그대로 노출되고
// '승인되지 않은 도구' 로 분류될 위험이 있다. Apify는 자체 인프라로 공개 데이터만 가져오므로
// 내 계정이 관여하지 않는다.
//
// 주의: 남의 캡션을 가져다 쓰지 않는다. 여기서 뽑는 건 "요즘 이 주제가 반응이 좋다"는 신호(주제·해시태그)뿐이고,
// 원고는 항상 우리가 처음부터 쓴다. (저작권 — 커뮤니티 가이드라인 2)
const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR = "apify~instagram-scraper";

/** 무료 크레딧(월 5달러)을 아끼기 위한 기본 상한. 필요하면 topics-config 에서 올린다. */
const DEFAULT_RESULTS_LIMIT = 30;

async function runActor(input, token, timeoutMs) {
  const url = `${APIFY_BASE}/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=${Math.round(timeoutMs / 1000)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Apify 액터 실행 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

function engagementOf(post) {
  return (post.likesCount || 0) + (post.commentsCount || 0) * 3 + (post.videoPlayCount || 0) * 0.01;
}

/** 캡션에서 주제 힌트만 뽑는다. 문장을 그대로 쓰지 않고 첫 줄을 짧게 자른 '주제어'로만 쓴다. */
function toTopicSeed(post) {
  const firstLine = String(post.caption || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length >= 6 && !l.startsWith("#"));
  if (!firstLine) return null;
  return firstLine.replace(/#[^\s#]+/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * 벤치마크 계정/해시태그에서 반응 좋은 게시물을 모아 정렬해 돌려준다.
 * @param {{benchmarkAccounts?: string[], benchmarkHashtags?: string[], resultsLimit?: number}} config
 * @param {{token: string, timeoutMs?: number}} opts
 */
export async function fetchBenchmarkPosts(config, opts) {
  const resultsLimit = config.resultsLimit || DEFAULT_RESULTS_LIMIT;
  const timeoutMs = opts.timeoutMs || 180000;
  const input = {
    resultsType: "posts",
    resultsLimit,
    addParentData: false,
  };

  const accounts = config.benchmarkAccounts || [];
  const hashtags = config.benchmarkHashtags || [];
  if (accounts.length) input.directUrls = accounts.map((a) => `https://www.instagram.com/${a.replace(/^@/, "")}/`);
  if (hashtags.length) input.search = hashtags.map((h) => h.replace(/^#/, "")).join(" ");
  if (!input.directUrls && !input.search) return [];

  const items = await runActor(input, opts.token, timeoutMs);
  return (Array.isArray(items) ? items : [])
    .filter((p) => p && (p.caption || p.hashtags?.length))
    .map((p) => ({
      url: p.url || p.postUrl || null,
      ownerUsername: p.ownerUsername || null,
      likes: p.likesCount || 0,
      comments: p.commentsCount || 0,
      plays: p.videoPlayCount || 0,
      hashtags: p.hashtags || [],
      timestamp: p.timestamp || null,
      engagement: engagementOf(p),
      topicSeed: toTopicSeed(p),
    }))
    .sort((a, b) => b.engagement - a.engagement);
}

/**
 * 큐가 비었을 때 인스타 트렌드에서 다음 소재를 찾는다.
 * APIFY_TOKEN 이 없거나 실패하면 null 을 돌려주고, 호출부가 구글 뉴스로 넘어간다.
 * @returns {Promise<{item: {type: "topic", value: string, reference: string|null}} | null>}
 */
export async function discoverInstagramTopic(config, history, token) {
  if (!token) return null;

  try {
    const posts = await fetchBenchmarkPosts(config, { token });
    const used = new Set(history.postedTopicKeys || []);
    const fresh = posts.find((p) => p.topicSeed && !used.has(p.topicSeed) && !used.has(p.url));
    if (!fresh) return null;

    return {
      item: {
        type: "topic",
        value: fresh.topicSeed,
        reference: fresh.url,
      },
    };
  } catch (err) {
    console.log("   Apify 트렌드 조사 건너뜀:", err.message.split("\n")[0]);
    return null;
  }
}
