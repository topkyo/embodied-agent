# VPS 服务清单与安全须知

> IP: 91.216.169.29 | OS: Ubuntu 24.04 | 1C2G | 更新日期: 2026-07-28
>
> **修改防火墙或端口前，务必先对照本文件。**

## 目录布局

| 路径                                | 说明                                     |
| ----------------------------------- | ---------------------------------------- |
| `/home/tim/project/EA`              | 源码仓库                                 |
| `/home/tim/var/embodied-agent-data` | 运行时数据（`AGENT_DATA_DIR`）           |
| `/home/tim/var/mosquitto-runtime`   | Mosquitto 配置                           |
| `/home/tim/scripts`                 | 运维脚本 + 密钥                          |
| `/home/tim/backups`                 | 本地备份                                 |

## Vercel 前端域名

| 项目   | URL                               | 说明               |
| ------ | --------------------------------- | ------------------ |
| 工作台 | `https://ea-web-9527.vercel.app`  | 登录、场景 ops     |
| 营销站 | `https://ea-site-9527.vercel.app` | 公开首页、场景叙事 |

Vercel `vercel.json` 中的 rewrites 将 `/admin/*`、`/auth/*` 等 API 路径代理到 Cloudflare Tunnel URL。

## 端口总览

| 端口  | 协议 | 监听地址     | 服务                 | 对外      | 用途                                 |
| ----- | ---- | ------------ | -------------------- | --------- | ------------------------------------ |
| 22    | TCP  | 0.0.0.0      | sshd                 | ✅        | SSH 远程管理                         |
| 80    | TCP  | 127.0.0.1    | Caddy                | ❌ 仅本地 | 反向代理 → API + SPA 静态文件        |
| 443   | TCP  | * (所有接口) | sing-box             | ✅        | VLESS Reality 代理                   |
| 1883  | TCP  | 127.0.0.1    | Mosquitto (systemd)  | ❌ 仅本地 | MQTT broker（API + 本机模拟器）      |
| 3001  | TCP  | 127.0.0.1    | ea-api (systemd)     | ❌ 仅本地 | 具身Agent API（`HOST=127.0.0.1`）    |
| 2019  | TCP  | 127.0.0.1    | Caddy admin          | ❌ 仅本地 | Caddy 管理 API                       |
| 20241 | TCP  | 127.0.0.1    | cloudflared          | ❌ 仅本地 | Cloudflare Tunnel 指标               |
| 9090  | TCP  | 127.0.0.1    | sing-box (Clash API) | ❌ 仅本地 | 代理流量面板 API，Caddy /clash/ 反代 |
| 18877 | UDP  | * (所有接口) | sing-box             | ✅        | Hysteria2 代理                       |
| 41641 | UDP  | 0.0.0.0      | tailscaled           | ✅        | Tailscale WireGuard                  |

## 系统服务 (systemd)

| 服务                 | 状态   | 说明                                                  |
| -------------------- | ------ | ----------------------------------------------------- |
| `ssh`                | active | SSH 服务，端口 22                                     |
| `ea-api`             | active | 具身Agent API，端口 3001，仅本地访问                  |
| `ea-simulator@node-sim-gh-001` | active | 温室节点模拟器（gh-001），发布遥测供演示/验收 |
| `ea-simulator@node-sim-gh-002` | active | 温室节点模拟器（gh-002），发布遥测供演示/验收 |
| `mosquitto`          | active | MQTT broker，仅 127.0.0.1:1883，runtime conf + ACL     |
| `sing-box`           | active | 代理服务，VLESS (443/TCP) + Hysteria2 (18877/UDP)     |
| `caddy`              | active | Web 服务器，绑定 127.0.0.1:80，反向代理 API 路径      |
| `cloudflared-tunnel` | active | Cloudflare Quick Tunnel，出站隧道连接 Cloudflare 边缘 |
| `tailscaled`         | active | Tailscale VPN 节点                                    |
| `tg-bot`             | active | Telegram Bot，VPS 管理 + Droid CLI 集成（~11MB）      |
| `vnstat`             | active | 网卡流量统计（eth0）                                  |

