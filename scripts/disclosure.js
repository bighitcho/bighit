#!/usr/bin/env node
/**
 * 쿠팡 파트너스 / AI 생성물 의무 표시 문구 도우미 CLI.
 *
 * 네이버 블로그, 쿠팡 쇼핑, 카페, 유튜브 설명란처럼 이 저장소가 자동 게시하지 않는
 * 채널에 손으로 올릴 때 쓰면 된다.
 *
 * 사용법:
 *   node scripts/disclosure.js                        표시 문구 2줄만 출력 (복사용)
 *   node scripts/disclosure.js draft.txt              파일 본문 뒤에 표시 문구를 붙여 출력
 *   cat draft.txt | node scripts/disclosure.js -      표준입력 본문에 붙여 출력
 *   node scripts/disclosure.js draft.txt --channel instagram   채널 길이 제한까지 맞춰서 출력
 *   node scripts/disclosure.js draft.txt --check      문구가 있으면 0, 없으면 1로 종료
 */
import { readFileSync } from "fs";
import {
  DISCLOSURE_BLOCK,
  CHANNEL_LIMITS,
  withDisclosure,
  missingNotices,
} from "../src/compliance/disclosure.js";

function parseArgs(argv) {
  const opts = { file: null, channel: undefined, check: false, position: "end" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") opts.check = true;
    else if (arg === "--channel") opts.channel = argv[++i];
    else if (arg === "--start") opts.position = "start";
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (!opts.file) opts.file = arg;
  }
  return opts;
}

function readBody(file) {
  if (!file) return null;
  if (file === "-") return readFileSync(0, "utf-8");
  return readFileSync(file, "utf-8");
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  console.log(readFileSync(new URL(import.meta.url), "utf-8").split("*/")[0].replace(/^#!.*\n/, ""));
  console.log(`지원 채널: ${Object.keys(CHANNEL_LIMITS).join(", ")}`);
  process.exit(0);
}

const body = readBody(opts.file);

if (body === null) {
  console.log(DISCLOSURE_BLOCK);
  process.exit(0);
}

if (opts.check) {
  const missing = missingNotices(body);
  if (missing.length === 0) {
    console.log("OK: 의무 표시 문구가 모두 들어 있습니다.");
    process.exit(0);
  }
  console.error("실패: 아래 문구가 빠졌습니다.");
  for (const m of missing) console.error(`- ${m}`);
  process.exit(1);
}

console.log(withDisclosure(body, { channel: opts.channel, position: opts.position }));
