#!/usr/bin/env python3
"""Telegram Bot for VPS management + Droid CLI integration.

Commands:
  /status    — 服务状态 + 资源使用
  /health    — API 健康检查
  /logs [n]  — 最近 n 行 API 日志（默认 20）
  /restart   — 重启 API (systemd)
  /deploy    — 手动触发部署（git pull + systemctl restart）
  /tunnel    — 当前 Tunnel URL
  /traffic   — vnstat 流量摘要
  /droid <task>  — 派任务给 Droid CLI（droid exec --auto low）
  /droid-continue  — 继续上一个 Droid 会话
  /droid-push — 授权 Droid push + 部署（--auto high）
  /droid-status — 查看当前 Droid 会话状态
  /help      — 命令列表

Setup:
  pip3 install urllib3 (or use stdlib urllib)
  Token: /home/tim/scripts/.telegram-token
  Chat ID: /home/tim/scripts/.telegram-chat-id
  Droid: export PATH=/home/tim/.local/bin:$PATH && droid (首次需认证)
  Run: nohup python3 /home/tim/scripts/tg-bot.py &
  Or in tmux: python3 /home/tim/scripts/tg-bot.py
"""

import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error

TOKEN = open("/home/tim/scripts/.telegram-token").read().strip()
CHAT_ID = open("/home/tim/scripts/.telegram-chat-id").read().strip()
API_BASE = f"https://api.telegram.org/bot{TOKEN}"
REPO_DIR = "/home/tim/project/EA"
ALLOWED_CHAT = CHAT_ID  # 只允许配置的 chat ID
DROID_BIN = "/home/tim/.local/bin/droid"
DROID_SESSION_FILE = "/home/tim/scripts/.droid-session"
SLACK_WEBHOOK_FILE = "/home/tim/scripts/.slack-webhook"

def tg_send(text, chat_id=None):
    """Send message to Telegram."""
    cid = chat_id or CHAT_ID
    url = f"{API_BASE}/sendMessage"
    data = json.dumps({"chat_id": cid, "text": text, "parse_mode": "Markdown"}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"send failed: {e}", file=sys.stderr)

def run(cmd, timeout=30):
    """Run shell command, return stdout."""
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip() or r.stderr.strip()
    except subprocess.TimeoutExpired:
        return "command timed out"
    except Exception as e:
        return f"error: {e}"

def cmd_status():
    services = run("sudo systemctl is-active ea-api ea-simulator@node-sim-gh-001 ea-simulator@node-sim-gh-002 mosquitto caddy cloudflared-tunnel sing-box 2>&1")
    mem = run("free -h | grep Mem")
    disk = run("df -h / | tail -1")
    load = run("cat /proc/loadavg")
    return f"*VPS 状态*\n\n*服务:*\n{services}\n\n*内存:*\n{mem}\n\n*磁盘:*\n{disk}\n\n*负载:*\n{load}"

def cmd_health():
    api = run("curl -sf http://127.0.0.1:3001/health 2>/dev/null || echo 'API DOWN'")
    # Tunnel URL 优先读 tunnel-watch 状态文件（journal 会滚动，URL 常抓不到）
    tunnel_url = run("cat /home/tim/scripts/.tunnel-url-state 2>/dev/null | tr -d '\\n'")
    if not tunnel_url.startswith("https://"):
        tunnel_url = run("sudo journalctl -u cloudflared-tunnel --no-pager 2>/dev/null | grep -o 'https://[a-z0-9-]*\\.trycloudflare\\.com' | tail -1")
    tunnel_health = run(f"curl -sf --max-time 10 {tunnel_url}/health 2>/dev/null || echo 'Tunnel DOWN'") if tunnel_url else "Tunnel URL not found"
    caddy = run("sudo systemctl is-active caddy")
    singbox = run("sudo systemctl is-active sing-box")
    cloudflared = run("sudo systemctl is-active cloudflared-tunnel")
    return f"*健康检查*\n\nAPI: {api}\nTunnel: {tunnel_health}\nCaddy: {caddy}\nSing-box: {singbox}\nCloudflared: {cloudflared}"

def cmd_logs(n="20"):
    n = int(n) if n.isdigit() else 20
    logs = run(f"sudo journalctl -u ea-api --no-pager -n {n} 2>&1")
    if len(logs) > 3000:
        logs = logs[-3000:]
    return f"*API 日志 (最后 {n} 行)*\n```\n{logs}\n```"

