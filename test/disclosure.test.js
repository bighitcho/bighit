import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUPANG_PARTNERS_NOTICE,
  AI_VIRTUAL_PERSON_NOTICE,
  DISCLOSURE_BLOCK,
  CHANNEL_LIMITS,
  withDisclosure,
  hasDisclosure,
  missingNotices,
  assertDisclosure,
  limitForChannel,
} from "../src/compliance/disclosure.js";

test("문구는 사용자가 지정한 문장 그대로여야 한다", () => {
  assert.equal(
    COUPANG_PARTNERS_NOTICE,
    "(긴급공지) 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.",
  );
  assert.equal(AI_VIRTUAL_PERSON_NOTICE, "광고, 인공지능(AI)을 기반으로 생성된 가상인물이 포함된 게시물입니다");
  assert.equal(DISCLOSURE_BLOCK, `${COUPANG_PARTNERS_NOTICE}\n${AI_VIRTUAL_PERSON_NOTICE}`);
});

test("빈 본문에도 두 문구가 붙는다", () => {
  const out = withDisclosure("");
  assert.ok(hasDisclosure(out));
  assert.equal(out, DISCLOSURE_BLOCK);
});

test("본문 뒤에 두 문구가 붙는다", () => {
  const out = withDisclosure("오늘의 추천템");
  assert.ok(out.startsWith("오늘의 추천템"));
  assert.ok(out.includes(COUPANG_PARTNERS_NOTICE));
  assert.ok(out.includes(AI_VIRTUAL_PERSON_NOTICE));
});

test("이미 문구가 있으면 중복해서 붙지 않는다 (멱등)", () => {
  const once = withDisclosure("본문");
  const twice = withDisclosure(once);
  assert.equal(twice, once);
  assert.equal(twice.split(AI_VIRTUAL_PERSON_NOTICE).length - 1, 1);
});

test("문구 하나만 있으면 빠진 문구만 채운다", () => {
  const out = withDisclosure(`본문\n\n${COUPANG_PARTNERS_NOTICE}`);
  assert.equal(out.split(COUPANG_PARTNERS_NOTICE).length - 1, 1);
  assert.ok(out.includes(AI_VIRTUAL_PERSON_NOTICE));
});

test("띄어쓰기나 (긴급공지) 표기가 달라도 이미 있는 것으로 인정한다", () => {
  const loose = "본문\n이 포스팅은  쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.\n광고, 인공지능(AI)을 기반으로 생성된 가상인물이 포함된 게시물입니다";
  assert.deepEqual(missingNotices(loose), []);
  assert.equal(withDisclosure(loose), loose.trim());
});

test("스레드 500자 제한에서도 문구는 잘리지 않고 본문이 줄어든다", () => {
  const long = "가".repeat(900);
  const out = withDisclosure(long, { channel: "threads" });
  assert.ok(out.length <= CHANNEL_LIMITS.threads, `길이 ${out.length}`);
  assert.ok(hasDisclosure(out));
  assert.ok(out.includes("…"));
});

test("인스타그램 2200자 제한도 지켜진다", () => {
  const out = withDisclosure("나".repeat(5000), { channel: "instagram" });
  assert.ok(out.length <= CHANNEL_LIMITS.instagram);
  assert.ok(hasDisclosure(out));
});

test("제한 없는 채널은 본문을 자르지 않는다", () => {
  const long = "다".repeat(5000);
  const out = withDisclosure(long, { channel: "naverBlog" });
  assert.ok(out.startsWith(long));
  assert.ok(hasDisclosure(out));
  assert.equal(limitForChannel("naverBlog"), null);
  assert.equal(limitForChannel("모르는채널"), null);
});

test("position: start 로 맨 앞에 붙일 수 있다", () => {
  const out = withDisclosure("본문", { position: "start" });
  assert.ok(out.startsWith(COUPANG_PARTNERS_NOTICE));
  assert.ok(out.endsWith("본문"));
});

test("문구가 이미 있는데 본문이 제한을 넘으면 조용히 넘어가지 않고 실패한다", () => {
  const tooLong = withDisclosure("라".repeat(600), { limit: null });
  assert.throws(() => withDisclosure(tooLong, { channel: "threads" }), /길이 제한/);
});

test("assertDisclosure 는 문구가 없으면 게시를 막는다", () => {
  assert.throws(() => assertDisclosure("문구 없는 본문", "인스타그램 캡션"), /인스타그램 캡션/);
  const ok = withDisclosure("본문");
  assert.equal(assertDisclosure(ok), ok);
});