## sing-box 代理配置

| 入站协议      | 端口      | 传输             | TLS                               |
| ------------- | --------- | ---------------- | --------------------------------- |
| VLESS Reality | 443/TCP   | xtls-rprx-vision | Reality (伪装 www.cloudflare.com) |
| Hysteria2     | 18877/UDP | QUIC             | 自签证书                          |

## 防火墙 (ufw)

```
22/tcp      ALLOW   Anywhere       # SSH
443/tcp     ALLOW   Anywhere       # sing-box VLESS
18877/udp   ALLOW   Anywhere       # sing-box Hysteria2
```

**注意**：修改端口时同时核对 `ufw` 与 Tailscale `ts-input`。当前 MQTT/API 仅 loopback，不依赖公网 1883/3001。

## 网络流量路径

```
外部用户
  │
  ├──→ :443 TCP ──→ sing-box (VLESS Reality 代理)
  ├──→ :18877 UDP ──→ sing-box (Hysteria2 代理)
  ├──→ :22 TCP ──→ SSH
  │
  └──→ Vercel (HTTPS)
        │ rewrites /admin/* 等
        ▼
      Cloudflare Tunnel (HTTPS, 出站)
        │
        ▼
      localhost:80 → Caddy
        ├── /admin/* /auth/* 等 → 127.0.0.1:3001 (ea-api, systemd)
        └── / → 静态 SPA (apps/web/dist)

本机模拟器 / API
  └──→ 127.0.0.1:1883 → Mosquitto（认证 + ACL，不对外）
```

## 禁止操作清单

| 禁止                                         | 原因                                           |
| -------------------------------------------- | ---------------------------------------------- |
| ❌ 关闭 443/tcp                              | sing-box VLESS 代理依赖此端口                  |
| ❌ 关闭 18877/udp                            | sing-box Hysteria2 代理依赖此端口              |
| ❌ 关闭 22/tcp                               | SSH 是主要管理通道                             |
| ❌ 将 Caddy / ea-api bind 改回 0.0.0.0       | 会暴露 API 到公网，绕过 Cloudflare Tunnel 加密 |
| ❌ 将 Mosquitto 监听改成 0.0.0.0 且无鉴权    | MQTT 明文暴露风险                              |
| ❌ 停止 cloudflared-tunnel 且无替代 HTTPS    | Vercel rewrites 将全部失效                     |
| ❌ 修改 sing-box 配置但不重启服务            | 配置不一致导致连接异常                         |
| ❌ 在未检查监听进程的情况下删除 ufw 端口规则 | 可能误伤其他服务（如本次 443 事件）            |

## 资源使用

| 资源 | 值                                |
| ---- | --------------------------------- |
| CPU  | 1 核                              |
| 内存 | 1.9 GB (已用 ~300 MB, 可用 ~1.6 GB) |
| Swap | 1.4 GB (已用 ~100 MB)               |
| 磁盘 | 20 GB (已用 8.0 GB, 可用 11 GB)   |

## 自动化脚本 (cron)

| 脚本                                  | 频率       | 说明                                                                 |
| ------------------------------------- | ---------- | -------------------------------------------------------------------- |
| `/home/tim/scripts/tunnel-watch.sh`   | 每 5 分钟  | 检测 Tunnel URL 变化，自动更新 Vercel；URL 优先读状态文件 + journal  |
| `/home/tim/scripts/health-watch.sh`   | 每 5 分钟  | 本地检查 API/Caddy/Tunnel/systemd/磁盘/内存；外部检查每 30 分钟      |
| `/home/tim/scripts/cloudflared-tunnel-entry.sh` | cloudflared 启动 | 包装 Quick Tunnel，把分配到的 URL 写入 `.tunnel-url-state` |
| `/home/tim/scripts/alert.sh`          | 按需调用   | 发送告警到 Telegram Bot + Slack webhook（由 health-watch.sh 调用）   |
| `/home/tim/scripts/traffic-report.sh` | 每天 09:00 | vnstat 流量报告发送到 Slack                                          |

### 运维备注（2026-07-28）

