// 인스타그램에서 지금 반응 좋은 콘텐츠를 조사해 "현장 규칙"을 뽑아낸다.
//
// 사람이 brand-config 에 해시태그를 손으로 채워 넣는 대신, 봇이 매주 직접 긁어와서
// 어떤 태그가 실제로 쓰이는지, 어떤 후킹이 많이 쓰이는지, 저장 유도 문구를 어떤 비율로 쓰는지를
// data/trends.json 에 기록한다. 생성기는 그 파일을 읽어 프롬프트에 반영한다.
//
// 수집은 Apify 공식 인스타그램 스크레이퍼로 한다. 내 계정으로 로그인하지 않으므로
// 계정이 노출되지 않는다(커뮤니티 가이드라인 8 — 승인된 도구만 사용).
// 남의 캡션을 가져다 쓰지 않는다. 여기서 뽑는 건 "형식"과 "주제 신호"뿐이다.

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR = "apify~instagram-scraper";

/** 해시태그 탐색 페이지는 이 형태의 URL로 직접 지정해야 한다. search 파라미터는 한글 태그에서 엉뚱한 걸 물어온다. */
function hashtagUrl(tag) {
  return `https://www.instagram.com/explore/tags/${encodeURIComponent(tag.replace(/^#/, ""))}/`;
}

/**
 * @param {string[]} tags 조사할 해시태그 (# 없이)
 * @param {{token: string, perTag?: number, timeoutMs?: number}} opts
 */
