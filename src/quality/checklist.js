// 발행 전 자동 검수기.
// "발행 전 체크리스트 30"(docs/instagram-checklist-30.md) 중 기계로 판정할 수 있는 항목을 코드로 옮긴 것.
// error 가 하나라도 있으면 게시하지 않고, Gemini에 위반 내용을 돌려주며 다시 쓰게 한다.

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F2FF}]/u;

/** 한국어는 단어 수를 어절(공백 기준)로 센다. */
function words(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function sentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function slideText(slide) {
  return [slide.eyebrow, slide.headline, slide.subheadline, slide.heading, slide.body, ...(slide.points || [])]
    .filter(Boolean)
    .join(" ");
}

function headingsOf(slide) {
  return [slide.eyebrow, slide.headline, slide.heading].filter(Boolean);
}

/**
 * @param {object} deck  toDeck() 결과
 * @param {object} brand data/brand-config.json
 * @param {object} plan  planNextPost() 결과
 * @returns {{errors: string[], warnings: string[], passed: string[]}}
 */
export function reviewDeck(deck, brand, plan) {
  const errors = [];
  const warnings = [];
  const passed = [];
  const pub = brand.publishing;
  const g = brand.guardrails;

  const check = (id, ok, message, severity = "error") => {
    if (ok) {
      passed.push(id);
      return;
    }
    (severity === "error" ? errors : warnings).push(`[${id}] ${message}`);
  };

  const slides = deck.slides || [];
  const allText = slides.map(slideText).join(" ");
  const caption = deck.igCaption || "";

  // --- CH01 콘텐츠 본질 (01-06) ---
  check(
    "06 분량",
    slides.length >= pub.minSlideCount && slides.length <= 10,
    `슬라이드가 ${slides.length}장입니다. ${pub.minSlideCount}~10장이어야 합니다 (권장 ${pub.targetSlideCount}장)`
  );

  const acts = new Set(slides.filter((s) => s.act).map((s) => s.act));
  check(
    "05 5막 구조",
    ["문제", "증거", "반전"].every((a) => acts.has(a)),
    `5막 구조가 빠졌습니다. 본문에 있는 역할: ${[...acts].join(", ") || "없음"} (문제·증거·반전 모두 필요)`
  );

  check("01 한 슬라이드 한 메시지", slides.every((s) => words(s.body || "").length <= 30 || s.type === "summary"),
    `어절 30개를 넘는 슬라이드가 있습니다: ${slides
      .filter((s) => s.type !== "summary" && words(s.body || "").length > 30)
      .map((s) => `${s.index}장(${words(s.body).length}어절)`)
      .join(", ")}`);

  const cover = slides.find((s) => s.type === "cover");
  check("02 후킹", Boolean(cover?.headline && cover.headline.trim().length >= 6), "표지 제목이 너무 짧아 3초 안에 스크롤을 멈추기 어렵습니다");

  const summary = slides.find((s) => s.type === "summary");
  check("03 저장 트리거", Boolean(summary && (summary.points || []).length >= 3), "요약 슬라이드(한눈에 정리 3줄 이상)가 없어 저장 동기가 약합니다");

  check("04 공유 트리거", Boolean(deck.shareLine && deck.shareLine.trim().length >= 10), "친구에게 보낼 만한 한 문장(shareLine)이 없습니다");

  // 같은 결론을 다른 각도로 쌓아야 하지만, 문장이 그대로 반복되면 중복이다.
  const bodies = slides.map((s) => (s.body || "").trim()).filter(Boolean);
  check("NO REPEAT", new Set(bodies).size === bodies.length, "본문이 그대로 반복되는 슬라이드가 있습니다");

  // --- CH02 비주얼 (07-12): 캔버스·폰트는 렌더러가 강제하므로 여기서는 글자량만 본다 ---
  const overflow = slides.filter((s) => (s.heading || "").length > 28 || (s.body || "").length > 140);
  check("10 가독성", overflow.length === 0,
    `카드에서 잘릴 수 있는 분량입니다: ${overflow.map((s) => `${s.index}장`).join(", ")} (소제목 28자·본문 140자 이내)`);

  // --- CH03 카피·캡션 (13-18) ---
  check("13 자연어", !g.bannedJargon.some((j) => new RegExp(`\\b${j}\\b`, "i").test(allText + caption)),
    `영어 약어가 있습니다: ${g.bannedJargon.filter((j) => new RegExp(`\\b${j}\\b`, "i").test(allText + caption)).join(", ")} (우리말로 바꿔야 합니다)`);

  check("이모지 금지", !EMOJI_RE.test(allText + caption), "이모지가 있습니다 (카드 렌더링 폰트에서 깨집니다)");

  const firstLine = caption.split("\n")[0] || "";
  check("15 캡션 첫 줄", firstLine.length > 0 && firstLine.length <= 80,
    `캡션 첫 줄이 ${firstLine.length}자입니다. 80자 이내여야 '더보기'로 잘리기 전에 후킹이 전달됩니다`);
  check("15 첫 줄 후킹 중복", firstLine.trim() !== (cover?.headline || "").replace(/\n/g, " ").trim(),
    "캡션 첫 줄이 표지 카피와 같습니다. 두 번째 후킹으로 다시 써야 합니다");

  const ctaSignals = [
    { key: "저장", re: /저장/ },
    { key: "댓글", re: /댓글/ },
    { key: "공유", re: /공유|보내/ },
    { key: "DM", re: /디엠|DM/ },
    { key: "링크", re: /링크|프로필 링크/ },
  ].filter((c) => c.re.test(caption));
  check("16 CTA 1개", ctaSignals.length <= 2,
    `캡션에 행동 요청이 여러 개 섞였습니다(${ctaSignals.map((c) => c.key).join(", ")}). 한 게시물 한 CTA만 남기세요`,
    "warning");
  check("16 CTA 존재", ctaSignals.length >= 1, "캡션에 행동 유도 문구가 없습니다");

  check("17 메타 정보 금지", !g.metaWords.some((w) => allText.includes(w)),
    `제작 메타 정보가 카피에 있습니다: ${g.metaWords.filter((w) => allText.includes(w)).join(", ")}`);

  const dottedHeadings = slides.flatMap(headingsOf).filter((h) => /[.]\s*$/.test(h.trim()));
  check("18 마침표 절제", dottedHeadings.length === 0, `제목·소제목에 마침표가 있습니다: ${dottedHeadings.join(" / ")}`);

  const longSentences = slides.flatMap((s) => sentences(s.body)).filter((sn) => words(sn).length > 20);
  check("문장 길이", longSentences.length === 0,
    `어절 20개를 넘는 문장이 있습니다: "${longSentences[0]?.slice(0, 40) || ""}..."`, "warning");

  // --- CH04 해시태그 (19-21) ---
  const tags = caption.match(/#[^\s#]+/g) || [];
  check("19 해시태그 개수", tags.length >= 5 && tags.length <= 10, `해시태그가 ${tags.length}개입니다. 5~10개가 적정입니다`);

  const tierOf = (tag) => {
    if ((brand.hashtags.large || []).includes(tag)) return "large";
    if ((brand.hashtags.medium || []).includes(tag)) return "medium";
    return "niche";
  };
  const tiers = new Set(tags.map(tierOf));
  check("20 3계층 믹스", tiers.size >= 3, `해시태그가 ${[...tiers].join("/")} 계층만 있습니다. 대형·중형·니치를 섞어야 합니다`, "warning");

  // --- 검색 노출 (해시태그 대신 키워드) ---
  const firstTwoLines = caption.split("\n").slice(0, 3).join(" ");
  check("검색 키워드", firstTwoLines.includes(brand.account.profileKeyword),
    `캡션 앞부분에 검색 키워드 '${brand.account.profileKeyword}' 가 없습니다`, "warning");

  // --- 저장 유도 + 댓글 게이트 (03, 28) ---
  check("저장 유도 문구", caption.includes("저장"), "캡션에 저장 유도 한 줄이 없습니다", "warning");
  if (plan.goal.cta === "댓글키워드") {
    check("28 댓글 게이트", caption.includes(brand.cta.commentKeyword),
      `전환형 게시물인데 댓글 키워드 '${brand.cta.commentKeyword}' 안내가 없습니다`);
  }

  // --- 계정 안전 (가이드라인 3·7) ---
  const banned = g.bannedPhrases.filter((p) => (allText + caption).includes(p));
  check("광고 규정", banned.length === 0, `단정·보장 표현이 있습니다: ${banned.join(", ")} (광고 거부·계정 위험)`);

  const sensitive = (g.sensitiveTopics || []).filter((t) => (allText + caption).includes(t));
  if (sensitive.length) {
    check("면책 문구", caption.includes(g.disclaimer),
      `민감 주제(${sensitive.join(", ")})를 다루는데 면책 문구가 없습니다`);
  }

  // --- 스레드 (플랫폼 분리) ---
  check("스레드 길이", (deck.threadsText || "").length > 0 && deck.threadsText.length <= 500,
    `스레드 텍스트가 ${(deck.threadsText || "").length}자입니다. 1~500자여야 합니다`);

  return { errors, warnings, passed };
}

/** 검수 결과를 사람이 읽을 수 있게 출력한다. */
export function printReview(review) {
  console.log(`   자동 검수: 통과 ${review.passed.length}항목 / 경고 ${review.warnings.length} / 위반 ${review.errors.length}`);
  for (const w of review.warnings) console.log(`     ! ${w}`);
  for (const e of review.errors) console.log(`     x ${e}`);
}
