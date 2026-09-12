// Gemini로 카드뉴스 원고를 만든다.
// 프롬프트/스키마는 "발행 전 체크리스트 30"(docs/instagram-checklist-30.md)을 그대로 규칙으로 옮긴 것이고,
// 생성 결과는 src/quality/checklist.js 가 기계적으로 다시 검수한다.
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// 인스타그램 캐러셀 1건에 올릴 수 있는 이미지 상한이 10장이라, 표지 1 + 본문 7 + 요약 1 + CTA 1 = 10장 구조를 쓴다.
const CORE_SLIDE_COUNT = 6;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "표지 제목. 30자 이내, 개행 1번까지 허용. 마침표 금지" },
    subheadline: { type: "string", description: "표지 부제 한 문장. 50자 이내" },
    eyebrow: { type: "string", description: "제목 위 한 조각 문구. 15자 이내 (예: '3개월 해보고 정리한')" },
    empathySlide: {
      type: "object",
      description: "2장. 독자가 지금 겪는 고민을 한 문장으로 짚어주는 슬라이드",
      properties: {
        heading: { type: "string", description: "24자 이내 소제목. 마침표 금지" },
        body: { type: "string", description: "독자의 상황을 그대로 묘사하는 2문장 이내" },
      },
      required: ["heading", "body"],
    },
    coreSlides: {
      type: "array",
      description: `3~8장. 핵심 정보 ${CORE_SLIDE_COUNT}장. act 값은 문제/증거/반전 세 종류가 모두 최소 1번 나와야 한다`,
      minItems: CORE_SLIDE_COUNT,
      maxItems: CORE_SLIDE_COUNT,
      items: {
        type: "object",
        properties: {
          act: { type: "string", enum: ["문제", "증거", "반전"], description: "5막 구조상 이 슬라이드의 역할" },
          heading: { type: "string", description: "24자 이내 소제목. 마침표 금지" },
          body: { type: "string", description: "한 슬라이드 한 메시지. 어절 30개 이내, 한 문장은 어절 20개 이내" },
        },
        required: ["act", "heading", "body"],
      },
    },
    summarySlide: {
      type: "object",
      description: "9장. 앞 내용을 한눈에 정리해 저장 가치를 만드는 슬라이드",
      properties: {
        heading: { type: "string", description: "24자 이내 소제목. 마침표 금지" },
        points: {
          type: "array",
          description: "한 줄 요약 3~4개. 각 25자 이내",
          minItems: 3,
          maxItems: 4,
          items: { type: "string" },
        },
      },
      required: ["heading", "points"],
    },
    ctaSlide: {
      type: "object",
      description: "10장. 행동 유도 1개만 담는 마지막 슬라이드",
      properties: {
        heading: { type: "string", description: "24자 이내. 마침표 금지" },
        body: { type: "string", description: "행동 1개만 요청하는 2문장 이내" },
      },
      required: ["heading", "body"],
    },
    shareLine: { type: "string", description: "친구에게 그대로 보내고 싶어지는 한 문장. 60자 이내" },
    captionFirstLine: { type: "string", description: "캡션 첫 줄. 표지와 다른 후킹. 60자 이내 (더보기로 잘리는 자리)" },
    captionBody: { type: "string", description: "캡션 본문 3~5줄. 문제 → 원인 → 해결 순서. 줄바꿈으로 구분" },
    captionQuestion: { type: "string", description: "독자가 한 줄로 답할 수 있는 질문 1개" },
    extraHashtags: {
      type: "array",
      description: "이 게시물 주제에 특히 맞는 니치 해시태그 0~2개. '#' 포함, 공백 없이",
      maxItems: 2,
      items: { type: "string" },
    },
    threadsText: { type: "string", description: "스레드용 게시글. 400자 이내, 해시태그 없이 대화체" },
  },
  required: [
    "headline", "subheadline", "eyebrow", "empathySlide", "coreSlides", "summarySlide",
    "ctaSlide", "shareLine", "captionFirstLine", "captionBody", "captionQuestion", "threadsText",
  ],
};

