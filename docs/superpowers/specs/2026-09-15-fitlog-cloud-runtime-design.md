# FitLog 云端运行时设计

## 目标

让 FitLog 作为一个只供一人使用的远程 MCP 服务运行在 Render，并把训练、饮食、身体数据和明确保存的长期记忆持久化到现有 Supabase 项目。服务必须能够被 iPhone 上的 ChatGPT 通过 OAuth 2.1 安全连接；任意未登录请求和非允许邮箱的请求都不能读取或写入数据。

本阶段完成安全的文字记录、仪表盘和长期记忆。食物照片上传、语音转写、ChatGPT 用量统计和 Apple Health 同步不在本阶段实现。

## 选定方案

使用 Supabase 的 OAuth 2.1 Server 作为授权服务器，Render 作为 MCP 资源服务器和授权同意页面的宿主，Supabase PostgREST 与行级安全策略保存数据。

该方案避免新增认证供应商。ChatGPT 按 MCP OAuth 标准发现 FitLog 的受保护资源元数据，再从 Supabase 发现授权服务器。用户通过 Supabase 邮箱魔法链接登录，并在 FitLog 的同意页面看到请求方名称和权限后批准连接。ChatGPT 将访问令牌作为 Bearer Token 发送给 MCP 服务；服务验证令牌、检查允许邮箱，并以该用户令牌访问数据库。

未采用把固定密钥放入 ChatGPT 的方式，因为它无法提供可撤销的登录状态，也会让私有写入接口失去可靠的用户认证。未采用 Render 本地 SQLite，因为免费实例重启后本地磁盘不保证持久。

## 组件与职责

| 组件 | 职责 |
| --- | --- |
| ChatGPT（iPhone 或网页） | 发现 MCP 服务、完成 OAuth 2.1 + PKCE、携带访问令牌调用工具、渲染仪表盘 UI。 |
| Render Web Service | 提供 HTTPS `/mcp`、`/.well-known/oauth-protected-resource`、`/healthz` 和 `/oauth/consent`。验证令牌与允许邮箱。 |
| Supabase Auth | 提供 OAuth 2.1 元数据、动态客户端注册、邮箱魔法链接会话、令牌签发与刷新。 |
| Supabase Postgres + RLS | 保存 FitLog 记录；所有行必须由 `auth.uid()` 所属用户访问。 |
| 本地 SQLite 适配器 | 保留为离线开发与自动测试使用，不用于 Render。 |

## 数据与授权边界

生产数据库中的 `fitlog_users.id` 必须等于 Supabase Auth 用户 UUID。新的迁移将其与 `auth.users(id)` 建立外键，并为每张业务表开启严格 RLS：

- 用户表只允许 `id = auth.uid()` 的读取和创建；
- 训练、饮食、身体测量、记忆和审计记录只允许 `owner_id = auth.uid()` 的访问；
- 动作和训练组通过所属训练的 `owner_id` 间接校验；
- 新训练使用一个 PostgreSQL RPC 函数在单个事务中插入训练、动作和所有组，避免部分训练记录；
- 服务从经过验证的令牌提取用户 ID 与邮箱，不接受工具参数中的用户 ID 或邮箱。

Render 不保存数据库管理员密码或 Supabase service-role key。每个请求使用调用者的 OAuth 访问令牌创建 Supabase 客户端，所以数据库 RLS 是第二层隔离。

服务额外检查 `FITLOG_ALLOWED_EMAIL`。令牌有效但邮箱不匹配时返回 403，不创建用户行，也不执行工具。

## MCP 与 OAuth 流程

1. ChatGPT 请求 FitLog 的 MCP 端点，没有令牌时收到 401 和 `WWW-Authenticate`，其中指向受保护资源元数据。
2. ChatGPT 读取 `/.well-known/oauth-protected-resource`，其资源标识为 Render 的正式 HTTPS 地址，授权服务器为 `https://<project-ref>.supabase.co/auth/v1`。
3. ChatGPT 从 Supabase 的 OAuth 元数据发现授权、令牌和动态注册端点，并通过 PKCE 发起授权。
4. Supabase 把用户带到 Render 的 `/oauth/consent?authorization_id=...`。页面以 Supabase 魔法链接登录；登录后显示客户端名称、重定向地址和请求范围。
5. 用户同意后，页面调用 `approveAuthorization` 并返回 ChatGPT。ChatGPT 取得令牌，后续 MCP 请求带 `Authorization: Bearer ...`。
6. FitLog 验证令牌和邮箱，工具从认证上下文创建请求专属仓库，并按 RLS 读取或写入该用户数据。

## 应用结构调整

现有 `FitLogRepository` 由同步接口调整为异步接口。SQLite 适配器以异步方法包装现有操作，保持本地开发行为。新增 `SupabaseRepository`：

