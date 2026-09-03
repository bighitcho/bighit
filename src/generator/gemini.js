const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "카드뉴스 1페이지 메인 제목 (한 줄 또는 개행 포함 두 줄, 12자 내외)" },
    subheadline: { type: "string", description: "1페이지 부제 (한 문장)" },
    eyebrow: { type: "string", description: "제목 위 하이라이트 문구 (예: 'AI가 자동으로 정리해주는')" },
    bodySlides: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          heading: { type: "string", description: "본문 슬라이드 소제목" },
          body: { type: "string", description: "본문 내용 2~3문장, 쉬운 말로" },
        },
        required: ["heading", "body"],
      },
    },
    outroHeading: { type: "string", description: "마무리 슬라이드 문구" },
    outroSubheading: { type: "string", description: "마무리 슬라이드 부제 (다음 콘텐츠 예고 등)" },
    igCaption: { type: "string", description: "인스타그램 게시물 본문 캡션. 해시태그 5~8개 포함" },
    threadsText: { type: "string", description: "스레드(Threads)용 짧은 게시글 텍스트 (500자 이내, 대화체)" },
  },
  required: ["headline", "subheadline", "eyebrow", "bodySlides", "outroHeading", "outroSubheading", "igCaption", "threadsText"],
};

function buildPrompt(source) {
  const base = `너는 인스타그램 카드뉴스 작가야. 아래 소재를 바탕으로 여러 장짜리 카드뉴스 콘텐츠를 만들어줘.
- 문장은 짧고 쉬운 말로, 신뢰도 있는 톤으로 작성해.
- 과장되거나 검증 안 된 사실은 쓰지 마.
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
  const model = opts.model || "gemini-3.6-flash";
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
