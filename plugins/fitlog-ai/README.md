# FitLog AI 私人 ChatGPT 插件核心

这是用于开发和验证的本地 MCP 服务。它在本机保存测试数据；正式 iPhone 版本需要把同一套接口部署到 HTTPS 服务，并替换为云端 PostgreSQL 与 OAuth 登录。

## 本地运行

在此目录运行：

```powershell
npm install --cache .npm-cache
npm run build
npm start
```

默认 MCP 地址是 `http://127.0.0.1:3333/mcp`。开发默认用户为 `me@example.com`，数据库为当前目录的 `fitlog.local.db`。生产模式必须设置 `FITLOG_OWNER_EMAIL` 和 `FITLOG_SQLITE_PATH`。

可在 ChatGPT 中尝试：

- `记录今天深蹲 80 公斤 5 次做 3 组`
- `记录午餐：鸡胸肉饭，460 千卡，蛋白质 35 克`
- `查看最近 7 天仪表盘`

## 数据边界

训练、饮食、身体数据和明确保存的长期记忆会写入数据库。审计事件只保存事件类型、时间与记录 ID，并在 30 天后清理；普通聊天文本和模型回复不会入库。
