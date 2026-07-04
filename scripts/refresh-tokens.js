// 인스타그램/스레드 장기 토큰은 60일마다 만료된다.
// 이 스크립트는 주기적으로(주 1회 권장) 토큰을 갱신하고,
// GitHub Actions Secrets에 새 값을 자동으로 반영한다.
//
// 필요한 환경변수: META_APP_ID, META_APP_SECRET, IG_LONG_LIVED_TOKEN,
//                THREADS_LONG_LIVED_TOKEN, GH_PAT (repo secrets 쓰기 권한 PAT),
//                GITHUB_REPOSITORY (Actions에서 자동 제공)
import sodium from "libsodium-wrappers";

async function refreshInstagramToken() {
  const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", process.env.META_APP_ID);
  url.searchParams.set("client_secret", process.env.META_APP_SECRET);
  url.searchParams.set("fb_exchange_token", process.env.IG_LONG_LIVED_TOKEN);

  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(`인스타그램 토큰 갱신 실패: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function refreshThreadsToken() {
  const url = new URL("https://graph.threads.net/refresh_access_token");
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", process.env.THREADS_LONG_LIVED_TOKEN);

  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(`스레드 토큰 갱신 실패: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function updateGithubSecret(repo, name, value, pat) {
  const keyRes = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/public-key`, {
    headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" },
  });
  const { key, key_id } = await keyRes.json();

  await sodium.ready;
  const binKey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
  const binValue = sodium.from_string(value);
  const encrypted = sodium.crypto_box_seal(binValue, binKey);
  const encryptedValue = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);

  const putRes = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/${name}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({ encrypted_value: encryptedValue, key_id }),
  });
  if (!putRes.ok) throw new Error(`GitHub Secret(${name}) 갱신 실패: ${await putRes.text()}`);
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const pat = process.env.GH_PAT;
  if (!repo || !pat) throw new Error("GITHUB_REPOSITORY / GH_PAT 환경변수가 필요합니다.");

  const newIgToken = await refreshInstagramToken();
  await updateGithubSecret(repo, "IG_LONG_LIVED_TOKEN", newIgToken, pat);
  console.log("인스타그램 토큰 갱신 완료");

  const newThreadsToken = await refreshThreadsToken();
  await updateGithubSecret(repo, "THREADS_LONG_LIVED_TOKEN", newThreadsToken, pat);
  console.log("스레드 토큰 갱신 완료");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
