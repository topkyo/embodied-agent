import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const outputRoot = resolve(root, ".vercel", "output");
const functionDir = resolve(outputRoot, "functions", "api", "server.func");

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with status ${result.status ?? 1}`);
  }
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

run("npm", ["run", "build", "-w", "@embodied-agent/web"]);
cpSync(resolve(root, "apps", "web", "dist"), resolve(outputRoot, "static"), {
  recursive: true,
});

mkdirSync(functionDir, { recursive: true });
await build({
  entryPoints: [resolve(root, "deploy", "vercel", "server.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: resolve(functionDir, "server.js"),
  sourcemap: false,
  external: ["better-sqlite3"],
});

writeFileSync(
  resolve(functionDir, "package.json"),
  `${JSON.stringify({ type: "module" }, null, 2)}\n`,
);
writeFileSync(
  resolve(functionDir, ".vc-config.json"),
  `${JSON.stringify(
    {
      runtime: "nodejs20.x",
      handler: "server.js",
      launcherType: "Nodejs",
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  resolve(outputRoot, "config.json"),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/admin/(.*)", dest: "/api/server?path=admin/$1" },
        { src: "/integrations/(.*)", dest: "/api/server?path=integrations/$1" },
        { src: "/dev/(.*)", dest: "/api/server?path=dev/$1" },
        { src: "/channels", dest: "/api/server?path=channels" },
        { src: "/health", dest: "/api/server?path=health" },
        { src: "/lang-suggest", dest: "/api/server?path=lang-suggest" },
        { src: "/domain-packs", dest: "/api/server?path=domain-packs" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(`Vercel Build Output ready: ${dirname(outputRoot)}`);
