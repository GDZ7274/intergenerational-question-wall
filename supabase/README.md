# Supabase schema v4 与审核后台

本目录按顺序提供五次数据库迁移：

1. `migrations/0001_experience.sql`：业务表、公开视图、基础约束与种子问答。
2. `migrations/0002_moderation.sql`：待审核状态、管理员白名单、审核 RPC 与操作日志。
3. `migrations/0003_operational_controls.sql`：受控投稿 RPC、恢复码、状态事件、数据库限流与运营开关。
4. `migrations/0004_release_hardening.sql`：冲突安全的历史会话指纹迁移、驳回理由约束、完整审核反馈事件、共享网络额度优化与上线探针。
5. `migrations/0005_photo_notes.sql`：工作人员采集的实体便签、私有待审/公开媒体桶、统一公开墙、照片举报与审核审计。
6. `migrations/0006_photo_media_service_boundary.sql`：把公开照片发布、下架、清理及照片举报下架收口到 service-role 媒体函数，并保留真实审核员审计。

`0003` 会撤销 `anon` 和 `authenticated` 对 `questions`、`answers`、`reports` 的直接插入权限。公开写入只能通过 `SECURITY DEFINER` RPC，不能再按 schema v2 的方式直接写底表。

## 执行与检查

1. 新建 Supabase 项目。
2. 打开 SQL Editor，依次完整执行 `0001_experience.sql`、`0002_moderation.sql`、`0003_operational_controls.sql`、`0004_release_hardening.sql`、`0005_photo_notes.sql`、`0006_photo_media_service_boundary.sql`，不要颠倒顺序。已运行 schema v3 的项目只需继续执行 `0005` 和 `0006`。
3. 在 Authentication 中预先创建并确认管理员用户，再把其 `auth.users.id` 私下写入 `moderator_accounts`。
4. 确认以下对象存在：业务与管理表、控制表 `runtime_settings` / `submission_receipts` / `submission_events` / `abuse_rate_buckets`、照片表 `photo_notes`、公开视图 `wall_notes` / `question_pool`，以及私有 helper schema `question_wall_private`。
5. 确认 Storage 中存在私有桶 `photo-note-staging` 与公开桶 `photo-note-public`；这两个桶不应有允许 `anon` 或普通 `authenticated` 用户写入的额外策略。
6. 部署 `functions/photo-note-media`，保持 JWT 校验开启，并将正式站点与本地验收地址写入函数环境变量 `PHOTO_NOTE_ALLOWED_ORIGINS`（逗号分隔）。配置缺失、请求缺少 Origin 或来源不在列表时函数会失败关闭。
7. 调用 `moderation_status()`，确认返回 `schemaVersion: 4`、`hardeningVersion: 1`、`photoNotesEnabled: true` 与 `photoUploadMode: moderator_only`。

