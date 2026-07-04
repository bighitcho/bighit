// 카드뉴스 3종 테마 색상/치수 정의. 레퍼런스 영상의 "기본(그레이)/블루/정사각형 뉴스" 3개 템플릿에 대응.
export const THEMES = {
  gray: {
    label: "기본(그레이)",
    width: 1080,
    height: 1350,
    bg: "#F4F3EF",
    card: "#FFFFFF",
    ink: "#1C1C1C",
    inkSoft: "#6B6B63",
    border: "#E5E3DA",
    highlight: "#D6F26B",
    accent: "#3A3A32",
  },
  blue: {
    label: "블루",
    width: 1080,
    height: 1350,
    bg: "#E9F1FC",
    card: "#FFFFFF",
    ink: "#0F2544",
    inkSoft: "#4C6690",
    border: "#CFE0F5",
    highlight: "#CFE1FF",
    accent: "#2F6FED",
  },
  square: {
    label: "정사각형 뉴스",
    width: 1080,
    height: 1080,
    bg: "#FFF7E8",
    card: "#FFFFFF",
    ink: "#241C10",
    inkSoft: "#8A7752",
    border: "#EFDFB9",
    highlight: "#F3D06B",
    accent: "#B9861E",
  },
};

export function resolveTheme(name) {
  return THEMES[name] || THEMES.gray;
}
