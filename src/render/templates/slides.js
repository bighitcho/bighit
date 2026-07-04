// satori용 슬라이드 트리 빌더. slide.type 별로 커버/본문/마무리 레이아웃을 만든다.

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
        padding: 64,
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
              padding: 64,
              justifyContent: "space-between",
            },
            children,
          },
        },
      ],
    },
  };
}

function pill(theme, text) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignSelf: "flex-start",
        backgroundColor: theme.highlight,
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

function highlightText(theme, text) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        fontSize: 44,
        fontWeight: 800,
        color: theme.ink,
        backgroundColor: theme.highlight,
        padding: "4px 12px",
        lineHeight: 1.35,
      },
      children: text,
    },
  };
}

function handleFooter(theme, handle, pageLabel) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 18,
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", width: "100%", height: 2, backgroundColor: theme.border },
            children: [],
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              justifyContent: "space-between",
              fontSize: 28,
              color: theme.inkSoft,
              fontWeight: 400,
            },
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

export function buildCover(theme, slide, ctx) {
  return card(theme, [
    {
      type: "div",
      props: {
        style: { display: "flex", flexDirection: "column", gap: 28 },
        children: [
          slide.date ? pill(theme, slide.date) : { type: "div", props: { style: { display: "none" }, children: [] } },
          slide.eyebrow ? highlightText(theme, slide.eyebrow) : { type: "div", props: { style: { display: "none" }, children: [] } },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                fontSize: 72,
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
                    fontSize: 36,
                    fontWeight: 400,
                    color: theme.inkSoft,
                    lineHeight: 1.5,
                    marginTop: 8,
                  },
                  children: slide.subheadline,
                },
              }
            : { type: "div", props: { style: { display: "none" }, children: [] } },
        ],
      },
    },
    handleFooter(theme, ctx.handle, `1 / ${ctx.total}`),
  ]);
}

export function buildContent(theme, slide, ctx) {
  return card(theme, [
    {
      type: "div",
      props: {
        style: { display: "flex", flexDirection: "column", gap: 30 },
        children: [
          pill(theme, `STEP ${slide.index}`),
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                fontSize: 58,
                fontWeight: 800,
                color: theme.ink,
                lineHeight: 1.3,
                marginTop: 8,
              },
              children: slide.heading,
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                fontSize: 38,
                fontWeight: 400,
                color: theme.inkSoft,
                lineHeight: 1.6,
                marginTop: 4,
              },
              children: slide.body,
            },
          },
        ],
      },
    },
    handleFooter(theme, ctx.handle, `${slide.index + 1} / ${ctx.total}`),
  ]);
}

export function buildOutro(theme, slide, ctx) {
  return card(
    theme,
    [
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: 28,
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            textAlign: "center",
          },
          children: [
            {
              type: "div",
              props: {
                style: { display: "flex", fontSize: 56, fontWeight: 800, color: theme.ink, lineHeight: 1.3 },
                children: slide.heading,
              },
            },
            slide.subheading
              ? {
                  type: "div",
                  props: {
                    style: { display: "flex", fontSize: 34, color: theme.inkSoft, lineHeight: 1.5 },
                    children: slide.subheading,
                  },
                }
              : { type: "div", props: { style: { display: "none" }, children: [] } },
          ],
        },
      },
      handleFooter(theme, ctx.handle, `${ctx.total} / ${ctx.total}`),
    ],
    { justifyContent: "center" }
  );
}

export function buildSlideTree(theme, slide, ctx) {
  if (slide.type === "cover") return buildCover(theme, slide, ctx);
  if (slide.type === "outro") return buildOutro(theme, slide, ctx);
  return buildContent(theme, slide, ctx);
}