- **模拟器**：`ea-simulator@node-sim-gh-001/002` 保持常开（演示/验收遥测）；若内存紧张可停。
- **内核 reboot**：`/var/run/reboot-required` 可能仍在；本轮按要求**未执行主机重启**，需另排窗口。
- **Named Tunnel**：仍为 Quick Tunnel；中长期建议迁 Named Tunnel 固定域名，去掉 URL 漂移。

### 本地脚本（不在 VPS 上）

| 脚本                        | 频率       | 说明                                          |
| --------------------------- | ---------- | --------------------------------------------- |
| `deploy/vps/backup-pull.sh` | 需手动注册 | 从 VPS 拉取 AGENT_DATA_DIR 到本地，保留 30 天 |

### 日志文件

| 文件                                  | 说明                |
| ------------------------------------- | ------------------- |
| `/home/tim/scripts/tunnel-watch.log`  | Tunnel URL 更新记录 |
| `/home/tim/scripts/health-watch.log`  | 健康检查正常记录    |
| `/home/tim/scripts/health-alerts.log` | 健康检查异常告警    |

### 凭证文件

| 文件                                  | 权限 | 说明                                   |
| ------------------------------------- | ---- | -------------------------------------- |
| `/home/tim/scripts/.vercel-token`     | 600  | Vercel CLI token（tunnel-watch.sh 用） |
| `/home/tim/scripts/.telegram-token`   | 600  | Telegram Bot token                     |
| `/home/tim/scripts/.telegram-chat-id` | 600  | Telegram chat ID                       |
| `/home/tim/scripts/.slack-webhook`    | 600  | Slack webhook URL                      |

## 关键文件路径

| 文件                                                     | 说明                                      |
| -------------------------------------------------------- | ----------------------------------------- |
| `/etc/sing-box/config.json`                              | sing-box 代理配置                         |
| `/etc/caddy/Caddyfile`                                   | Caddy 反向代理配置                        |
| `/etc/systemd/system/cloudflared-tunnel.service`         | Cloudflare Tunnel systemd 服务            |
| `/home/tim/project/EA/.env.vps.local`                    | API 环境变量（含 secrets）                |
| `/etc/systemd/system/ea-api.service`                     | EA API systemd 服务                       |
| `/etc/systemd/system/ea-simulator@.service`              | 模拟器 systemd 模板服务（实例：node-sim-gh-001/002） |
| `/home/tim/project/EA/deploy/vps/vps-api-entry.sh`       | API 入口脚本（预检 + 构建 + 启动）         |
| `/home/tim/project/EA/deploy/vps/sim-entry.sh`           | 模拟器入口脚本（注入 node 凭据 + 解密 token） |
| `/home/tim/var/mosquitto-runtime/`                       | Mosquitto 配置（passwd, acl, conf）       |
| `~/.ssh/github_deploy_key`                               | GitHub Deploy Key 私钥                    |
| `~/.ssh/gh_actions_key`                                  | GitHub Actions SSH key                    |
| `/home/tim/scripts/.vercel-token`                        | Vercel CLI token（tunnel-watch.sh 用）    |
| `/home/tim/scripts/.telegram-token`                      | Telegram Bot token                        |
| `/home/tim/scripts/.slack-webhook`                       | Slack webhook URL                         |
| `/home/tim/scripts/.tunnel-url-state`                    | Tunnel URL 状态文件（tunnel-watch.sh 用） |

## Cloudflare Tunnel URL

当前 Quick Tunnel URL: `https://wal-oxford-conditions-post.trycloudflare.com`

**不稳定**：VPS 重启或 cloudflared 进程重启后 URL 会变化。`tunnel-watch.sh` 每 5 分钟自动检测并更新 Vercel。查看当前 URL：

```bash
journalctl -u cloudflared-tunnel --no-pager | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | head -1
```

URL 变化后 `tunnel-watch.sh` 会自动更新 `apps/web/vercel.json` 和 `apps/site/vercel.json` 中的 rewrites destination 并重新部署 Vercel。也可手动运行 `deploy/vps/update-tunnel-url.sh`。
