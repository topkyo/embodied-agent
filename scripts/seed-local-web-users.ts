/**
 * 本地固定 Web 账号：各 scene profile 共用一对 admin / user。
 * 真源与密码见 docs/operations/web-session.zh.md §本地固定账号。
 *
 *   npx tsx scripts/seed-local-web-users.ts
 *   npx tsx scripts/seed-local-web-users.ts --scene industrial
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword } from "../apps/api/src/auth/web-session/password.js";

const ROOT = resolve(import.meta.dirname, "..");
const PROFILE_ROOT = resolve(ROOT, ".agentstack/dev-profiles");

/** 本机工作台固定账号（勿提交真实生产口令；仅本地 profile）。 */
export const LOCAL_FIXED_WEB_USERS = {
  admin: {
    email: "admin@example.com",
    password: "admin-pass1",
    role: "admin" as const,
    display_name: "Local Admin",
  },
  user: {
    email: "user@example.com",
    password: "user-pass1",
    role: "user" as const,
    display_name: "Local User",
  },
};

const SCENES = ["greenhouse", "robot", "industrial"] as const;

function sceneArg(): (typeof SCENES)[number][] {
  const idx = process.argv.indexOf("--scene");
  if (idx >= 0 && process.argv[idx + 1]) {
    const s = process.argv[idx + 1] as (typeof SCENES)[number];
    if (!SCENES.includes(s)) {
      throw new Error(`未知 scene: ${s}（仅 ${SCENES.join("|")}）`);
    }
    return [s];
  }
  return [...SCENES];
}

function seedScene(scene: (typeof SCENES)[number]): void {
  const authDir = resolve(PROFILE_ROOT, scene, "data", "auth");
  mkdirSync(authDir, { recursive: true });
  const now = new Date().toISOString();
  const users = [
    {
      user_id: `local-admin-${scene}`,
      role: LOCAL_FIXED_WEB_USERS.admin.role,
      display_name: LOCAL_FIXED_WEB_USERS.admin.display_name,
      created_at: now,
      email: LOCAL_FIXED_WEB_USERS.admin.email,
      password_hash: hashPassword(LOCAL_FIXED_WEB_USERS.admin.password),
    },
    {
      user_id: `local-user-${scene}`,
      role: LOCAL_FIXED_WEB_USERS.user.role,
      display_name: LOCAL_FIXED_WEB_USERS.user.display_name,
      created_at: now,
      email: LOCAL_FIXED_WEB_USERS.user.email,
      password_hash: hashPassword(LOCAL_FIXED_WEB_USERS.user.password),
    },
  ];
  const path = resolve(authDir, "web-users.json");
  writeFileSync(path, `${JSON.stringify({ bootstrap_redeemed: true, users }, null, 2)}\n`);
  console.log(`[seed-local-web-users] ${scene} → ${path} (admin+user only)`);
}

for (const scene of sceneArg()) {
  seedScene(scene);
}