function buildRules(brand, plan) {
  const g = brand.guardrails;
  return `너는 인스타그램 카드뉴스를 전업으로 쓰는 한국어 카피라이터야. 아래 규칙은 실제 도달·저장 데이터로 검증된 것이고, 하나라도 어기면 게시가 자동으로 차단돼.

[이 계정]
- 타깃 독자: ${brand.account.target}
- 계정 한 줄 소개: ${brand.account.oneLiner}
- 검색 노출용 핵심 키워드: ${brand.account.profileKeyword} (캡션 첫 두 줄 안에 자연스럽게 한 번 들어가야 함)

[이번 게시물 전략]
- 목적: ${plan.goal.label} — ${plan.goal.brief}
- 표지 후킹 유형: ${plan.hook.label} ("${plan.hook.pattern}" 형태, ${plan.hook.note})
- 이번에 얹을 설득 원리: ${plan.principle.label} — ${plan.principle.how}

[구조 — 5막]
1막 후킹(표지) → 2막 문제 압력(2장 + 핵심 초반) → 3막 증거·수치 → 4막 반전·비교 → 5막 저장 장치(요약·CTA)
- coreSlides ${CORE_SLIDE_COUNT}장의 act 에 문제/증거/반전이 모두 최소 1번씩 나와야 한다.
- 10장 전체가 결론 하나를 향해야 한다. 10장에 서로 다른 메시지 10개를 넣지 마라. 같은 결론을 다른 각도로 쌓아라.

[카피 규칙]
- 한 슬라이드 한 메시지. 어절 30개 이내로 압축하고, 한 문장은 어절 20개 이내.
- 제목·소제목에 마침표를 찍지 마라. 본문 문장에만 허용.
- 자연스러운 한국어만. 번역어투·시적 표현·영어 약어 금지 (${g.bannedJargon.join(", ")} 같은 약어는 '월매출', '투자수익'처럼 우리말로).
- 소리 내 읽어서 입에 붙는 문장으로 써라. 친구에게 말하듯.
- 이모지 금지 (카드 렌더링 폰트에서 깨진다).
- 발행일·버전·렌더링 같은 제작 메타 정보를 카피에 쓰지 마라. 독자 입장에서만 쓴다.
- 이미지 출처 표기("이미지:", "AI 생성 이미지" 등)를 넣지 마라.
- ${g.bannedPhrases.map((p) => `'${p}'`).join(", ")} 같은 단정·보장 표현 금지. 확인되지 않은 수익·효과 숫자 금지.
- 과장 대신 구체성. 숫자를 쓸 거면 소재 안에서 확인된 숫자만 쓴다.
- shareLine 은 "이거 너도 봐야 해" 하고 친구에게 보낼 만한 한 문장이어야 한다.
- summarySlide 는 체크리스트처럼 훑어서 바로 쓸 수 있게 정리한다. 저장을 부르는 장치다.
- ctaSlide 와 캡션의 행동 요청은 오직 하나: ${describeCta(brand, plan)}

[캡션]
- captionFirstLine 은 표지 카피와 다른 후킹이어야 한다. 호기심·수치·반전 중 하나로 시작.
- captionBody 는 문제 → 원인 → 해결 순서로 3~5줄, 줄바꿈 충분히.
- captionQuestion 은 한 줄로 답할 수 있는 질문 1개.
- 해시태그·저장 유도·CTA 문구는 코드가 붙이니 캡션 본문에 직접 쓰지 마라.

반드시 지정된 JSON 스키마로만 답해라.`;
}

function describeCta(brand, plan) {
  if (plan.goal.cta === "댓글키워드") {
    return `댓글에 '${brand.cta.commentKeyword}' 를 남기면 '${brand.cta.freeResource}' 를 DM으로 보내준다고 안내 (부담 없는 말투로)`;
  }
  if (plan.goal.cta === "댓글") {
    return "질문에 대한 생각을 댓글로 남기게 유도";
  }
  return "이 게시물을 저장하게 유도";
}

function buildPrompt(source, brand, plan, violations) {
  const rules = buildRules(brand, plan);
  let sourceBlock;
  if (source.kind === "youtube") {
    sourceBlock = "소재: 함께 첨부한 유튜브 영상의 핵심 내용을 정리해 카드뉴스로 만들어라.";
  } else if (source.kind === "link") {
    sourceBlock = `소재: 아래는 기사/글 본문에서 추출한 텍스트다. 이 내용에서 확인되는 사실만 써라.\n\n---\n${source.text}\n---`;
  } else {
    sourceBlock = `소재 주제: "${source.text}"\n네가 확실히 아는 신뢰할 수 있는 일반 지식만 써라. 모르는 수치는 쓰지 마라.`;
  }

  let retryBlock = "";
  if (violations && violations.length) {
    retryBlock = `\n\n[직전 원고가 자동 검수에서 반려됐다. 아래를 반드시 고쳐서 다시 써라]\n${violations
      .map((v, i) => `${i + 1}. ${v}`)
      .join("\n")}`;
  }

  return `${rules}\n\n${sourceBlock}${retryBlock}`;
}

/**
 * @param {{kind: string, youtubeUrl?: string, text?: string}} source
 * @param {{apiKey: string, model?: string, brand: object, plan: object, violations?: string[]}} opts
 */
