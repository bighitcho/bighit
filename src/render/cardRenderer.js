import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveTheme } from "./templates/theme.js";
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
 * @param {{themeName: string, handle: string, slides: object[]}} deck
 * @param {string} outDir
 * @returns {Promise<string[]>} 생성된 PNG 파일 경로 목록 (순서대로)
 */
export async function renderCardNews(deck, outDir) {
  const theme = resolveTheme(deck.themeName);
  const fonts = loadFonts();
  mkdirSync(outDir, { recursive: true });

  const ctx = { handle: deck.handle, total: deck.slides.length };
  const files = [];

  for (let i = 0; i < deck.slides.length; i++) {
    const slide = deck.slides[i];
    const tree = buildSlideTree(theme, slide, ctx);
    const svg = await satori(tree, { width: theme.width, height: theme.height, fonts });
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: theme.width } });
    const png = resvg.render().asPng();
    const filePath = path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
    writeFileSync(filePath, png);
    files.push(filePath);
  }

  return files;
}
