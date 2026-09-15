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

## 云端部署到 Render

仓库根目录的 `render.yaml` 会创建免费 Render Web Service。部署分支后，在 Render 中填写以下环境变量：

- `FITLOG_PUBLIC_URL`：Render 分配的 HTTPS 地址，例如 `https://fitlog-ai.onrender.com`
- `FITLOG_ALLOWED_EMAIL`：你自己的 ChatGPT/Supabase 登录邮箱
- `SUPABASE_URL`：Supabase Project Settings 中的项目 URL
- `SUPABASE_PUBLISHABLE_KEY`：Supabase Project Settings 中的 publishable key

不要把数据库密码、连接字符串、service-role key、私钥或任何访问令牌填入 Render，也不要发送到聊天中。

在 Supabase SQL Editor 先依次执行 `supabase/migrations/001_fitlog.sql` 和 `supabase/migrations/002_fitlog_rls_and_workout_rpc.sql`。然后在 Supabase Dashboard 的 Authentication 设置中完成以下四项：

1. 在 OAuth 2.1 Server 启用 OAuth 2.1 Server。
2. 启用 Dynamic Client Registration。
3. 将 Site URL 设置为 Render 的 HTTPS 地址。
4. 将 Authorization Path 设置为 `/oauth/consent`。

服务部署完成后，确认 `https://你的域名/healthz` 返回 `{"status":"ok"}`。在 ChatGPT 的连接器/MCP 设置中添加 `https://你的域名/mcp`，再按浏览器中的邮箱登录和授权页面完成连接。

云端模式使用 `FITLOG_RUNTIME=cloud`。每一个请求都会验证 Supabase Bearer token，并只接受 `FITLOG_ALLOWED_EMAIL`；所有业务数据读写携带该用户的 token，Supabase RLS 会再次限制数据行归属。
