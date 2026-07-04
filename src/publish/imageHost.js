import { execSync } from "child_process";
import { copyFileSync, mkdirSync } from "fs";
import path from "path";

/**
 * Instagram/Threads Graph API는 이미지를 "공개 URL"로만 받을 수 있어서,
 * 렌더링된 PNG를 저장소에 커밋해 raw.githubusercontent.com URL로 접근 가능하게 만든다.
 * (별도의 이미지 호스팅 서비스나 키가 필요 없음)
 *
 * @param {string[]} localFiles
 * @param {string} runId 이 실행을 구분하는 폴더명 (예: 2026-07-04-1930)
 * @returns {string[]} 공개 접근 가능한 raw URL 목록 (localFiles와 같은 순서)
 */
export function publishImages(localFiles, runId) {
  const repo = process.env.GITHUB_REPOSITORY; // 예: bighitcho/bighit
  const branch = process.env.GITHUB_REF_NAME || execSync("git rev-parse --abbrev-ref HEAD").toString().trim();

  if (!repo) {
    throw new Error("GITHUB_REPOSITORY 환경변수가 없습니다. GitHub Actions 환경에서만 이미지 호스팅이 동작합니다.");
  }

  const relDir = path.join("public", "media", runId);
  mkdirSync(relDir, { recursive: true });

  const relFiles = [];
  for (const file of localFiles) {
    const dest = path.join(relDir, path.basename(file));
    copyFileSync(file, dest);
    relFiles.push(dest);
  }

  execSync(`git config user.name "card-news-bot"`);
  execSync(`git config user.email "card-news-bot@users.noreply.github.com"`);
  execSync(`git add ${relDir}`);
  execSync(`git commit -m "chore: 카드뉴스 이미지 업로드 (${runId})"`);
  execSync(`git push origin HEAD:${branch}`);

  return relFiles.map(
    (f) => `https://raw.githubusercontent.com/${repo}/${branch}/${f.split(path.sep).join("/")}`
  );
}