export async function fetchHashtagPosts(tags, opts) {
  const perTag = opts.perTag || 20;
  const timeoutMs = opts.timeoutMs || 180000;
  const url = `${APIFY_BASE}/acts/${ACTOR}/run-sync-get-dataset-items?token=${opts.token}&timeout=${Math.round(timeoutMs / 1000)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      directUrls: tags.map(hashtagUrl),
      resultsType: "posts",
      resultsLimit: perTag,
      addParentData: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Apify 실행 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);

  const items = await res.json();
  return (Array.isArray(items) ? items : [])
    .filter((p) => p && !p.error)
    .map((p) => ({
      username: p.ownerUsername || null,
      tag: decodeURIComponent((p.inputUrl || "").replace(/.*\/tags\/([^/]+)\/?.*/, "$1")) || null,
      hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
      caption: p.caption || "",
      type: p.type || null,
      comments: p.commentsCount || 0,
    }));
}

/** 캡션 첫 줄에서 어떤 후킹 유형을 썼는지 판정한다. 여러 개에 걸리면 전부 센다. */
const HOOK_MATCHERS = [
  { key: "question", label: "질문형", re: /[?？]|까요|나요|하실래|아세요/ },
  { key: "warning", label: "경고·반전형", re: /지\s*마세요|하지\s*마|안\s*됩니다|주의|피하세요|실수|망가|큰일|아까워/ },
  { key: "list", label: "리스트형", re: /\d+\s*(가지|개|단계|위)|TOP\s*\d+|총정리|모음/i },
  { key: "secret", label: "비밀·격차형", re: /아무도|모르면|의외로|사실은|진짜\s*이유|숨은/ },
  { key: "result", label: "결과형", re: /했더니|바뀌|효과|줄었|늘었|차이/ },
];

const SAVE_RE = /저장(해|해두|하고|해서|해\s*두)?/;
const COMMENT_GATE_RE = /댓글(로|에)?\s*(남겨|달아|주세요)/;
const SHARE_RE = /공유|보내주|친구에게|가족.*공유/;

function firstLine(caption) {
  return String(caption || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
}

function countBy(list) {
  const map = new Map();
  for (const item of list) map.set(item, (map.get(item) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
}

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * 수집한 게시물에서 현장 규칙을 뽑는다. 네트워크를 타지 않는 순수 함수라 테스트가 쉽다.
 *
 * 해시태그 계층은 표본 등장 빈도를 규모의 대리 지표로 쓴다.
 * 인스타가 태그별 게시물 수를 더 이상 공개하지 않기 때문이고, 이 한계는 결과에도 표기한다.
 *
 * @param {Array<{username, tag, hashtags, caption, comments}>} posts
 * @param {{seedTags?: string[]}} [opts]
 */
export function analyzePosts(posts, opts = {}) {
  const seedTags = (opts.seedTags || []).map((t) => t.replace(/^#/, ""));
  const withCaption = posts.filter((p) => p.caption && p.caption.length > 10);

  // --- 해시태그 빈도 → 3계층 ---
  // 한 계정만 반복해서 쓰는 태그는 그 계정의 브랜딩이지 도달용 태그가 아니다.
  // 그래서 등장 횟수뿐 아니라 "몇 개의 서로 다른 계정이 쓰는지"를 같이 본다.
  const tagStats = new Map();
  for (const post of posts) {
    for (const tag of post.hashtags) {
      if (!tagStats.has(tag)) tagStats.set(tag, { seen: 0, accounts: new Set() });
      const stat = tagStats.get(tag);
      stat.seen++;
      if (post.username) stat.accounts.add(post.username);
    }
  }

  const large = [];
  const medium = [];
  const niche = [];
  const ranked = [...tagStats.entries()].sort((a, b) => b[1].seen - a[1].seen);
  for (const [tag, stat] of ranked) {
    if (tag.length > 20) continue; // 지나치게 긴 태그는 계정 고유 태그다
    const accounts = stat.accounts.size;
    const entry = { tag: `#${tag}`, seen: stat.seen, accounts };

    if (seedTags.includes(tag) || (stat.seen >= 5 && accounts >= 3)) large.push(entry);
    else if (stat.seen >= 2 && accounts >= 2) medium.push(entry);
    else if (accounts >= 1 && stat.seen <= 2) niche.push(entry);
  }

  // --- 후킹 유형 빈도 ---
  const hookCounts = HOOK_MATCHERS.map((m) => ({
    key: m.key,
    label: m.label,
    posts: withCaption.filter((p) => m.re.test(firstLine(p.caption))).length,
  }))
    .filter((h) => h.posts > 0)
    .sort((a, b) => b.posts - a.posts);

  // --- 캡션 관행 ---
  const rate = (re) => (withCaption.length ? Number((withCaption.filter((p) => re.test(p.caption)).length / withCaption.length).toFixed(2)) : 0);
  const captionNorms = {
    medianHashtagCount: median(posts.map((p) => p.hashtags.length).filter((n) => n > 0)),
    saveLineRate: rate(SAVE_RE),
    commentGateRate: rate(COMMENT_GATE_RE),
    shareLineRate: rate(SHARE_RE),
  };

  // --- 이 주제를 자주 다루는 계정 (벤치마크 후보) ---
  const benchmarkAccounts = countBy(posts.map((p) => p.username).filter(Boolean))
    .filter((a) => a.count >= 2)
    .slice(0, 12)
    .map((a) => ({ username: a.value, posts: a.count }));

  return {
    updatedAt: new Date().toISOString(),
    source: "instagram/hashtag-explore (apify)",
    sampledPosts: posts.length,
    sampledTags: [...new Set(posts.map((p) => p.tag).filter(Boolean))],
    note: "해시태그 계층은 표본 등장 빈도를 규모의 대리 지표로 삼은 값이다. 인스타가 태그별 게시물 수를 공개하지 않는다.",
    hashtagTiers: {
      large: large.slice(0, 8),
      medium: medium.slice(0, 12),
      niche: niche.slice(0, 20),
    },
    hookPatterns: hookCounts,
    captionNorms,
    benchmarkAccounts,
  };
}

/** 조사 결과를 생성 프롬프트에 넣을 짧은 지침으로 바꾼다. */
export function toPromptBrief(trends) {
  if (!trends || !trends.sampledPosts) return "";

  const hooks = (trends.hookPatterns || [])
    .slice(0, 3)
    .map((h) => `${h.label}(표본 ${h.posts}건)`)
    .join(", ");

  const lines = [
    `[현장 조사 — ${trends.sampledTags?.join(", ") || "인스타"} 상위 게시물 ${trends.sampledPosts}건 기준]`,
  ];
  if (hooks) lines.push(`- 지금 이 분야에서 가장 많이 쓰이는 첫 줄 형태: ${hooks}`);
  if (trends.captionNorms?.medianHashtagCount) {
    lines.push(`- 해시태그는 보통 ${trends.captionNorms.medianHashtagCount}개를 쓴다`);
  }
  if (trends.captionNorms?.saveLineRate >= 0.3) {
    lines.push(`- 게시물의 ${Math.round(trends.captionNorms.saveLineRate * 100)}%가 저장을 직접 유도한다. 저장 유도 한 줄을 반드시 넣어라`);
  }
  lines.push("- 위 형태를 참고하되 문장은 새로 써라. 남의 캡션을 따라 쓰지 마라.");

  return lines.join("\n");
}
