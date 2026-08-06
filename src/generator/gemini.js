const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "표지 후킹 문구. 최대 8단어 이내, 쉬운 단어만 사용, 독자가 얻는 이익이나 피할 손실이 드러나게 (한 줄 또는 개행 포함 두 줄)",
    },
    subheadline: { type: "string", description: "1페이지 부제 (한 문장)" },
    eyebrow: { type: "string", description: "제목 위 하이라이트 문구 (예: 'AI가 자동으로 정리해주는')" },
    bodySlides: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      description: "본문 슬라이드 5장. 순서대로 [문제/오해 → 핵심 원인 → 해결법 1 → 해결법 2 또는 사례 → 요약/체크리스트] 역할을 가진다",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "슬라이드 역할 라벨 (예: '문제', '원인', '해결 1', '해결 2', '정리')" },
          heading: { type: "string", description: "본문 슬라이드 소제목. 하나의 핵심 내용만, 최대 20단어" },
          body: { type: "string", description: "본문 내용 2~3문장, 중학생도 이해할 쉬운 말로. 추상적 표현 대신 구체적인 행동과 사례" },
        },
        required: ["label", "heading", "body"],
      },
    },
    outroHeading: { type: "string", description: "마무리 슬라이드 CTA 문구 (저장/공유/팔로우/댓글 중 콘텐츠에 가장 어울리는 행동 유도)" },
    outroSubheading: { type: "string", description: "마무리 슬라이드 부제 (다음 콘텐츠 예고 등)" },
    igCaption: { type: "string", description: "인스타그램 게시물 본문 캡션. 해시태그 5~8개 포함" },
    threadsText: { type: "string", description: "스레드(Threads)용 짧은 게시글 텍스트 (500자 이내, 대화체)" },
  },
  required: ["headline", "subheadline", "eyebrow", "bodySlides", "outroHeading", "outroSubheading", "igCaption", "threadsText"],
};

function buildPrompt(source) {
  const base = `너는 바이럴 카드뉴스를 연구하는 전문 카피라이터야. 아래 소재를 바탕으로 7장짜리 카드뉴스 콘텐츠를 만들어줘.

[전체 구성 - 반드시 이 순서를 지켜]
- 1장(표지): 스크롤을 멈추게 하는 후킹
- 2장: 독자가 겪는 문제 또는 흔한 오해
- 3장: 그 문제가 생기는 핵심 원인
- 4장: 첫 번째 해결 방법
- 5장: 두 번째 해결 방법 또는 실제 적용 사례
- 6장: 핵심 요약 또는 독자가 바로 실행할 체크리스트
- 7장(마무리): 콘텐츠에 맞는 행동 유도(CTA)

[표지 후킹(headline) 규칙]
- 최대 8단어 이내, 한눈에 뜻을 이해할 수 있게.
- 어렵거나 추상적인 단어는 쓰지 마.
- 독자가 얻는 이익이나 피할 손실이 드러나게 해.
- 강한 주장형/실수 경고형/숫자형/질문형/반전형/체크리스트형 중 소재에 가장 잘 맞는 유형을 골라.

[본문 슬라이드 규칙]
- 각 슬라이드에는 하나의 핵심 내용만 넣어.
- 문장은 짧고, 중학생도 바로 이해할 만큼 쉽게 써.
- 추상적인 표현보다 구체적인 행동과 사례를 써.
- 내용이 약하면 억지로 채우지 말고 더 강한 내용으로 교체해.

[캡션(igCaption) 규칙]
- 표지 문구와는 다른 후킹으로 시작해.
- 첫 2문장 안에 계속 읽어야 할 이유를 제시해.
- 정보만 나열하지 말고 문제 → 원인 → 해결 순서로 써.
- 문장은 짧게, 줄바꿈을 충분히 사용해.
- 마지막에 댓글/저장/공유 중 가장 적합한 행동을 유도하고 해시태그 5~8개로 마무리해.

[공통 금지 사항]
- 과장되거나 검증 안 된 사실은 쓰지 마.
- '무조건', '보장', '누구나', '100%' 같은 표현은 쓰지 마.
- 이모지는 쓰지 마 (카드 이미지 폰트에서 깨질 수 있어).
- 응답은 반드시 지정된 JSON 스키마 형식으로만 반환해.`;

  if (source.kind === "youtube") {
    return `${base}\n\n소재: 아래 유튜브 영상의 핵심 내용을 요약해서 카드뉴스로 만들어줘.`;
  }
  if (source.kind === "link") {
    return `${base}\n\n소재: 아래는 기사/글 본문에서 추출한 텍스트야. 이 내용을 바탕으로 카드뉴스를 만들어줘.\n\n---\n${source.text}\n---`;
  }
  return `${base}\n\n소재 주제: "${source.text}"\n이 주제에 대해 네가 알고 있는 신뢰할 수 있는 일반 지식을 바탕으로 카드뉴스를 만들어줘.`;
}

/**
 * @param {{kind: string, youtubeUrl?: string, text?: string}} source
 * @param {{apiKey: string, model?: string}} opts
 */
export async function generateCardNewsContent(source, opts) {
  const model = opts.model || "gemini-2.5-flash";
  const parts = [];
  if (source.kind === "youtube") {
    parts.push({ fileData: { fileUri: source.youtubeUrl } });
  }
  parts.push({ text: buildPrompt(source) });

  const res = await fetch(`${API_BASE}/${model}:generateContent?key=${opts.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
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
 * Gemini가 생성한 콘텐츠를 카드 렌더러가 이해하는 deck 형식으로 변환.
 */
export function toDeck(content, { themeName, handle }) {
  const today = new Date();
  const dateLabel = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

  const slides = [
    {
      type: "cover",
      date: dateLabel,
      eyebrow: content.eyebrow,
      headline: content.headline,
      subheadline: content.subheadline,
    },
    ...content.bodySlides.map((s, i) => ({
      type: "content",
      index: i + 1,
      label: s.label,
      heading: s.heading,
      body: s.body,
    })),
    {
      type: "outro",
      heading: content.outroHeading,
      subheading: content.outroSubheading,
    },
  ];

  return {
    themeName,
    handle,
    slides,
    igCaption: content.igCaption,
    threadsText: content.threadsText,
  };
}
