import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(process.argv[2] ?? ".");

function refusePrivateCheckout(): void {
  if (existsSync(join(ROOT, ".github/workflows/deploy-vps.yml"))) {
    throw new Error("refusing to sanitize a private checkout (deploy-vps.yml is present)");
  }
}

const SPA_VERCEL_JSON = `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [{ "source": "/:path*", "destination": "/index.html" }]
}
`;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walkFiles(abs, out);
    else out.push(abs);
  }
  return out;
}

function rewriteMarkdownLinks(text: string, fileDir: string): string {
  return text.replace(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (full, raw: string) => {
    const withoutAnchor = raw.split("#")[0]?.split("?")[0] ?? raw;
    let target = withoutAnchor;
    try {
      target = decodeURIComponent(withoutAnchor);
    } catch {
      /* keep */
    }
    const resolved = target.startsWith("/")
      ? join(ROOT, target.slice(1))
      : resolve(fileDir, target);
    const rel = relative(ROOT, resolved).replaceAll("\\", "/");

    const label = full.match(/^\[([^\]]*)\]/)?.[1] ?? "link";

    if (rel.startsWith("docs/archive/releases/") || rel === "docs/archive/releases") {
      const changelogRel = relative(fileDir, join(ROOT, "CHANGELOG.md")).replaceAll("\\", "/");
      return `[CHANGELOG.md](${changelogRel})`;
    }
    if (!existsSync(resolved) || rel.startsWith("deploy/vps/") || rel === "deploy/vps") {
      return label;
    }
    return full;
  });
}

function stripMissingArchiveIndexRows(text: string, fileDir: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const match = line.match(/\]\(([^)\s]+)\)/);
      if (!match || !line.startsWith("|")) return true;
      const target = match[1]!.split("#")[0] ?? match[1]!;
      if (target.startsWith("http") || target.startsWith("mailto:")) return true;
      const resolved = resolve(fileDir, target);
      if (existsSync(resolved)) return true;
      return false;
    })
    .join("\n");
}

function scrubInstanceText(text: string): string {
  return text
    .replaceAll("/home/tim/project/EA", "the production checkout")
    .replaceAll("/home/tim", "the production host")
    .replaceAll("91.216.169.29", "<vps-ip>")
    .replace(/\bgoyun\b/g, "<vps-host>")
    .replaceAll("ea-web-9527.vercel.app", "your-web.vercel.app")
    .replaceAll("ea-site-9527.vercel.app", "your-site.vercel.app")
    .replaceAll("ea-web-9527", "your-web")
    .replaceAll("ea-site-9527", "your-site")
    .replaceAll("team_vZF69jAbikZqLi7whDRvrSx3", "<vercel-team>")
    .replace(
      /https?:\/\/(?!your-tunnel-url\.)[a-z0-9-]+\.trycloudflare\.com/gi,
      "https://your-tunnel-url.trycloudflare.com",
    );
}

function isProbablyText(abs: string): boolean {
  const lower = abs.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|bin|wasm)$/.test(lower)) return false;
  const buf = readFileSync(abs);
  return !buf.subarray(0, Math.min(buf.length, 4096)).includes(0);
}

function main(): void {
  refusePrivateCheckout();

  for (const rel of ["apps/web/vercel.json", "apps/site/vercel.json"]) {
    const abs = join(ROOT, rel);
    if (existsSync(abs)) writeFileSync(abs, SPA_VERCEL_JSON);
  }

  for (const abs of walkFiles(ROOT)) {
    const rel = relative(ROOT, abs).replaceAll("\\", "/");
    if (
      rel === "scripts/sanitize-public-snapshot.ts" ||
      rel === "scripts/check-public-snapshot.ts"
    ) {
      continue;
    }
    if (!isProbablyText(abs)) continue;
    let text = readFileSync(abs, "utf8");
    const original = text;
    if (rel.endsWith(".md")) {
      text = rewriteMarkdownLinks(text, dirname(abs));
      if (rel === "docs/archive/README.zh.md") {
        text = stripMissingArchiveIndexRows(text, dirname(abs));
      }
    }
    text = scrubInstanceText(text);
    if (text !== original) writeFileSync(abs, text);
  }

  console.log("[sanitize-public-snapshot] ok");
}

main();
