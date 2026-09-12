// 발행 24시간 뒤 성과 점검 자동화(체크리스트 30).
// 도달·저장·공유를 가져와 history.json 에 채워 넣고, 어떤 전략이 먹혔는지 집계해 보여준다.
//
// 보는 숫자는 네 개뿐이다: 도달 / 저장 / 공유 / 저장률.
// 저장률 5% 이상이면 알고리즘이 더 밀어주는 구간이라, 그 게시물의 유형을 다음 달에 늘리면 된다.
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CONTENT_GOALS, HOOK_TYPES } from "../src/strategy/rotation.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

const METRIC_SETS = [
  "reach,saved,shares,comments,likes,total_interactions",
  "reach,saved,shares,comments,likes",
  "reach,saved",
];

const SAVE_RATE_TARGET = 5; // %

async function fetchInsights(mediaId, token) {
  // 계정·미디어 종류에 따라 지원하지 않는 지표가 있어, 넓은 집합부터 시도하고 실패하면 줄여 간다.
  for (const metric of METRIC_SETS) {
    const url = `${GRAPH_BASE}/${mediaId}/insights?metric=${metric}&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    if (res.ok) {
      const out = {};
      for (const row of data.data || []) out[row.name] = row.values?.[0]?.value ?? null;
      return out;
    }
  }
  return null;
}

function label(list, key) {
  return list.find((x) => x.key === key)?.label || key || "미기록";
}

function summarize(posts, field, list) {
  const groups = {};
  for (const p of posts) {
    if (!p.insights?.reach) continue;
    const key = p[field] || "unknown";
    groups[key] = groups[key] || { count: 0, reach: 0, saved: 0, shares: 0 };
    groups[key].count++;
    groups[key].reach += p.insights.reach || 0;
    groups[key].saved += p.insights.saved || 0;
    groups[key].shares += p.insights.shares || 0;
  }
  return Object.entries(groups)
    .map(([key, v]) => ({
      key,
      label: label(list, key),
      count: v.count,
      avgReach: Math.round(v.reach / v.count),
      saveRate: v.reach ? Number(((v.saved / v.reach) * 100).toFixed(1)) : 0,
      shares: v.shares,
    }))
    .sort((a, b) => b.saveRate - a.saveRate);
}

async function main() {
  const token = process.env.IG_LONG_LIVED_TOKEN;
  if (!token) throw new Error("IG_LONG_LIVED_TOKEN 이 필요합니다.");

  const historyPath = path.join(DATA_DIR, "history.json");
  const history = JSON.parse(readFileSync(historyPath, "utf-8"));
  const now = Date.now();

  // 24시간이 지났고 아직 지표를 안 채운 게시물만 조회한다.
  const due = (history.posts || []).filter(
    (p) => p.igMediaId && !p.insights && now - new Date(p.postedAt).getTime() > 24 * 60 * 60 * 1000
  );
  console.log(`지표를 가져올 게시물: ${due.length}건`);

  for (const post of due) {
    const insights = await fetchInsights(post.igMediaId, token);
    if (!insights) {
      console.log(`  조회 실패: ${post.igMediaId}`);
      continue;
    }
    post.insights = insights;
    const saveRate = insights.reach ? ((insights.saved || 0) / insights.reach) * 100 : 0;
    console.log(
      `  ${post.headline?.split("\n")[0] || post.igMediaId} — 도달 ${insights.reach ?? "?"} / 저장 ${insights.saved ?? "?"} / 공유 ${insights.shares ?? "?"} / 저장률 ${saveRate.toFixed(1)}%` +
        (saveRate >= SAVE_RATE_TARGET ? "  <- 잘 먹힌 유형" : "")
    );
  }

  writeFileSync(historyPath, JSON.stringify(history, null, 2) + "\n");

  const measured = (history.posts || []).filter((p) => p.insights?.reach);
  if (!measured.length) {
    console.log("\n아직 집계할 지표가 없습니다.");
    return;
  }

  const byGoal = summarize(measured, "contentGoal", CONTENT_GOALS);
  const byHook = summarize(measured, "hookType", HOOK_TYPES);

  console.log("\n[목적별 성과] 저장률 높은 순");
  for (const r of byGoal) console.log(`  ${r.label.padEnd(6)} ${r.count}건 · 평균 도달 ${r.avgReach} · 저장률 ${r.saveRate}%`);

  console.log("\n[후킹 유형별 성과] 저장률 높은 순");
  for (const r of byHook) console.log(`  ${r.label.padEnd(8)} ${r.count}건 · 평균 도달 ${r.avgReach} · 저장률 ${r.saveRate}%`);

  const report = {
    updatedAt: new Date().toISOString(),
    measuredPosts: measured.length,
    saveRateTarget: SAVE_RATE_TARGET,
    byGoal,
    byHook,
    bestGoal: byGoal[0]?.key || null,
    bestHook: byHook[0]?.key || null,
  };
  writeFileSync(path.join(DATA_DIR, "insights.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`\n요약을 data/insights.json 에 저장했습니다. 가장 반응 좋은 조합: ${byGoal[0]?.label} × ${byHook[0]?.label}`);
}

main().catch((err) => {
  console.error("인사이트 점검 오류:", err);
  process.exit(1);
});
