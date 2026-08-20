#!/usr/bin/env node
/**
 * Seed demo profile settings/registry for greenhouse | robot | industrial.
 * Used by docker-compose.demo.yml entrypoints and scripts/demo-reset.sh.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function usage() {
  console.error(
    "用法: node scripts/demo-provision-profile.mjs <greenhouse|robot|industrial> <dataDir>",
  );
  process.exit(2);
}

const scene = process.argv[2];
const dataDir = process.argv[3];
if (!scene || !dataDir) usage();

if (!["greenhouse", "robot", "industrial"].includes(scene)) {
  console.error(`未知 scene: ${scene}`);
  usage();
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function copyIfExists(from, to) {
  if (fs.existsSync(from) && !fs.existsSync(to)) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    return true;
  }
  return false;
}

const deploymentId =
  scene === "robot"
    ? "dep-demo-robot-001"
    : scene === "industrial"
      ? "dep-demo-industrial-001"
      : "dep-demo-greenhouse-001";

const activeDomain =
  scene === "robot" ? "robotics" : scene === "industrial" ? "industrial" : "agriculture";

const mqttPort = scene === "robot" ? "1885" : scene === "industrial" ? "1886" : "1884";
const mqttUrl = process.env.MQTT_URL ?? `mqtt://127.0.0.1:${mqttPort}`;
const m20Port = process.env.M20_STUB_PORT ?? "3209";
const m20Url = process.env.M20_BASE_URL ?? `http://127.0.0.1:${m20Port}`;

const settingsPath = path.join(dataDir, "settings.json");
const fixtureSettingsPath = path.join(ROOT, "scripts/fixtures/ci-eval/settings.json");
const existingSettings = readJson(settingsPath) ?? readJson(fixtureSettingsPath) ?? {};

existingSettings.deployment_id = deploymentId;
existingSettings.deployment_name =
  scene === "robot" ? "Demo Robot" : scene === "industrial" ? "Demo Industrial" : "Demo Greenhouse";
existingSettings.mqtt_url = mqttUrl;
existingSettings.active_domain = activeDomain;

if (scene === "robot") {
  existingSettings.domain_configs = {
    ...(existingSettings.domain_configs ?? {}),
    robotics: {
      ...((existingSettings.domain_configs ?? {}).robotics ?? {}),
      m20_base_url: m20Url,
      default_robot_id: "m20-001",
      waypoints: [{ waypoint_id: "dock", name: "充电桩", points: [{ x: 0, y: 0, yaw: 0 }] }],
    },
  };
}

if (scene === "greenhouse") {
  const agri = (existingSettings.domain_configs ?? {}).agriculture ?? {};
  existingSettings.domain_configs = {
    ...(existingSettings.domain_configs ?? {}),
    agriculture: {
      flywheel_greenhouse_ids: ["gh-001", "gh-002"],
      ...agri,
    },
  };
}

if (scene === "industrial") {
  const industrial = (existingSettings.domain_configs ?? {}).industrial ?? {};
  existingSettings.domain_configs = {
    ...(existingSettings.domain_configs ?? {}),
    industrial: {
      default_cabinet_id: "cabinet-001",
      ...industrial,
    },
  };
}

writeJson(settingsPath, existingSettings);

function rewriteRegistryDeployment(registry, nextDeploymentId) {
  registry.deployments = (registry.deployments ?? []).map((item) => ({
    ...item,
    deployment_id: nextDeploymentId,
  }));
  for (const key of ["entities", "nodes", "devices"]) {
    registry[key] = (registry[key] ?? []).map((item) => ({
      ...item,
      deployment_id: nextDeploymentId,
    }));
  }
  return registry;
}

const registryPath = path.join(dataDir, "device-registry.json");
if (!fs.existsSync(registryPath)) {
  if (scene === "industrial") {
    const seed =
      readJson(path.join(ROOT, "scripts/fixtures/ci-industrial-eval/device-registry.json")) ?? null;
    if (!seed) throw new Error("缺少 industrial device-registry.json 种子");
    writeJson(registryPath, rewriteRegistryDeployment(seed, deploymentId));
  } else if (scene === "robot") {
    writeJson(registryPath, {
      deployments: [
        {
          deployment_id: deploymentId,
          name: "Demo Robot",
          timezone: "Asia/Shanghai",
          status: "active",
        },
      ],
      entities: [
        {
          entity_id: "m20-001",
          deployment_id: deploymentId,
          domain_id: "robotics",
          entity_type: "robot",
          name: "M20 机器狗",
          aliases: ["机器狗", "M20"],
          status: "active",
        },
      ],
      nodes: [
        {
          node_id: "m20-001",
          deployment_id: deploymentId,
          entity_id: "m20-001",
          status: "active",
        },
      ],
      devices: [
        {
          device_id: "m20-001",
          deployment_id: deploymentId,
          entity_id: "m20-001",
          device_type: "robot_dog",
          name: "M20 机器狗",
          aliases: ["机器狗", "M20"],
          node_id: "m20-001",
          transport: "m20_http",
          status: "active",
          default_for: "robot_dog",
        },
      ],
    });
  } else {
    const seed =
      readJson(path.join(ROOT, "scripts/fixtures/stack-bootstrap/device-registry.json")) ?? null;
    if (!seed) throw new Error("缺少 greenhouse device-registry.json 种子");
    writeJson(registryPath, rewriteRegistryDeployment(seed, deploymentId));
  }
} else {
  const registry = readJson(registryPath);
  if (registry) {
    writeJson(registryPath, rewriteRegistryDeployment(registry, deploymentId));
  }
}

const usersPath = path.join(dataDir, "users.json");
if (!fs.existsSync(usersPath)) {
  writeJson(
    usersPath,
    scene === "robot"
      ? {
          "owner-001": {
            user_id: "owner-001",
            role: "owner",
            deployment_id: deploymentId,
            display_name: "Demo Robot Owner",
          },
        }
      : {
          "owner-001": {
            user_id: "owner-001",
            role: "owner",
            deployment_id: deploymentId,
            display_name: "张老板",
          },
        },
  );
}

const tokenIssue = spawnSync("npx", ["tsx", "scripts/demo-issue-node-tokens.ts", deploymentId], {
  cwd: ROOT,
  env: { ...process.env, AGENT_DATA_DIR: dataDir },
  stdio: "inherit",
});
if (tokenIssue.status !== 0) {
  console.error("[demo-provision] node token 签发失败");
  process.exit(tokenIssue.status ?? 1);
}

console.log(`[demo-provision] scene=${scene} data=${dataDir} deployment=${deploymentId}`);
