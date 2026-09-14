import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveTheme, MIN_FONT_SIZE } from "./templates/theme.js";
import { buildSlideTree } from "./templates/slides.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "..", "..", "assets", "fonts");

let fontCache = null;
function loadFonts() {
  if (fontCache) return fontCache;
  fontCache = [
    { name: "Noto Sans KR", data: readFileSync(path.join(FONT_DIR, "NotoSansKR-Regular.ttf")), weight: 400, style: "normal" },
    { name: "Noto Sans KR", data: readFileSync(path.join(FONT_DIR, "NotoSansKR-Bold.ttf")), weight: 700, style: "normal" },
    { name: "Noto Sans KR", data: readFileSync(path.join(FONT_DIR, "NotoSansKR-ExtraBold.ttf")), weight: 800, style: "normal" },
  ];
  return fontCache;
}

/**
 * 모바일에서 읽히지 않는 글자 크기가 섞여 들어가는 것을 렌더 단계에서 막는다(체크리스트 08).
 * 템플릿을 수정하다 실수로 작은 폰트를 넣으면 여기서 바로 터진다.
 */
function assertFontSizes(node, slideIndex) {
  if (!node || typeof node !== "object") return;
  const size = node.props?.style?.fontSize;
  if (typeof size === "number" && size < MIN_FONT_SIZE) {
    throw new Error(`슬라이드 ${slideIndex}: 폰트 ${size}px 는 모바일 가독성 하한(${MIN_FONT_SIZE}px) 미달입니다.`);
  }
  const children = node.props?.children;
  if (Array.isArray(children)) children.forEach((c) => assertFontSizes(c, slideIndex));
  else if (children && typeof children === "object") assertFontSizes(children, slideIndex);
}

/**
 * @param {{themeName: string, handle: string, slides: object[]}} deck
 * @param {string} outDir
 * @returns {Promise<string[]>} 생성된 PNG 파일 경로 목록 (순서대로)
 */
export async function renderCardNews(deck, outDir) {
  const theme = resolveTheme(deck.themeName);
  const fonts = loadFonts();
  mkdirSync(outDir, { recursive: true });

  // 인스타그램 캐러셀 상한이 10장이다. 그보다 많으면 게시 단계에서 잘려나가므로 여기서 막는다.
  if (deck.slides.length > 10) {
    throw new Error(`슬라이드가 ${deck.slides.length}장입니다. 인스타그램 캐러셀 상한은 10장입니다.`);
  }

  const ctx = { handle: deck.handle, total: deck.slides.length };
  const files = [];

  for (let i = 0; i < deck.slides.length; i++) {
    // index/total 이 비어 있는 deck(수동 작성 등)도 렌더될 수 있게 여기서 보정한다.
    const slide = { index: i + 1, total: deck.slides.length, ...deck.slides[i] };
    const tree = buildSlideTree(theme, slide, ctx);
    assertFontSizes(tree, slide.index);

    const svg = await satori(tree, { width: theme.width, height: theme.height, fonts });
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: theme.width } });
    const png = resvg.render().asPng();
    const filePath = path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
    writeFileSync(filePath, png);
    files.push(filePath);
  }

  // 원고와 전략을 함께 남겨둔다. 나중에 인사이트와 대조해 어떤 유형이 먹혔는지 볼 수 있다.
  writeFileSync(path.join(outDir, "deck.json"), JSON.stringify(deck, null, 2) + "\n");

  return files;
}