仓库提供手动触发的 `.github/workflows/supabase-release.yml`。它的 `preflight` 模式只执行远端迁移历史查询和 `db push --dry-run`；`deploy` 模式会修改生产数据库、函数 secret 和 Edge Function，必须绑定受保护的 `supabase-production` GitHub Environment。所需配置及操作顺序见 [`docs/DEPLOY.md`](../docs/DEPLOY.md#可选受保护的-supabase-自动发布)。

如果早期迁移通过 SQL Editor 执行，远端实际 schema 与 `supabase_migrations.schema_migrations` 可能不一致。自动发布前必须先核对并修复 `0001` 至 `0004` 的历史；不能仅因为表已经存在就运行 `db push --include-all`，因为旧迁移包含一次性数据隔离步骤。无法确认历史时，继续在 SQL Editor 依次执行 `0005`、`0006`，再只部署 Edge Function。

前台不需要启用 Supabase Anonymous Sign-Ins。浏览器使用 publishable key（旧界面中的 `anon public` key）；这个 key 会公开出现在页面中，真正的安全边界由 RLS、权限收窄和 RPC 内部校验共同构成。

## 权限边界

- `anon` 与普通 `authenticated` 可直接 `SELECT` 的只有 `wall_notes`、`question_pool`，不能读取业务底表、控制表或 `photo_notes`。
- 公共角色只能执行下文列出的公共 RPC，不能直接向四张业务表 `INSERT`。
- 前端会话 ID 在入库前转换为带命名空间的 SHA-256 指纹；数据库不保存原始会话 ID。它仍是可伪造的匿名标识，不是登录身份。
- `authenticated` 身份本身不具有后台权限。管理 RPC 还会检查 JWT 中的 UUID 是否位于 `moderator_accounts` 且 `enabled = true`。
- `service_role` key、数据库密码、管理员 UUID 和登录令牌都不得写入网页、GitHub 仓库或 Actions 变量。

公开视图不会返回会话指纹、来源、审核字段、内部备注或恢复码。文字便签的 `note_id` 等于 `answers.id`；实体便签的 `note_id` 等于 `photo_notes.id`。举报统一使用公开 `note_id`，数据库会同时记录 `note_kind`。

## 实体便签媒体链路

实体便签只开放给已登录且列入 `moderator_accounts` 的工作人员，不提供匿名上传。采集端先把照片在浏览器中旋转、压缩并重新编码，再调用 `photo-note-media`：

1. `createDraft` 创建数据库草稿并返回约两小时有效的单对象上传地址。
2. 浏览器把 JPEG/PNG/WebP 直接 `PUT` 到该地址；地址只允许写入当前草稿的私有路径。
3. `completeDraft` 从 Storage 重新读取文件并校验文件头、实际字节数和常见 EXIF 元数据标记，再把草稿送入 `pending`。
4. `preview` 返回十分钟有效的私有预览地址。
5. `publish` 由服务端把待审文件复制到公开桶，并在数据库审核通过失败时自动清理刚写入的公开对象；隐藏后的重新发布也使用这个动作并生成新路径。
6. `hide` 先让数据库停止公开投影，再删除公开对象并清空数据库中的公开路径引用。若任一步失败，响应中的 `mediaRemoved` 为 `false`，照片审核列表会保留“重试清理公开图片”入口，调用 `removeHiddenPublicMedia` 直到清理完成。

函数请求使用管理后台的访问令牌，URL 为 `<SUPABASE_URL>/functions/v1/photo-note-media`，正文均为 JSON。不要把 `SUPABASE_SERVICE_ROLE_KEY` 写入网页、仓库、Actions 日志或函数响应。

公开图片使用一年不可变缓存以保证移动端浏览性能。下架会阻止墙面继续返回它并删除源对象，但无法召回访客设备、代理或分享平台已经缓存的副本；工作人员在发布前仍必须完成肖像、隐私和监护授权检查。私有草稿和驳回件也需要在正式运营时配置保留期限与定期清理任务。

`wall_notes` 保留原有前九列并追加：`kind`、`photo_note_id`、`media_bucket`、`media_path`、`alt_text`、`media_width`、`media_height`。文字行 `kind=text` 且照片字段为空；照片行 `kind=photo` 且 `question_id` / `answer_id` 为空。前端应由可信的 Supabase 基础 URL、固定公开桶名和编码后的 `media_path` 组成图片 URL，不应直接信任任意外部媒体地址。

照片管理 RPC 包括 `admin_create_photo_note`、`admin_get_photo_note`、`admin_update_photo_note`、`admin_submit_photo_note`、`admin_list_photo_notes` 与 `admin_moderate_photo_note`。审核动作支持 `approve`、`reject`、`hide`、`publish`、`feature`、`unfeature` 与仅供媒体函数在删除成功后调用的 `clear_media`，并全部写入 `moderation_actions`。

## 公共前端契约

`prototype/backend.js` 使用以下资源：

| 资源 | 方法 | 用途 |
| --- | --- | --- |
| `wall_notes` | `GET` | 读取已发布问答便签，最多 100 条 |
| `question_pool` | `GET` | 读取当前可回答问题，最多 100 条 |
| `public_runtime_status` | `POST RPC` | 读取 schema 版本与运行状态 |
| `submit_question` | `POST RPC` | 提交问题并取得恢复码 |
| `submit_answer` | `POST RPC` | 提交回答并取得恢复码 |
| `submit_report` | `POST RPC` | 举报公开便签 |
| `get_submission_status` | `POST RPC` | 凭恢复码查询正文、状态和最近事件 |
| `resubmit_question` | `POST RPC` | 修改并重投被驳回的问题 |
| `resubmit_answer` | `POST RPC` | 修改并重投被驳回的回答 |

成功提交问题或回答返回 `{ ok, id, receipt, status, createdAt }`。运行状态或限流拒绝通常返回 `{ ok: false, error, message, retryAfter? }`；参数、长度或约束错误仍可能以 PostgREST/数据库错误返回。

## 恢复码与审核闭环

- 恢复码是 64 位小写十六进制字符串，即 256-bit bearer secret。服务端只保存 SHA-256 摘要。
- 恢复码默认在首次提交 365 天后过期；重提不会延长或轮换它。任何持码者都可反复查询投稿，并可在其状态为 `rejected` 时修改重投。
- 前端必须在成功响应后立即保存恢复码。清除浏览器数据前若未另存，无法按会话找回；schema v3 之前的投稿不会补发恢复码。
- `get_submission_status` 返回投稿正文、当前状态、版本号、审核反馈、时间戳，以及最近 20 个事件。它不受运营开关或公共限流影响。
- 只有 `rejected` 问题或回答可以重提。重提沿用同一实体和恢复码，将 `revision` 加一并重新进入 `pending`。
- 被驳回回答只有在原问题仍为 `open` 时才能重提。
- 驳回必须保留具体理由；该理由会成为投稿者反馈和状态事件，最长 500 字符。
- 当前投稿 RPC 没有客户端幂等键。若服务端已成功但响应在网络中丢失，重新提交可能产生重复问题；客户端不能承诺所有重试都不会重复。

## 内容校验与限流

问题长度为 5-80 字符，回答长度为 1-160 字符。服务端会去除首尾空白、将连续空白压成一个空格，并拦截 `<`、`>`、`http://`、`https://`、`www.`、常见邮箱和大陆 11 位手机号格式。这些规则不覆盖座机、QQ/微信号、裸域名、拆字或谐音等变体，也不替代人工审核和生产级个人信息识别。

| 动作 | 窗口额度 | 超限封禁 |
| --- | --- | --- |
| 提交问题 | 10 分钟内 5 次 | 15 分钟 |
| 提交回答 | 10 分钟内 10 次 | 15 分钟 |
| 举报 | 24 小时内 20 次 | 1 小时 |
| 驳回后重提 | 1 小时内 5 次 | 30 分钟 |

限流始终使用会话哈希；网关提供地址头时，还会使用网络地址哈希作为第二信号，任一桶超限都会拒绝。单会话使用表中额度，共享网络桶为对应额度的 20 倍，用于容纳家庭、学校和活动现场的多人访问；超大共享网络仍可能相互影响。没有地址头时，攻击者也可能轮换会话 ID 绕过限制。数据库目前没有自动清理历史限流桶的定时任务。

## 运营开关

| 状态 | 公开墙 | 问题池 | 问题/回答/重提 | 举报 | 状态查询 |
| --- | --- | --- | --- | --- | --- |
| 正常 | 可见 | 可见 | 可用 | 可用 | 可用 |
| `submissionsPaused` | 可见 | 隐藏 | 禁用 | 可用 | 可用 |
| `readOnly` | 可见 | 隐藏 | 禁用 | 禁用 | 可用 |
| `emergencyLockdown` | 隐藏 | 隐藏 | 禁用 | 禁用 | 可用 |

三个开关可以同时为真，生效优先级为紧急关闭、只读、暂停投稿。公开说明最长 160 字。限制同时写在 RPC gate 和公开视图中，不能通过跳过前端检查绕开。

## 管理员权限

| 能力 | `reviewer` | `owner` |
| --- | --- | --- |
| 查看仪表盘、审核队列、举报与日志 | 是 | 是 |
| 审核、下架、精选、处置举报 | 是 | 是 |
| 采集、预览和审核实体便签照片 | 是 | 是 |
| 查看运行状态 | 是 | 是 |
| 修改运营开关与公开说明 | 否 | 是 |

管理 RPC 包括 `admin_whoami`、`admin_dashboard`、`admin_list_questions`、`admin_list_answers`、`admin_list_photo_notes`、`admin_get_photo_note`、`admin_create_photo_note`、`admin_update_photo_note`、`admin_submit_photo_note`、`admin_moderate_photo_note`、`admin_list_reports`、`admin_list_actions`、`admin_moderate_question`、`admin_moderate_answer`、`admin_resolve_report`、`admin_get_runtime_settings` 与 `admin_update_runtime_settings`。运营开关与照片审核变更都会写入 `moderation_actions`。管理员账号、角色和启停目前仍需通过受信 SQL/Auth 操作，没有前端账号管理界面。

## 正式运营前仍需补齐

当前方案适合带人工审核的小范围测试，不是完整的未成年人产品安全体系。扩大运营前至少应补充验证码或网关防刷、可靠身份与监护人同意、恢复码撤销/轮换、幂等键、限流桶清理、备份恢复演练、告警、数据删除流程与未成年人隐私治理。
