import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const required = [
  "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "ALCHEMY_PASSWORD", "ALCHEMY_STATE_TOKEN",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_PLACES_KEY", "GOOGLE_MAPS_BROWSER_KEY", "BETTER_AUTH_SECRET",
];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) throw new Error(`Missing deployment variables: ${missing.join(", ")}`);
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain")) throw new Error("Commit or remove local changes before deploying.");
const commit = git("rev-parse", "HEAD");
const result = spawnSync(process.execPath, ["node_modules/alchemy/bin/alchemy.js", "deploy", "--stage", "dev"], {
  stdio: "inherit",
  env: { ...process.env, ALCHEMY_STAGE: "dev", DEPLOY_COMMIT: commit },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
for (const origin of ["https://yvr-kocho-sh-api-dev.yvr-kocho.workers.dev", "https://yvr.kocho.sh"]) {
  let verified = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch(`${origin}/version`, { cache: "no-store" });
      verified = response.ok && (await response.json()).commit === commit;
      if (verified) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!verified) throw new Error(`Deployment verification failed for ${origin}: expected ${commit}`);
  const response = await fetch(origin);
  const html = await response.text();
  if (!response.ok || response.headers.get("x-deploy-commit") !== commit || !/window\.__MAPS_KEY__ = "[^"]/.test(html)) {
    throw new Error(`Live page verification failed for ${origin}`);
  }
  console.log(`Verified ${origin} at ${commit}`);
}
