# FitLog ChatGPT 私有插件设计

## 目标

构建仅供一名用户使用的 ChatGPT 健身插件。用户在 ChatGPT 的网页端或移动端通过文字、语音和图片记录训练、饮食与身体数据；插件把结构化数据保存在私有云端，并在对话中显示可视化训练仪表盘。

本项目不开发 iOS 原生应用，不要求 Apple Developer 账号，也不公开发布到插件市场。

## 成功标准

- 用户首次通过邮箱一次性验证码登录后，能在手机 ChatGPT 中持续使用同一份数据。
- 一条训练记录保存动作、每组重量、次数、日期和备注；一条饮食记录保存餐次、食物、估算营养、日期和可选照片。
- 用户能通过对话查询当天、近 7 天、近 30 天的数据，并看到图表或表格。
- 重要数据立即写入；普通闲聊不写入插件数据库；临时媒体和操作日志按照保留规则自动清理。
- 所有读取和写入工具都只返回当前登录用户的数据。

## 选择的方案

采用 ChatGPT 私有插件，包含 MCP 服务、可选工作流指引和 MCP Apps UI。MCP 服务提供读写工具；仪表盘作为 UI 资源在 ChatGPT 对话旁显示，并支持较大屏幕的全屏查看。

数据由云端 PostgreSQL 保存。图片放在私有对象存储中。服务通过稳定 HTTPS `/mcp` 端点提供流式 MCP；生产环境以 OAuth 2.1 授权码与 PKCE 完成邮箱验证码登录。数据库仅允许在 `allowed_user_email` 配置值匹配时创建会话。

本地开发使用等价的本地数据库和模拟邮件发送器；部署前必须配置生产数据库、对象存储、邮件服务和 OAuth 回调域名。真实部署密钥只保存为服务端环境变量，永不写入插件 UI、源代码或 ChatGPT 提示词。

## 用户体验

### 首次连接

用户在 ChatGPT 中安装私有插件后点击连接，输入自己的邮箱并完成一次验证码登录。授权完成后，插件向 ChatGPT 返回欢迎卡片和当天仪表盘。后续聊天自动使用已建立的授权会话。

### 记录训练

用户可以说“今天深蹲 80 公斤 5 次做 3 组”。ChatGPT 将其整理为结构化参数并调用 `log_workout`。工具返回动作、组数、总训练量和保存时间；UI 更新当天训练卡。

复杂训练通过一次工具调用提交多个动作。每组包含重量、次数和可选 RPE；重量单位统一为 kg，次数为正整数。动作名可使用用户输入，服务会同时尝试映射到已知动作名称，但不会丢弃自定义名称。

### 记录饮食

用户可用文字、语音转写结果或食物图片描述一餐。ChatGPT 负责将可辨识信息整理成食物条目，插件存储总热量、蛋白质、碳水和脂肪以及估算来源。用户可在 UI 内修改最终数字后保存。

若用户要求保留原图，UI 使用 ChatGPT 的文件桥上传到私有对象存储，并把照片关联至该餐。未明确保留原图时，只保存营养结果，不保存图片二进制数据。

### 查看数据

`get_dashboard` 返回指定时间范围的仪表盘，默认范围为当天。仪表盘包含：

- 今日热量与三大营养素；
- 今日训练动作和已完成组数；
- 连续打卡与最近 28 天训练热力日历；
- 每周训练量；
- 单个动作的重量或估算一重复最大重量趋势；
- 体重趋势（有数据时）。

在对话中，用户可以说“看最近一个月卧推”“我这周练了几天”“今天还差多少蛋白质”。读取工具返回可供模型回答的结构化摘要，并在适合时附加仪表盘 UI。

### 长期记忆

`remember_fact` 用于保存用户明确要求长期记住的内容，例如训练目标、伤病限制、饮食偏好和器械条件。`forget_fact` 按记录 ID 或语义匹配删除事实。模型不得因为普通闲聊自行创建长期记忆；只有用户明确说“记住”或记录服务判断为训练/饮食/身体数据时才写入。

## 数据模型

所有业务表都以 `user_id` 隔离。服务层在每次工具调用中从 OAuth 会话得到用户 ID，不接受模型传入的用户 ID。

