#!/usr/bin/env bash
# 本地基础服务管理：Web/API/MQTT/M20 stub 常驻，tmux monitor 可随时关闭。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_ROOT="$ROOT/.agentstack/dev-services"
PROFILE_ROOT="$ROOT/.agentstack/dev-profiles"
CURRENT_SCENE_FILE="$STATE_ROOT/current-scene"

COMMAND="${1:-status}"
if [ $# -gt 0 ]; then shift; fi
case "$COMMAND" in
  -h|--help) COMMAND="help" ;;
esac

SCENE="${DEV_SCENE:-}"
case "$COMMAND" in
  logs)
    if [ -f "$CURRENT_SCENE_FILE" ]; then
      SCENE="${SCENE:-$(cat "$CURRENT_SCENE_FILE")}"
    fi
    ;;
esac

while [ $# -gt 0 ]; do
  case "$1" in
    --scene)
      SCENE="${2:-}"
      shift 2
      ;;
    --scene=*)
      SCENE="${1#*=}"
      shift
      ;;
    -h|--help)
      COMMAND="help"
      shift
      ;;
    *)
      echo "未知参数: $1" >&2
      exit 2
      ;;
  esac
done

usage() {
  cat <<'EOF'
用法:
  scripts/dev-services.sh start --scene greenhouse|robot|industrial
  scripts/dev-services.sh stop [--scene greenhouse|robot|industrial]
  scripts/dev-services.sh status [--scene greenhouse|robot|industrial]
  scripts/dev-services.sh logs [--scene greenhouse|robot|industrial]

环境变量:
  PORT / WEB_PORT / MQTT_PORT / M20_STUB_PORT / ADMIN_TOKEN / AGENT_DATA_DIR
EOF
}

validate_scene() {
  case "$1" in
    greenhouse|robot|industrial) ;;
    *)
      echo "未知 scene: $1（仅支持 greenhouse / robot / industrial）" >&2
      exit 2
      ;;
  esac
}

if [ "$COMMAND" = "help" ]; then
  usage
  exit 0
fi

if [ -n "$SCENE" ]; then
  validate_scene "$SCENE"
fi

if [ "$COMMAND" = "start" ] && [ -z "$SCENE" ]; then
  echo "start 需要显式指定 --scene greenhouse|robot|industrial；不再默认选择 greenhouse。" >&2
  usage >&2
  exit 2
fi

state_dir_for() {
  echo "$STATE_ROOT/$1"
}

pid_file() {
  echo "$(state_dir_for "$1")/pids/$2.pid"
}

log_file() {
  echo "$(state_dir_for "$1")/logs/$2.log"
}

is_pid_alive() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  [ -f "$file" ] && cat "$file" || true
}

service_alive() {
  local scene="$1" name="$2" pid
  pid="$(read_pid "$(pid_file "$scene" "$name")")"
  is_pid_alive "$pid"
}

port_busy_by_other() {
  local port="$1" expected_pid="${2:-}" pids pid
  # 只检测真正的 LISTEN 占用，忽略 CLOSE_WAIT/CLOSED 等残留连接（非监听者）。
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  [ -z "$pids" ] && return 1
  for pid in $pids; do
    if [ -n "$expected_pid" ] && [ "$pid" = "$expected_pid" ]; then
      continue
    fi
    echo "$pid"
    return 0
  done
  return 1
}

quote_env() {
  printf "%q" "$1"
}