def cmd_restart():
    result = run("sudo systemctl restart ea-api 2>&1", timeout=60)
    sim1 = run("(systemctl is-enabled ea-simulator@node-sim-gh-001 >/dev/null 2>&1 && sudo systemctl restart ea-simulator@node-sim-gh-001 2>&1) || echo 'gh-001 not enabled'", timeout=30)
    sim2 = run("(systemctl is-enabled ea-simulator@node-sim-gh-002 >/dev/null 2>&1 && sudo systemctl restart ea-simulator@node-sim-gh-002 2>&1) || echo 'gh-002 not enabled'", timeout=30)
    return f"*重启服务 (systemd)*\nAPI: {result}\nSim gh-001: {sim1}\nSim gh-002: {sim2}\n\n等待 10 秒后可用"

def cmd_deploy():
    steps = []
    steps.append(run("cd /home/tim/project/EA && sudo -u tim git pull origin main 2>&1", timeout=30))
    steps.append(run("cd /home/tim/project/EA && sudo -u tim npm ci --include=dev 2>&1", timeout=180))
    steps.append(run("cd /home/tim/project/EA && sudo -u tim bash scripts/ensure-workspace-runtime-build.sh 2>&1", timeout=60))
    steps.append(run("sudo systemctl restart ea-api 2>&1", timeout=60))
    sim1 = run("(systemctl is-enabled ea-simulator@node-sim-gh-001 >/dev/null 2>&1 && sudo systemctl restart ea-simulator@node-sim-gh-001 2>&1) || echo 'gh-001 not enabled'", timeout=30)
    sim2 = run("(systemctl is-enabled ea-simulator@node-sim-gh-002 >/dev/null 2>&1 && sudo systemctl restart ea-simulator@node-sim-gh-002 2>&1) || echo 'gh-002 not enabled'", timeout=30)
    steps.append(sim1)
    steps.append(sim2)
    return "*手动部署*\n" + "\n\n".join(steps[:500])

def cmd_tunnel():
    url = run("cat /home/tim/scripts/.tunnel-url-state 2>/dev/null | tr -d '\\n'")
    if not url.startswith("https://"):
        url = run("sudo journalctl -u cloudflared-tunnel --no-pager 2>/dev/null | grep -o 'https://[a-z0-9-]*\\.trycloudflare\\.com' | tail -1")
    # Clash panel is localhost-only (S3); use: ssh -L 9090:127.0.0.1:9090 ...
    return f"*Tunnel URL*\n{url or 'not found'}"

def cmd_traffic():
    today = run("vnstat --oneline -i eth0 2>/dev/null || echo 'vnstat data not ready'")
    month = run("vnstat --oneline -i eth0 --months 1 2>/dev/null || echo 'vnstat data not ready'")
    return f"*流量统计*\n\n今日:\n```\n{today}\n```\n\n本月:\n```\n{month}\n```"

def cmd_help():
    return """*VPS Telegram Bot 命令*
/status — 容器状态 + 资源
/health — 健康检查
/logs [n] — API 日志（默认 20 行）
/restart — 重启 API 容器
/deploy — 手动部署
/tunnel — Tunnel URL
/traffic — 流量统计
/droid <task> — 派任务给 Droid（只读分析）
/droid-continue — 继续上一个 Droid 会话
/droid-push — 授权 Droid push + 部署
/droid-status — 查看 Droid 会话状态
/help — 本帮助"""

DROID_SESSIONS = {}  # session_id -> {"task": str, "status": str}

