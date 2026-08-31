/**
 * 쿠팡 파트너스 / AI 생성물 의무 표시 문구.
 *
 * 채널(인스타그램, 스레드, 네이버 블로그, 쿠팡 쇼핑 등)과 상관없이
 * 게시물 본문에 아래 두 줄이 반드시 들어가야 한다.
 * 이 파일이 그 문구의 유일한 출처(single source of truth)다.
 */

/** 쿠팡 파트너스 수수료 고지 (공정위 추천·보증 심사지침) */
export const COUPANG_PARTNERS_NOTICE =
  "(긴급공지) 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

/** AI 생성 가상인물 포함 고지 */
export const AI_VIRTUAL_PERSON_NOTICE =
  "광고, 인공지능(AI)을 기반으로 생성된 가상인물이 포함된 게시물입니다";

/** 게시물에 그대로 붙여넣는 2줄 블록 */
export const DISCLOSURE_BLOCK = `${COUPANG_PARTNERS_NOTICE}\n${AI_VIRTUAL_PERSON_NOTICE}`;

/** 각 문구를 "이미 들어있는지" 판단할 때 쓰는 핵심 구절 */
const REQUIRED_NOTICES = [
  {
    id: "coupang",
    text: COUPANG_PARTNERS_NOTICE,
    // 앞의 "(긴급공지)"가 빠져 있거나 문장이 조금 달라도 고지로 인정
    markers: ["쿠팡파트너스활동의일환", "수수료를제공받습니다"],
  },
  {
    id: "ai",
    text: AI_VIRTUAL_PERSON_NOTICE,
    markers: ["인공지능(ai)을기반으로생성된가상인물"],
  },
];

/** 채널별 본문 최대 길이 (null = 사실상 제한 없음) */
export const CHANNEL_LIMITS = {
  instagram: 2200,
  threads: 500,
  naverBlog: null,
  naverCafe: null,
  coupang: null,
  blog: null,
  youtube: 5000,
  default: null,
};

function normalize(text) {
  return String(text ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * 채널 이름으로 길이 제한을 찾는다. 모르는 채널이면 제한 없음으로 본다.
 * @param {string} [channel]
 * @returns {number|null}
 */
export function limitForChannel(channel) {
  if (!channel) return null;
  const key = String(channel).trim();
  if (key in CHANNEL_LIMITS) return CHANNEL_LIMITS[key];
  const lowered = Object.keys(CHANNEL_LIMITS).find((k) => k.toLowerCase() === key.toLowerCase());
  return lowered ? CHANNEL_LIMITS[lowered] : null;
}

/**
 * 본문에서 빠져 있는 의무 표시 문구 목록을 돌려준다.
 * @param {string} text
 * @returns {string[]} 빠진 문구 (없으면 빈 배열)
 */
export function missingNotices(text) {
  const normalized = normalize(text);
  return REQUIRED_NOTICES.filter((notice) => !notice.markers.every((m) => normalized.includes(m))).map(
    (notice) => notice.text,
  );
}

/**
 * 두 문구가 모두 들어있는지 확인한다.
 * @param {string} text
 * @returns {boolean}
 */
export function hasDisclosure(text) {
  return missingNotices(text).length === 0;
}

/**
 * 본문에 의무 표시 문구를 붙인다. 이미 있는 문구는 다시 붙이지 않는다(멱등).
 *
 * 길이 제한(limit)이 있으면 표시 문구는 절대 자르지 않고 본문 쪽을 줄인다.
 *
 * @param {string} text 원본 본문
 * @param {{channel?: string, limit?: number|null, position?: "end"|"start", separator?: string}} [opts]
 * @returns {string} 표시 문구가 포함된 본문
 */
export function withDisclosure(text, opts = {}) {
  const { channel, position = "end", separator = "\n\n" } = opts;
  const limit = opts.limit !== undefined ? opts.limit : limitForChannel(channel);

  const body = String(text ?? "").trim();
  const missing = missingNotices(body);

  if (missing.length === 0) {
    if (limit && body.length > limit) {
      throw new Error(
        `본문이 채널 길이 제한(${limit}자)을 넘습니다: ${body.length}자. 표시 문구는 자를 수 없으니 본문을 줄여주세요.`,
      );
    }
    return body;
  }

  const block = missing.join("\n");

  if (limit != null && block.length + separator.length > limit) {
    throw new Error(
      `채널 길이 제한(${limit}자)이 의무 표시 문구(${block.length}자)보다 짧아 게시할 수 없습니다.`,
    );
  }

  let kept = body;
  if (limit != null) {
    const room = limit - block.length - separator.length;
    if (kept.length > room) {
      kept = room > 0 ? `${kept.slice(0, Math.max(0, room - 1)).trimEnd()}…` : "";
    }
  }

  if (!kept) return block;
  return position === "start" ? `${block}${separator}${kept}` : `${kept}${separator}${block}`;
}

/**
 * 의무 표시 문구가 없으면 게시를 막기 위해 예외를 던진다.
 * 게시 직전 마지막 방어선으로 사용한다.
 *
 * @param {string} text
 * @param {string} [label] 오류 메시지에 표시할 채널/맥락 이름
 * @returns {string} 검사를 통과한 본문 그대로
 */
export function assertDisclosure(text, label = "게시물") {
  const missing = missingNotices(text);
  if (missing.length > 0) {
    throw new Error(`${label}에 의무 표시 문구가 없습니다. 빠진 문구:\n- ${missing.join("\n- ")}`);
  }
  return text;
}