write_env_file() {
  local scene="$1" state_dir data_dir api_port web_port mqtt_port admin_token mqtt_url api_url m20_port
  state_dir="$(state_dir_for "$scene")"
  data_dir="$2"
  api_port="$3"
  web_port="$4"
  mqtt_port="$5"
  admin_token="$6"
  mqtt_url="$7"
  api_url="$8"
  m20_port="$9"
  {
    printf "SCENE=%s\n" "$(quote_env "$scene")"
    printf "REPO_ROOT=%s\n" "$(quote_env "$ROOT")"
    printf "STATE_DIR=%s\n" "$(quote_env "$state_dir")"
    printf "AGENT_DATA_DIR=%s\n" "$(quote_env "$data_dir")"
    printf "API_PORT=%s\n" "$(quote_env "$api_port")"
    printf "WEB_PORT=%s\n" "$(quote_env "$web_port")"
    printf "MQTT_PORT=%s\n" "$(quote_env "$mqtt_port")"
    printf "MQTT_URL=%s\n" "$(quote_env "$mqtt_url")"
    printf "API_URL=%s\n" "$(quote_env "$api_url")"
    printf "ADMIN_TOKEN=%s\n" "$(quote_env "$admin_token")"
    printf "M20_STUB_PORT=%s\n" "$(quote_env "$m20_port")"
    # 本地交付 readiness 校验 sim-matrix 签名；未设则 attested=false → BLOCKED
    if [ -n "${EVAL_EVIDENCE_SECRET:-}" ]; then
      printf "EVAL_EVIDENCE_SECRET=%s\n" "$(quote_env "$EVAL_EVIDENCE_SECRET")"
    fi
  } >"$state_dir/env.sh"
}

