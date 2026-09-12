// 카드뉴스 테마 정의.
// 체크리스트 07(4:5 캔버스), 11(악센트 컬러 1개), 12(그라디언트·장식 금지)를 테마 단계에서 강제한다.

// 정사각형보다 4:5가 피드 공간을 30% 더 차지한다. 모든 테마는 1080×1350 고정.
export const CANVAS = { width: 1080, height: 1350 };

// 모바일 가독성 하한. 이 값보다 작은 글자는 렌더러가 거부한다.
export const MIN_FONT_SIZE = 28;

export const THEMES = {
  gray: {
    label: "기본(그레이)",
    ...CANVAS,
    bg: "#F4F3EF",
    card: "#FFFFFF",
    ink: "#1C1C1C",
    inkSoft: "#5F5F57",
    border: "#E5E3DA",
    // 악센트 1개(라임) + 중성색만. accentSoft 는 같은 색의 연한 배경 톤이다.
    accent: "#4F7A0B",
    accentSoft: "#D6F26B",
  },
  blue: {
    label: "블루",
    ...CANVAS,
    bg: "#E9F1FC",
    card: "#FFFFFF",
    ink: "#0F2544",
    inkSoft: "#44608C",
    border: "#CFE0F5",
    accent: "#2F6FED",
    accentSoft: "#D6E4FF",
  },
  amber: {
    label: "뉴스(앰버)",
    ...CANVAS,
    bg: "#FFF7E8",
    card: "#FFFFFF",
    ink: "#241C10",
    inkSoft: "#7A6842",
    border: "#EFDFB9",
    accent: "#A8741A",
    accentSoft: "#F7E3A8",
  },
};

// 이전 버전의 CARD_THEME=square(1:1) 설정은 4:5 앰버 테마로 이어받는다.
const ALIASES = { square: "amber", news: "amber" };

export function resolveTheme(name) {
  const key = ALIASES[name] || name;
  return THEMES[key] || THEMES.gray;
}
