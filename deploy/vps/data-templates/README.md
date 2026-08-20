# 运行数据模板

本目录包含 VPS 部署所需的初始运行数据文件。

## 文件清单

| 文件                   | 用途                                                  |
| ---------------------- | ----------------------------------------------------- |
| `settings.json`        | API 设置（deployment_id、active_domain、mqtt_url 等） |
| `device-registry.json` | 设备注册表                                            |
| `users.json`           | Web 账户列表                                          |

## users.json 说明

`users.json` 模板中的用户**不包含** `email` 和 `password_hash` 字段，无法直接通过邮箱登录。

首次启动 API 后，必须通过 bootstrap 流程创建管理员账户：

```bash
# 1. 确保 .env.vps.local 中设置了 WEB_INSTALL_CODE
# 2. 启动 API: sudo systemctl restart ea-api
# 3. 检查 bootstrap 状态
curl -s https://<tunnel-url>/auth/bootstrap-status
# 应返回 {"available":true,"redeemed":false}

# 5. 创建管理员
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"install_code":"<WEB_INSTALL_CODE>","email":"admin@example.com","password":"YourPassword","display_name":"管理员"}' \
  https://<tunnel-url>/auth/bootstrap
```

bootstrap 成功后，管理员可以通过 `/auth/account/create` 创建其他用户。

详见 `deploy/vps/README.zh.md` §9。