export async function generateCardNewsContent(source, opts) {
  const model = opts.model || "gemini-3.6-flash";
  const parts = [];
  if (source.kind === "youtube") {
    parts.push({ fileData: { fileUri: source.youtubeUrl } });
  }
  parts.push({ text: buildPrompt(source, opts.brand, opts.plan, opts.violations) });

  const res = await fetch(`${API_BASE}/${model}:generateContent?key=${opts.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: opts.violations?.length ? 0.4 : 0.8,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API 오류 (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini 응답에서 콘텐츠를 찾지 못했습니다: " + JSON.stringify(data));

  return JSON.parse(text);
}

/**
 * 해시태그 3계층 믹스(대형 2 + 중형 3 + 니치 2~5, 합계 5~10개)를 조립한다.
 * 계정 단위 태그는 brand-config 에서 가져오고, 주제별 니치 태그만 모델 제안을 받는다.
 */
export function buildHashtags(brand, extraHashtags = []) {
  const tiers = brand.hashtags;
  const clean = (tag) => {
    const t = String(tag).trim().replace(/\s+/g, "");
    if (!t) return null;
    return t.startsWith("#") ? t : `#${t}`;
  };

  const picked = [
    ...(tiers.large || []).slice(0, 2),
    ...(tiers.medium || []).slice(0, 3),
    ...(tiers.niche || []).slice(0, 2),
  ].map(clean);

  for (const extra of extraHashtags) {
    const tag = clean(extra);
    if (tag && !picked.includes(tag) && picked.length < 10) picked.push(tag);
  }

  return picked.filter(Boolean);
}

/**
 * 캡션을 [첫 줄 후킹] → [본문] → [저장 유도] → [질문] → [CTA] → [해시태그] 순서로 조립한다.
 * 구조를 코드가 보장하기 위해 모델에게는 조각만 받는다.
 */
export function buildCaption(content, brand, plan) {
  const blocks = [content.captionFirstLine.trim(), content.captionBody.trim(), brand.cta.saveLine.trim()];

  if (content.captionQuestion) blocks.push(content.captionQuestion.trim());

  if (plan.goal.cta === "댓글키워드") {
    blocks.push(`댓글에 '${brand.cta.commentKeyword}' 남겨주시면 ${brand.cta.freeResource} 보내드려요`);
  } else if (plan.goal.cta === "댓글") {
    blocks.push("생각을 댓글로 알려주세요");
  }

  if (needsDisclaimer(content, brand)) blocks.push(brand.guardrails.disclaimer);

  blocks.push(buildHashtags(brand, content.extraHashtags).join(" "));

  return blocks.filter(Boolean).join("\n\n");
}

/** 원고에 들어 있는 모든 문장을 한 덩어리로 모은다. 자동 검수기가 보는 범위와 같아야 한다. */
function collectText(content) {
  const parts = [
    content.eyebrow,
    content.headline,
    content.subheadline,
    content.empathySlide?.heading,
    content.empathySlide?.body,
    ...(content.coreSlides || []).flatMap((s) => [s.heading, s.body]),
    content.summarySlide?.heading,
    ...(content.summarySlide?.points || []),
    content.ctaSlide?.heading,
    content.ctaSlide?.body,
    content.shareLine,
    content.captionFirstLine,
    content.captionBody,
    content.captionQuestion,
  ];
  return parts.filter(Boolean).join(" ");
}

/**
 * 투자·건강처럼 광고 규정이 엄격한 주제면 면책 문구를 자동으로 붙인다.
 * 검사 범위는 자동 검수기와 같아야 한다. 좁게 보면 "면책 문구가 없다"는 위반이 계속 나면서
 * 재생성 루프가 끝나지 않는다.
 */
export function needsDisclaimer(content, brand) {
  const haystack = collectText(content);
  return (brand.guardrails.sensitiveTopics || []).some((topic) => haystack.includes(topic));
}

/**
 * Gemini 결과를 카드 렌더러가 이해하는 deck 형식으로 변환한다.
 * 표지에는 발행일 같은 메타 정보를 넣지 않는다(체크리스트 17).
 */
export function toDeck(content, { themeName, brand, plan }) {
  const slides = [
    {
      type: "cover",
      eyebrow: content.eyebrow,
      headline: content.headline,
      subheadline: content.subheadline,
    },
    { type: "content", act: "공감", heading: content.empathySlide.heading, body: content.empathySlide.body },
    ...content.coreSlides.map((s) => ({ type: "content", act: s.act, heading: s.heading, body: s.body })),
    { type: "summary", heading: content.summarySlide.heading, points: content.summarySlide.points },
    {
      type: "cta",
      heading: content.ctaSlide.heading,
      body: content.ctaSlide.body,
      saveLine: brand.cta.saveLine,
    },
  ].map((slide, i, arr) => ({ ...slide, index: i + 1, total: arr.length }));

  return {
    themeName,
    handle: brand.account.handle,
    slides,
    shareLine: content.shareLine,
    igCaption: buildCaption(content, brand, plan),
    threadsText: content.threadsText,
    strategy: { goal: plan.goal.key, hookType: plan.hook.key, principle: plan.principle.key },
  };
}