- `ensureOwner` 用 JWT `sub` 和经 Auth 服务器确认的邮箱创建或读取用户行；
- `saveWorkout` 调用事务型 RPC；
- 其他单行写入使用 PostgREST 插入；
- 列表方法带日期范围、固定排序，并依赖 RLS；
- 审计保留清理在生产环境使用按 `auth.uid()` 限制的删除；
- `close` 在 HTTP 客户端适配器中无操作。

服务层和 MCP 工具改为 `async`。工具回调从 MCP 请求的认证上下文取得用户身份，不能再捕获固定的开发邮箱。开发模式保留一个固定本地用户，生产模式必须具备 OAuth 和 Supabase 环境变量才启动。

## HTTP 路由

| 路由 | 行为 |
| --- | --- |
| `POST /mcp` | 验证 Bearer Token 后交给 MCP transport；失败时返回 RFC 9728 授权挑战。 |
| `GET /mcp` | 验证 Bearer Token 后交给 MCP transport。 |
| `/.well-known/oauth-protected-resource` | 返回资源 URL、Supabase Auth issuer 和 `openid email profile` 支持范围。 |
| `GET /oauth/consent` | 提供 Supabase 登录与 OAuth 同意界面。 |
| `GET /healthz` | 不访问个人数据；用于 Render 健康检查。 |

除健康检查和 OAuth 元数据外，HTTP 响应不记录 Authorization header、令牌、验证码或聊天文本。

## 部署配置

仓库添加 `render.yaml`，服务根目录为 `plugins/fitlog-ai`。构建执行依赖安装、TypeScript 检查和 UI 构建；启动命令运行 MCP HTTP 服务；健康检查地址为 `/healthz`。

Render 中只设置下列环境变量：

- `NODE_ENV=production`
- `FITLOG_RUNTIME=cloud`
- `FITLOG_PUBLIC_URL`：Render 分配的正式 HTTPS URL
- `FITLOG_ALLOWED_EMAIL`：用户自己的登录邮箱
- `SUPABASE_URL`：项目 URL
- `SUPABASE_PUBLISHABLE_KEY`：Supabase 发布密钥

`SUPABASE_PUBLISHABLE_KEY` 可在浏览器代码中使用，但仍通过 Render 环境变量统一管理。私钥、数据库密码、service-role key 和 ChatGPT token 不加入仓库、不粘贴到聊天，也不显示在仪表盘。

部署代码后，用户需要在 Supabase 控制台完成一次配置：启用 OAuth 2.1 Server 与动态客户端注册；设置 Site URL 为 Render URL；设置 Authorization Path 为 `/oauth/consent`；将 Render URL 加到魔法链接重定向允许列表；使用非对称 JWT 签名密钥。随后执行第二个 RLS/RPC 迁移。

## 错误处理

- 缺少令牌或令牌无效：401，加带资源元数据的授权挑战；
- 邮箱不在白名单：403，返回固定的“该账号未获授权”信息；
- Supabase 网络或数据库错误：工具返回安全的通用失败文本，不泄露查询、令牌或配置；
- 输入验证失败：沿用现有中文校验错误，不写入任何记录；
- 用户取消 OAuth 同意：Supabase 返回 OAuth 错误，FitLog 不创建业务记录；
- Render 重启：服务重新建立 HTTP 客户端，所有用户数据仍在 Supabase。

## 测试与验收

自动测试覆盖以下情况：

- 异步本地仓库仍保存并隔离训练、饮食、身体数据与记忆；
- 无令牌请求收到 401 和正确的资源元数据地址；
- 有效令牌但邮箱不匹配收到 403；
- 已认证请求把用户 ID、邮箱和访问令牌传给仓库工厂；
- Supabase 仓库请求携带调用者令牌，训练 RPC 的输入包含完整动作与组；
- 迁移包含 `auth.users` 外键、RLS policy 与训练事务 RPC；
- `/healthz` 返回 200，不包含个人数据；
- 所有现有域、服务、工具和仪表盘测试继续通过，且 TypeScript 检查与生产构建通过。

人工验收：在 Render 部署后，从 ChatGPT 手机端添加 MCP 服务，完成邮箱登录和同意，记录一次训练与一餐，关闭并重新打开 ChatGPT 后查看同一份仪表盘数据。随后在 Supabase 控制台撤销 OAuth 授权，确认下一次工具调用被拒绝。

## 非目标

本阶段不实现食物图片上传、语音识别、公开多人账户、Apple Health、支付、医疗建议，或真实读取 ChatGPT 的五小时和每周用量。后续在安全的云端身份和持久化稳定后，再独立规划图片与用量展示。
