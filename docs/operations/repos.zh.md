# 仓库分工

**不要**把本机目录名 `embodied-agent-public` 当成 GitHub 仓名。GitHub 上只有下面两个仓。

| GitHub                                                                                | 可见性  | 用途                                                                                                            |
| ------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `topkyo/embodied-agent-internal` | private | **开发真源**。日常 clone、PR、CI、VPS `git pull`、`Deploy to VPS` 只在这里。                                    |
| `topkyo/embodied-agent`                   | public  | **只读展示快照**。占用原名；不接受 Issue / PR（PR 会自动关闭）。不要在这个仓开发，也不要用它给 VPS `git pull`。 |

## 本机

只维护一个工作副本，指向私仓：

```bash
git remote -v
# origin 必须是 git@github.com:topkyo/embodied-agent-internal.git
```

公开仓直接看 GitHub，不必在本机再 clone 一份。

## VPS

生产 checkout 的 `origin` 必须是 `embodied-agent-internal`。部署走私仓 Actions **Deploy to VPS**，不要在公开仓跑部署。自托管剧本在私仓 `deploy/vps/`（含实例 IP / 路径 / 密钥文件布局），**不进入公开快照**。

克隆（新机）：

```bash
git clone git@github.com:topkyo/embodied-agent-internal.git EA
```

## 更新公开快照

在私仓工作树执行：

```bash
bash scripts/publish-public-snapshot.sh
```

脚本会 rsync 到临时目录、排除实例侧写、脱敏 `vercel.json` 回源、改掉指向已排除路径的链接，并把 `display-only-close-pr.yml` 从现有公开树拷回。不要把本机临时目录名写成 GitHub 仓名。

若公开仓 git 史里仍看得到已排除的实例文件，需要重建默认分支（**只**对展示仓 `main` force-push，禁止对私仓）：

```bash
bash scripts/publish-public-snapshot.sh --replace-history
```