def send_slack(text):
    """Send notification to Slack webhook."""
    webhook = ""
    try:
        webhook = open(SLACK_WEBHOOK_FILE).read().strip()
    except Exception:
        return
    if not webhook:
        return
    payload = json.dumps({"text": text}).encode()
    req = urllib.request.Request(webhook, data=payload, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass

def cmd_droid(task):
    """Run droid exec in background thread (--auto low)."""
    if not task:
        return "*用法:* /droid <任务描述>\n例如: /droid 检查 API 日志有没有错误"
    if not os.path.isfile(DROID_BIN):
        return "Droid CLI 未安装或未认证。SSH 到 VPS 运行 droid 认证。"
    tg_send(f"⏳ Droid 开始执行（后台）: {task[:100]}", CHAT_ID)
    threading.Thread(target=_droid_worker, args=(task, "low", None), daemon=True).start()
    return "Droid 已在后台启动，完成后自动回复。期间可继续使用其他命令。"

def _droid_worker(task, auto_level, session_id):
    """Background worker for droid exec. Sends result via Telegram when done."""
    if session_id:
        cmd = f"cd {REPO_DIR} && {DROID_BIN} exec --session-id {session_id} --auto {auto_level} --output-format json \"{task[:200]}\""
    else:
        cmd = f"cd {REPO_DIR} && {DROID_BIN} exec --auto {auto_level} --output-format json -w tg-droid --cwd {REPO_DIR} {json.dumps(task)}"
    result = run(cmd, timeout=300)
    sid = ""
    is_error = False
    try:
        data = json.loads(result)
        sid = data.get("session_id", "")
        is_error = data.get("is_error", False)
        summary = data.get("result", result[:1000])
    except Exception:
        summary = result[:1000] if result else "no output"
    if sid:
        DROID_SESSIONS["last"] = {"session_id": sid, "task": task, "status": "error" if is_error else "done"}
        try:
            with open(DROID_SESSION_FILE, "w") as f:
                json.dump(DROID_SESSIONS["last"], f)
        except Exception:
            pass
    send_slack(f"🤖 Droid 任务完成\n任务: {task[:80]}\n状态: {'失败' if is_error else '成功'}\n用 /droid-continue 继续，/droid-push 授权部署")
    if len(summary) > 3000:
        summary = summary[:3000] + "\n...(截断)"
    label = "续接" if session_id else ("Push" if auto_level == "high" else "")
    tg_send(f"*Droid {label} 结果*\n状态: {'❌ 失败' if is_error else '✅ 完成'}\n会话: `{sid[:20]}`\n\n{summary}", CHAT_ID)

def cmd_droid_continue():
    """Continue last droid session in background."""
    session = _get_last_session()
    if not session:
        return "没有可继续的 Droid 会话。先用 /droid <task> 开始一个。"
    tg_send("⏳ Droid 继续执行（后台）...", CHAT_ID)
    threading.Thread(target=_droid_worker, args=(f"继续上一个任务: {session['task'][:80]}", "low", session["session_id"]), daemon=True).start()
    return "Droid 续接已在后台启动。"

def cmd_droid_push():
    """Authorize droid push in background."""
    session = _get_last_session()
    if not session:
        return "没有可授权的 Droid 会话。先用 /droid <task> 开始一个。"
    tg_send("⏳ Droid 执行 push（已授权，后台）...", CHAT_ID)
    push_task = f"git add -A && git commit -m \"droid: {session['task'][:50]}\" && git push origin main"
    threading.Thread(target=_droid_worker, args=(push_task, "high", session["session_id"]), daemon=True).start()
    return "Droid push 已在后台启动，完成后通知。"

def _get_last_session():
    """Get last droid session from memory or file."""
    session = DROID_SESSIONS.get("last")
    if session:
        return session
    try:
        session = json.load(open(DROID_SESSION_FILE))
        DROID_SESSIONS["last"] = session
        return session
    except Exception:
        return None

def cmd_droid_status():
    """Show current droid session status."""
    session = DROID_SESSIONS.get("last")
    if not session:
        try:
            session = json.load(open(DROID_SESSION_FILE))
        except Exception:
            return "没有 Droid 会话记录。"
    return f"*Droid 会话状态*\n会话 ID: `{session.get('session_id', 'N/A')[:20]}`\n任务: {session.get('task', 'N/A')[:80]}\n状态: {session.get('status', 'N/A')}"

HANDLERS = {
    "/status": cmd_status,
    "/health": cmd_health,
    "/logs": cmd_logs,
    "/restart": cmd_restart,
    "/deploy": cmd_deploy,
    "/tunnel": cmd_tunnel,
    "/traffic": cmd_traffic,
    "/droid": cmd_droid,
    "/droid-continue": cmd_droid_continue,
    "/droid-push": cmd_droid_push,
    "/droid-status": cmd_droid_status,
    "/help": cmd_help,
}

def process_message(text, chat_id):
    if str(chat_id) != str(ALLOWED_CHAT):
        tg_send("未授权", chat_id)
        return
    parts = text.strip().split(maxsplit=1)
    cmd = parts[0].lower()
    arg = parts[1] if len(parts) > 1 else ""
    handler = HANDLERS.get(cmd)
    if handler:
        try:
            reply = handler(arg) if cmd in ("/logs", "/droid") else handler()
        except Exception as e:
            reply = f"命令执行失败: {e}"
        tg_send(reply, chat_id)
    else:
        tg_send(f"未知命令: {cmd}\n发送 /help 查看可用命令", chat_id)

def main():
    print(f"Telegram Bot started, chat_id={CHAT_ID}")
    offset = 0
    while True:
        try:
            url = f"{API_BASE}/getUpdates?offset={offset}&timeout=30"
            resp = urllib.request.urlopen(url, timeout=35)
            data = json.loads(resp.read())
            for update in data.get("result", []):
                offset = update["update_id"] + 1
                msg = update.get("message", {})
                text = msg.get("text", "")
                chat_id = msg.get("chat", {}).get("id")
                if text and chat_id:
                    print(f"recv: {text} from {chat_id}")
                    process_message(text, chat_id)
        except urllib.error.URLError as e:
            print(f"poll error: {e}", file=sys.stderr)
            time.sleep(5)
        except Exception as e:
            print(f"error: {e}", file=sys.stderr)
            time.sleep(5)

if __name__ == "__main__":
    main()