| 表 | 关键字段 | 用途 |
| --- | --- | --- |
| users | id, email, created_at | 唯一允许登录的个人账户 |
| workouts | id, user_id, performed_on, title, notes | 一次训练 |
| exercises | id, workout_id, name, position | 训练中的动作顺序 |
| workout_sets | id, exercise_id, set_number, weight_kg, reps, rpe | 单组记录 |
| meals | id, user_id, eaten_on, meal_type, note, calories, protein_g, carbs_g, fat_g, estimate_source | 一餐汇总 |
| meal_assets | id, meal_id, storage_key, expires_at | 明确保留的原图 |
| body_measurements | id, user_id, measured_on, weight_kg, body_fat_percent | 体重与可选体脂 |
| memory_facts | id, user_id, category, content, importance, created_at | 用户明确要求保留的事实 |
| daily_summaries | id, user_id, summary_date, workout_volume_kg, calories, protein_g, training_days | 日汇总 |
| weekly_summaries | id, user_id, week_start, training_days, workout_volume_kg, average_calories, average_protein_g | 周汇总 |
| audit_events | id, user_id, event_type, created_at, metadata | 最小化运行审计，不保存原始聊天文本 |

## 保留与清理策略

训练、饮食营养结果、身体测量、目标、个人纪录、日汇总和周汇总永久保存，直到用户使用删除工具删除它们。原图仅在用户明确选择保留时保存 7 天，随后由定时任务从对象存储和 `meal_assets` 同时删除。普通闲聊、完整提示词和模型回答不写入插件数据库。

审计事件只保留工具名称、时间、结果类型和请求关联 ID，保留 30 天。每日汇总在当天本地时区 23:55 生成；周汇总在每周一 00:10 生成；清理任务每日 02:00 运行。写入工具成功返回前必须完成主数据事务，定时任务不是主数据唯一的保存方式。

## MCP 工具边界

| 工具 | 写入 | 最小输入 | 返回 |
| --- | --- | --- | --- |
| log_workout | 是 | date, title, exercises[] | 训练 ID、动作和训练量 |
| log_meal | 是 | date, meal_type, items 或营养总量 | 餐 ID、营养总量 |
| save_meal_photo | 是 | meal_id, uploaded file reference | 资源 ID、过期时间 |
| record_body_measurement | 是 | date, weight_kg, 可选体脂 | 测量 ID 与趋势摘要 |
| get_dashboard | 否 | range, 可选 exercise_name | 结构化指标与 UI 资源 |
| get_history | 否 | entity, date range | 分页结构化记录 |
| remember_fact | 是 | category, content | 记忆 ID |
| forget_fact | 是 | memory_id 或精确匹配内容 | 删除结果 |

所有写入工具在保存前验证日期、数值范围和关联记录归属。删除记忆、训练、饮食或照片时，工具描述必须清楚告知 ChatGPT 这是删除操作，依赖宿主的确认机制处理不可逆动作。

## UI 设计

UI 使用 MCP Apps 标准资源和 `ui/*` bridge，不依赖仅在某个宿主存在的 API。ChatGPT 特定扩展只用于文件选择和会话内组件状态，并在不可用时提供对话文字回退。

第一版有三个界面：

1. 今日概览：热量、营养素、训练完成度、连续打卡。
2. 训练趋势：28 天热力日历、每周训练量、动作趋势图与个人纪录。
3. 饮食与身体：每日热量/营养趋势和体重趋势。

每个界面必须在窄屏幕下可纵向滚动和操作；关键数据同时以可读文本返回给模型，避免 UI 不可用时丢失功能。

## 安全与隐私

- MCP 服务必须部署在 HTTPS，采用 OAuth 2.1 + PKCE，并在每个请求验证访问令牌和用户白名单。
- 所有数据库查询都强制带 `user_id` 条件；不得由模型参数决定访问目标。
- UI 是受限 iframe，不接收 API Key、数据库 URL、长期令牌或完整授权响应。
- 图片对象使用不可猜测的私有键，仅在授权用户请求时生成短时下载 URL。
- 工具输入在服务端重新验证；从 ChatGPT 返回的结构化参数一律视为不可信输入。
- 服务记录最小审计信息，不记录聊天原文、验证码和授权令牌。

## 测试与验收

单元测试覆盖营养汇总、训练训练量、日期/数值验证、保留策略和用户隔离。集成测试覆盖登录后写入与读取自己的数据、拒绝其他邮箱、删除照片时清理对象记录、仪表盘指标正确聚合。组件测试覆盖窄屏布局和无 UI 时的结构化回退。

第一版验收场景：用户登录后用一句话记录训练、记录一餐、查询本周打卡和查看卧推趋势；刷新或换到手机后数据仍存在；普通聊天不会被写入记忆；到期照片会被清理。

## 非目标

第一版不包含公开注册、多用户共享、社交、付费、Apple Health 同步、医疗建议、精确食物数据库匹配、真实 ChatGPT 五小时或每周额度读取，也不自动保存普通聊天内容。
