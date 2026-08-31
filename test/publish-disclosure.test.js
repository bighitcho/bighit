import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { publishInstagramCarousel } from "../src/publish/instagram.js";
import { publishThreadsCarousel } from "../src/publish/threads.js";
import { hasDisclosure, CHANNEL_LIMITS } from "../src/compliance/disclosure.js";

const realFetch = globalThis.fetch;
let sentBodies = [];

beforeEach(() => {
  sentBodies = [];
  globalThis.fetch = async (url, init) => {
    if (init?.body) sentBodies.push(Object.fromEntries(new URLSearchParams(init.body)));
    return {
      ok: true,
      json: async () => ({ id: "fake-id", permalink: "https://example.com/p/fake" }),
    };
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function containerBody(mediaType) {
  return sentBodies.find((b) => b.media_type === mediaType);
}

test("인스타그램 게시는 캡션에 표시 문구를 담아 보낸다", async () => {
  await publishInstagramCarousel(["https://img/1.png"], "문구 없는 캡션", {
    token: "t",
    igUserId: "u",
  });
  const body = containerBody("CAROUSEL");
  assert.ok(hasDisclosure(body.caption), `실제 전송 캡션: ${body.caption}`);
  assert.ok(body.caption.startsWith("문구 없는 캡션"));
});

test("스레드 게시는 본문에 표시 문구를 담아 보내고 500자를 넘지 않는다", async () => {
  await publishThreadsCarousel(["https://img/1.png"], "가".repeat(900), { token: "t", userId: "u" });
  const body = containerBody("CAROUSEL");
  assert.ok(hasDisclosure(body.text));
  assert.ok(body.text.length <= CHANNEL_LIMITS.threads, `길이 ${body.text.length}`);
});

test("이미 문구가 있는 캡션은 중복되지 않는다", async () => {
  const caption = "본문\n\n(긴급공지) 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.\n광고, 인공지능(AI)을 기반으로 생성된 가상인물이 포함된 게시물입니다";
  await publishInstagramCarousel(["https://img/1.png"], caption, { token: "t", igUserId: "u" });
  const body = containerBody("CAROUSEL");
  assert.equal(body.caption, caption);
});