prepare_profile() {
  local scene="$1" data_dir="$2" mqtt_url="$3" m20_url="$4"
  mkdir -p "$data_dir"
  SCENE="$scene" DATA_DIR="$data_dir" ROOT="$ROOT" MQTT_URL="$mqtt_url" M20_URL="$m20_url" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const scene = process.env.SCENE;
const dataDir = process.env.DATA_DIR;
const root = process.env.ROOT;
const mqttUrl = process.env.MQTT_URL;
const m20Url = process.env.M20_URL;
const deploymentId =
  scene === "robot"
    ? "dep-robot-m20-dev"
    : scene === "industrial"
      ? "dep-industrial-ci-001"
      : "dep-gh-pilot-001";

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

function defaultUsers() {
  if (scene === "robot") {
    return {
      "owner-001": {
        user_id: "owner-001",
        role: "owner",
        deployment_id: "dep-robot-m20-dev",
        display_name: "M20 Dev Owner",
      },
    };
  }
  return {
    "owner-001": {
      user_id: "owner-001",
      role: "owner",
      deployment_id: "dep-gh-pilot-001",
      display_name: "张老板",
    },
    "worker-001": {
      user_id: "worker-001",
      role: "worker",
      deployment_id: "dep-gh-pilot-001",
      display_name: "李工人",
    },
    "readonly-001": {
      user_id: "readonly-001",
      role: "readonly",
      deployment_id: "dep-gh-pilot-001",
      display_name: "访客只读",
    },
  };
}

const settingsPath = path.join(dataDir, "settings.json");
const fixtureSettingsPath = path.join(root, "scripts/fixtures/ci-eval/settings.json");
const existingSettings = readJson(settingsPath) ?? readJson(fixtureSettingsPath) ?? {};
existingSettings.deployment_id = deploymentId;
existingSettings.deployment_name =
  scene === "robot" ? "M20 Robot Dev" : scene === "industrial" ? "Industrial Dev" : "守棚工长试点";
existingSettings.mqtt_url = mqttUrl;
existingSettings.active_domain =
  scene === "robot" ? "robotics" : scene === "industrial" ? "industrial" : "agriculture";
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

const registryPath = path.join(dataDir, "device-registry.json");
if (!fs.existsSync(registryPath)) {
  if (scene === "industrial") {
    const copied = copyIfExists(
      path.join(root, "scripts/fixtures/ci-industrial-eval/device-registry.json"),
      registryPath,
    );
    if (!copied) {
      throw new Error("缺少 industrial device-registry.json 种子");
    }
  } else if (scene === "robot") {
    writeJson(registryPath, {
      deployments: [{ deployment_id: "dep-robot-m20-dev", name: "M20 Robot Dev", timezone: "Asia/Shanghai", status: "active" }],
      entities: [
        {
          entity_id: "m20-001",
          deployment_id: "dep-robot-m20-dev",
          domain_id: "robotics",
          entity_type: "robot",
          name: "M20 机器狗",
          aliases: ["机器狗", "M20"],
          status: "active",
        },
      ],
      nodes: [{ node_id: "m20-001", deployment_id: "dep-robot-m20-dev", entity_id: "m20-001", status: "active" }],
      devices: [
        {
          device_id: "m20-001",
          deployment_id: "dep-robot-m20-dev",
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
    const copied =
      copyIfExists(path.join(root, "scripts/fixtures/stack-bootstrap/device-registry.json"), registryPath);
    if (!copied) {
      throw new Error("缺少 greenhouse device-registry.json 种子");
    }
  }
}

const usersPath = path.join(dataDir, "users.json");
if (!fs.existsSync(usersPath)) {
  writeJson(usersPath, defaultUsers());
}
NODE
}

start_one() {
  local scene="$1" name="$2" port="$3" command="$4" pid old_pid busy log
  old_pid="$(read_pid "$(pid_file "$scene" "$name")")"
  if is_pid_alive "$old_pid"; then
    echo "已运行: ${name} pid=${old_pid}"
    return
  fi
  if [ -n "$port" ]; then
    busy="$(port_busy_by_other "$port" "$old_pid" || true)"
    if [ -n "$busy" ]; then
      echo "端口 :${port} 已被外部进程占用（pid=${busy}），拒绝隐式 kill。请先释放端口或改环境变量。" >&2
      exit 1
    fi
  fi
  mkdir -p "$(dirname "$(pid_file "$scene" "$name")")" "$(dirname "$(log_file "$scene" "$name")")"
  log="$(log_file "$scene" "$name")"
  echo "启动 ${name}，日志: ${log}"
  (
    cd "$ROOT"
    nohup bash -lc "$command" </dev/null >>"$log" 2>&1 &
    echo $! >"$(pid_file "$scene" "$name")"
  )
}

wait_for_port() {
  local port="$1" name="$2" host="${3:-127.0.0.1}" i
  for i in $(seq 1 50); do
    if command -v nc >/dev/null 2>&1; then
      if nc -z "$host" "$port" >/dev/null 2>&1; then
        return 0
      fi
    elif lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  echo "${name} 端口 :${port} 在 10s 内未就绪。" >&2
  return 1
}

stop_one() {
  local scene="$1" name="$2" file pid
  file="$(pid_file "$scene" "$name")"
  pid="$(read_pid "$file")"
  if ! is_pid_alive "$pid"; then
    rm -f "$file"
    return
  fi
  echo "停止 ${scene}/${name} pid=${pid}"
  kill "$pid" 2>/dev/null || true
  sleep 1
  if is_pid_alive "$pid"; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$file"
}

scene_dirs() {
  if [ -n "$SCENE" ]; then
    echo "$SCENE"
    return
  fi
  [ -d "$STATE_ROOT" ] || return 0
  for dir in "$STATE_ROOT"/*; do
    [ -d "$dir" ] && basename "$dir"
  done
}

start_scene() {
  local scene="$1"
  validate_scene "$scene"
  local state_dir data_dir api_port web_port mqtt_port m20_port admin_token mqtt_url api_url m20_url deployment_id active_domain
  # 透传仓库根 .env（LLM_API_KEY / EVAL_EVIDENCE_SECRET 等），空值不覆盖已有导出
  if [ -f "$ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/.env"
    set +a
  fi
  state_dir="$(state_dir_for "$scene")"
  data_dir="${AGENT_DATA_DIR:-$PROFILE_ROOT/$scene/data}"
  api_port="${PORT:-3001}"
  web_port="${WEB_PORT:-5173}"
  mqtt_port="${MQTT_PORT:-1883}"
  m20_port="${M20_STUB_PORT:-3099}"
  admin_token="${ADMIN_TOKEN:-dev-admin}"
  mqtt_url="${MQTT_URL:-mqtt://127.0.0.1:$mqtt_port}"
  api_url="http://127.0.0.1:$api_port"
  m20_url="http://127.0.0.1:$m20_port"
  deployment_id="dep-gh-pilot-001"
  active_domain="agriculture"
  if [ "$scene" = "robot" ]; then
    deployment_id="dep-robot-m20-dev"
    active_domain="robotics"
  elif [ "$scene" = "industrial" ]; then
    deployment_id="dep-industrial-ci-001"
    active_domain="industrial"
  fi

  mkdir -p "$state_dir/logs" "$state_dir/pids" "$PROFILE_ROOT/$scene"
  prepare_profile "$scene" "$data_dir" "$mqtt_url" "$m20_url"
  write_env_file "$scene" "$data_dir" "$api_port" "$web_port" "$mqtt_port" "$admin_token" "$mqtt_url" "$api_url" "$m20_port"
  echo "$scene" >"$CURRENT_SCENE_FILE"

  "$ROOT/scripts/ensure-workspace-runtime-build.sh"

  start_one "$scene" "broker" "$mqtt_port" \
    "cd $(quote_env "$ROOT") && exec npx --yes aedes-cli -p $(quote_env "$mqtt_port")"
  wait_for_port "$mqtt_port" "broker"

  if [ "$scene" = "robot" ]; then
    start_one "$scene" "m20-stub" "$m20_port" \
      "cd $(quote_env "$ROOT") && M20_STUB_PORT=$(quote_env "$m20_port") exec npx tsx scripts/m20-stub.ts"
    wait_for_port "$m20_port" "m20-stub"
  fi

  start_one "$scene" "api" "$api_port" \
    "cd $(quote_env "$ROOT") && NODE_ENV=development AGENT_DATA_DIR=$(quote_env "$data_dir") DEPLOYMENT_ID=$(quote_env "$deployment_id") ADMIN_TOKEN=$(quote_env "$admin_token") ACTIVE_DOMAIN=$(quote_env "$active_domain") MQTT_URL=$(quote_env "$mqtt_url") PORT=$(quote_env "$api_port") FLYWHEEL_DEV=$(quote_env "${FLYWHEEL_DEV:-}") SUSTAINED_ALERT_MINUTES=$(quote_env "${SUSTAINED_ALERT_MINUTES:-}") SUSTAINED_L2_COOLDOWN_SECONDS=$(quote_env "${SUSTAINED_L2_COOLDOWN_SECONDS:-}") DEVICE_HEARTBEAT_TIMEOUT_MS=$(quote_env "${DEVICE_HEARTBEAT_TIMEOUT_MS:-}") SCENE_OUTCOME_WINDOWS_MINUTES=$(quote_env "${SCENE_OUTCOME_WINDOWS_MINUTES:-}") LLM_API_KEY=$(quote_env "${LLM_API_KEY:-}") LLM_BASE_URL=$(quote_env "${LLM_BASE_URL:-}") LLM_MODEL=$(quote_env "${LLM_MODEL:-}") LLM_THINKING=$(quote_env "${LLM_THINKING:-}") EVAL_EVIDENCE_SECRET=$(quote_env "${EVAL_EVIDENCE_SECRET:-}") exec npm run api:dev"

  wait_for_port "$api_port" "api"

  if [ "$scene" = "industrial" ]; then
    echo "注册 industrial 模拟节点并下发 config…"
    (
      cd "$ROOT"
      AGENT_DATA_DIR="$data_dir" API_URL="$api_url" ADMIN_TOKEN="$admin_token" MQTT_URL="$mqtt_url" \
        npm run ensure:sim-industrial
    )
    start_one "$scene" "sim-industrial" "" \
      "cd $(quote_env "$ROOT") && NODE_ID=node-sim-industrial-001 DEPLOYMENT_ID=$(quote_env "$deployment_id") AGENT_DATA_DIR=$(quote_env "$data_dir") API_URL=$(quote_env "$api_url") ADMIN_TOKEN=$(quote_env "$admin_token") MQTT_URL=$(quote_env "$mqtt_url") exec npx tsx scripts/node-simulator.ts --profile=industrial"
  fi

  start_one "$scene" "web" "$web_port" \
    "cd $(quote_env "$ROOT") && VITE_API_PROXY=$(quote_env "$api_url") VITE_ADMIN_TOKEN=$(quote_env "$admin_token") WEB_PORT=$(quote_env "$web_port") exec ./scripts/web-dev.sh"

  echo ""
  status_scene "$scene"
  echo ""
  echo "Web: http://127.0.0.1:$web_port"
  echo "API: $api_url"
  echo "Data: $data_dir"
}

status_service() {
  local scene="$1" name="$2" port="${3:-}" pid status
  pid="$(read_pid "$(pid_file "$scene" "$name")")"
  if is_pid_alive "$pid"; then
    status="running pid=$pid"
  else
    status="stopped"
  fi
  if [ -n "$port" ]; then
    printf "  %-10s %-18s :%s\n" "$name" "$status" "$port"
  else
    printf "  %-10s %s\n" "$name" "$status"
  fi
}

status_scene() {
  local scene="$1" env_file
  env_file="$(state_dir_for "$scene")/env.sh"
  if [ -f "$env_file" ]; then
    # shellcheck disable=SC1090
    source "$env_file"
  else
    API_PORT="${PORT:-3001}"
    WEB_PORT="${WEB_PORT:-5173}"
    MQTT_PORT="${MQTT_PORT:-1883}"
    M20_STUB_PORT="${M20_STUB_PORT:-3099}"
    AGENT_DATA_DIR="${AGENT_DATA_DIR:-$PROFILE_ROOT/$scene/data}"
  fi
  echo "[$scene] data=$AGENT_DATA_DIR"
  status_service "$scene" "broker" "$MQTT_PORT"
  status_service "$scene" "api" "$API_PORT"
  status_service "$scene" "web" "$WEB_PORT"
  if [ "$scene" = "robot" ]; then
    status_service "$scene" "m20-stub" "$M20_STUB_PORT"
  fi
  if [ "$scene" = "industrial" ]; then
    status_service "$scene" "sim-industrial"
  fi
}

stop_scene() {
  local scene="$1"
  stop_one "$scene" "sim-industrial"
  stop_one "$scene" "web"
  stop_one "$scene" "api"
  stop_one "$scene" "m20-stub"
  stop_one "$scene" "broker"
  if command -v tmux >/dev/null 2>&1; then
    tmux kill-session -t "ea-$scene-monitor" 2>/dev/null || true
  fi
}

case "$COMMAND" in
  start)
    start_scene "$SCENE"
    ;;
  stop)
    for scene in $(scene_dirs); do
      stop_scene "$scene"
    done
    ;;
  status)
    any=0
    for scene in $(scene_dirs); do
      any=1
      status_scene "$scene"
    done
    if [ "$any" = "0" ]; then
      echo "没有 dev services 状态。"
    fi
    ;;
  logs)
    if [ -z "$SCENE" ]; then
      echo "没有当前 scene；请先启动或传 --scene。" >&2
      exit 1
    fi
    if ! ls "$(state_dir_for "$SCENE")/logs/"*.log >/dev/null 2>&1; then
      echo "暂无日志: $(state_dir_for "$SCENE")/logs" >&2
      exit 1
    fi
    tail -n 80 -f "$(state_dir_for "$SCENE")/logs/"*.log
    ;;
  *)
    usage
    exit 2
    ;;
esac
