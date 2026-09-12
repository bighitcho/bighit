// 댓글 → 자동 DM.
// 릴스·게시물 캡션에서 "댓글에 OO 남기면 자료 보내드려요"로 유도한 다음,
// 그 키워드가 달린 댓글에 메타 공식 API로 비공개 답장(DM)을 보낸다.
//
// 조회수를 팔로워·문의로 넘기는 통로가 이 흐름이라 손으로는 유지가 안 된다.
// 비공식 자동화 앱 대신 공식 API만 쓰는 이유: 승인되지 않은 서드파티 앱이 계정 정지의 가장 흔한 원인이다.
//
// 필요한 권한: instagram_manage_comments, instagram_manage_messages
// 필요한 환경변수: IG_LONG_LIVED_TOKEN, IG_BUSINESS_ACCOUNT_ID
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

// 비공개 답장은 댓글이 달린 지 7일 이내에만 보낼 수 있다.
const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// 한 번 실행에 보내는 상한. 짧은 시간에 몰아 보내면 스팸 신호가 된다.
const MAX_SENDS_PER_RUN = 20;
// 발송 사이 간격(ms).
const SEND_INTERVAL_MS = 3000;
// 훑어볼 최근 게시물 수.
const MEDIA_LOOKBACK = 12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (name) => JSON.parse(readFileSync(path.join(DATA_DIR, name), "utf-8"));
const writeJson = (name, data) => writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2) + "\n");

function pickVariant(list, seed) {
  // 같은 댓글에는 항상 같은 문구가 나가되, 댓글마다는 다른 문구가 나가도록 아이디로 고른다.
  const hash = [...String(seed)].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return list[hash % list.length];
}

async function graphGet(pathname, params, token) {
  const url = new URL(`${GRAPH_BASE}/${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(`Graph API GET ${pathname} 실패: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function sendPrivateReply(igUserId, commentId, text, token) {
  const res = await fetch(`${GRAPH_BASE}/${igUserId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text },
      access_token: token,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data).slice(0, 300));
  return data;
}

async function replyToComment(commentId, message, token) {
  const res = await fetch(`${GRAPH_BASE}/${commentId}/replies`, {
    method: "POST",
    body: new URLSearchParams({ message, access_token: token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data).slice(0, 300));
  return data;
}

async function main() {
  if (process.env.COMMENT_DM_ENABLED !== "true") {
    console.log("COMMENT_DM_ENABLED 가 true가 아니라 실행하지 않습니다.");
    return;
  }

  const token = process.env.IG_LONG_LIVED_TOKEN;
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID;
  if (!token || !igUserId) throw new Error("IG_LONG_LIVED_TOKEN / IG_BUSINESS_ACCOUNT_ID 가 필요합니다.");

  const templates = readJson("dm-templates.json");
  const brand = readJson("brand-config.json");
  const log = readJson("dm-log.json");
  const handled = new Set(log.handled.map((h) => h.commentId));

  const resourceUrl = templates.resourceUrl || "";
  const rules = (templates.rules || []).map((rule) => ({
    ...rule,
    keyword: (rule.keyword || brand.cta.commentKeyword).toLowerCase(),
  }));
  if (!rules.length) {
    console.log("dm-templates.json 에 규칙이 없습니다.");
    return;
  }

  const media = await graphGet(`${igUserId}/media`, { fields: "id,timestamp,permalink", limit: MEDIA_LOOKBACK }, token);
  const now = Date.now();
  const recent = (media.data || []).filter((m) => now - new Date(m.timestamp).getTime() < PRIVATE_REPLY_WINDOW_MS);
  console.log(`최근 7일 게시물 ${recent.length}건에서 댓글을 확인합니다.`);

  let sent = 0;
  let failed = 0;

  for (const m of recent) {
    if (sent >= MAX_SENDS_PER_RUN) break;

    let comments;
    try {
      comments = await graphGet(`${m.id}/comments`, { fields: "id,text,timestamp,username", limit: 50 }, token);
    } catch (err) {
      console.log(`  댓글 조회 실패(${m.id}):`, err.message.slice(0, 160));
      continue;
    }

    for (const c of comments.data || []) {
      if (sent >= MAX_SENDS_PER_RUN) break;
      if (handled.has(c.id)) continue;
      if (now - new Date(c.timestamp).getTime() > PRIVATE_REPLY_WINDOW_MS) continue;

      const text = (c.text || "").toLowerCase();
      const rule = rules.find((r) => text.includes(r.keyword));
      if (!rule) continue;

      // 내 계정이 단 답글에는 반응하지 않는다.
      if (c.username && brand.account.handle.replace(/^@/, "") === c.username) continue;

      const message = pickVariant(rule.replies, c.id).replace(/\{\{resourceUrl\}\}/g, resourceUrl).trim();

      try {
        await sendPrivateReply(igUserId, c.id, message, token);
        sent++;
        handled.add(c.id);
        log.handled.push({ commentId: c.id, mediaId: m.id, username: c.username || null, sentAt: new Date().toISOString() });
        console.log(`  DM 발송: @${c.username || "?"} (${m.permalink || m.id})`);

        // 댓글에도 짧게 답글을 남긴다. 초반 댓글 응답 속도가 알고리즘 평가에 들어간다.
        if (rule.publicReply?.length) {
          try {
            await replyToComment(c.id, pickVariant(rule.publicReply, c.id), token);
          } catch (err) {
            console.log("    댓글 답글 실패(무시):", err.message.slice(0, 120));
          }
        }
      } catch (err) {
        failed++;
        console.log(`  DM 실패 (@${c.username || "?"}):`, err.message.slice(0, 200));
      }

      await sleep(SEND_INTERVAL_MS);
    }
  }

  // 로그가 무한정 커지지 않도록 최근 500건만 남긴다.
  log.handled = log.handled.slice(-500);
  writeJson("dm-log.json", log);

  console.log(`완료: 발송 ${sent}건 / 실패 ${failed}건`);
  if (sent === 0 && failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("댓글 DM 자동화 오류:", err);
  process.exit(1);
});
