// satori용 슬라이드 트리 빌더.
// 폰트 크기는 체크리스트 08(최소 28px / 본문 30px+ / 헤드라인 60px+)을 만족하는 값만 쓴다.
import { MIN_FONT_SIZE } from "./theme.js";

const FONT = {
  footer: MIN_FONT_SIZE, // 28
  eyebrow: 36,
  body: 38,
  point: 34,
  heading: 62,
  coverHeadline: 76,
  coverSub: 38,
  ctaHeading: 64,
};

function card(theme, children, extraStyle = {}) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: theme.bg,
        padding: 56,
        fontFamily: "Noto Sans KR",
        ...extraStyle,
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%",
              backgroundColor: theme.card,
              border: `2px solid ${theme.border}`,
              borderRadius: 28,
              padding: 60,
              justifyContent: "space-between",
            },
            children,
          },
        },
      ],
    },
  };
}

// 본문 블록은 푸터를 제외한 영역의 세로 가운데에 놓는다. 4:5 캔버스에서 아래가 비어 보이는 것을 막는다.
const MAIN = { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" };

function hidden() {
  return { type: "div", props: { style: { display: "none" }, children: [] } };
}

/** 슬라이드의 5막 역할을 보여주는 배지. 장식 아이콘 대신 텍스트만 쓴다. */
function badge(theme, text) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignSelf: "flex-start",
        backgroundColor: theme.accentSoft,
        color: theme.ink,
        fontSize: 30,
        fontWeight: 700,
        padding: "10px 26px",
        borderRadius: 999,
      },
      children: text,
    },
  };
}

function eyebrowText(theme, text) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        fontSize: FONT.eyebrow,
        fontWeight: 800,
        color: theme.ink,
        backgroundColor: theme.accentSoft,
        padding: "6px 14px",
        lineHeight: 1.35,
      },
      children: text,
    },
  };
}

function footer(theme, handle, pageLabel) {
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", gap: 18 },
      children: [
        {
          type: "div",
          props: { style: { display: "flex", width: "100%", height: 2, backgroundColor: theme.border }, children: [] },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", fontSize: FONT.footer, color: theme.inkSoft },
            children: [
              { type: "div", props: { style: { display: "flex" }, children: handle } },
              { type: "div", props: { style: { display: "flex" }, children: pageLabel } },
            ],
          },
        },
      ],
    },
  };
}

function pageLabel(slide) {
  return `${slide.index} / ${slide.total}`;
}

export function buildCover(theme, slide, ctx) {
  // 표지에 발행일·버전 같은 제작 메타 정보는 넣지 않는다(체크리스트 17).
  return card(theme, [
    {
      type: "div",
      props: {
        style: { ...MAIN, gap: 26 },
        children: [
          slide.eyebrow ? eyebrowText(theme, slide.eyebrow) : hidden(),
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                fontSize: FONT.coverHeadline,
                fontWeight: 800,
                color: theme.ink,
                lineHeight: 1.2,
                marginTop: 12,
              },
              children: slide.headline,
            },
          },
          slide.subheadline
            ? {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    fontSize: FONT.coverSub,
                    color: theme.inkSoft,
                    lineHeight: 1.5,
                    marginTop: 8,
                  },
                  children: slide.subheadline,
                },
              }
            : hidden(),
        ],
      },
    },
    footer(theme, ctx.handle, pageLabel(slide)),
  ]);
}

export function buildContent(theme, slide, ctx) {
  return card(theme, [
    {
      type: "div",
      props: {
        style: { ...MAIN, gap: 28 },
        children: [
          badge(theme, slide.act || "핵심"),
          {
            type: "div",
            props: {
              style: { display: "flex", fontSize: FONT.heading, fontWeight: 800, color: theme.ink, lineHeight: 1.3, marginTop: 8 },
              children: slide.heading,
            },
          },
          {
            type: "div",
            props: {
              style: { display: "flex", fontSize: FONT.body, color: theme.inkSoft, lineHeight: 1.6, marginTop: 4 },
              children: slide.body,
            },
          },
        ],
      },
    },
    footer(theme, ctx.handle, pageLabel(slide)),
  ]);
}

/** 한눈에 정리 슬라이드. 저장 동기를 만드는 장치라 목록을 크게 보여준다. */
export function buildSummary(theme, slide, ctx) {
  return card(theme, [
    {
      type: "div",
      props: {
        style: { ...MAIN, gap: 28 },
        children: [
          badge(theme, "한눈에 정리"),
          {
            type: "div",
            props: {
              style: { display: "flex", fontSize: FONT.heading, fontWeight: 800, color: theme.ink, lineHeight: 1.3 },
              children: slide.heading,
            },
          },
          {
            type: "div",
            props: {
              style: { display: "flex", flexDirection: "column", gap: 20, marginTop: 8 },
              children: (slide.points || []).map((point, i) => ({
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "row", gap: 16, alignItems: "flex-start" },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: { display: "flex", fontSize: FONT.point, fontWeight: 800, color: theme.accent },
                        children: `0${i + 1}`,
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: { display: "flex", fontSize: FONT.point, color: theme.ink, lineHeight: 1.5 },
                        children: point,
                      },
                    },
                  ],
                },
              })),
            },
          },
        ],
      },
    },
    footer(theme, ctx.handle, pageLabel(slide)),
  ]);
}

/** 마지막 CTA 슬라이드. 행동 요청은 하나만 담는다(체크리스트 16). */
export function buildCta(theme, slide, ctx) {
  return card(
    theme,
    [
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: 26,
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            textAlign: "center",
          },
          children: [
            {
              type: "div",
              props: {
                style: { display: "flex", fontSize: FONT.ctaHeading, fontWeight: 800, color: theme.ink, lineHeight: 1.3 },
                children: slide.heading,
              },
            },
            slide.body
              ? {
                  type: "div",
                  props: {
                    style: { display: "flex", fontSize: FONT.body, color: theme.inkSoft, lineHeight: 1.5 },
                    children: slide.body,
                  },
                }
              : hidden(),
            slide.saveLine ? badge(theme, slide.saveLine) : hidden(),
          ],
        },
      },
      footer(theme, ctx.handle, pageLabel(slide)),
    ],
    { justifyContent: "center" }
  );
}

export function buildSlideTree(theme, slide, ctx) {
  if (slide.type === "cover") return buildCover(theme, slide, ctx);
  if (slide.type === "summary") return buildSummary(theme, slide, ctx);
  if (slide.type === "cta" || slide.type === "outro") return buildCta(theme, slide, ctx);
  return buildContent(theme, slide, ctx);
}

export { FONT };
