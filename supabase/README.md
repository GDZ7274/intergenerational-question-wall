# Supabase 数据与审核后台

`migrations/0001_experience.sql` 创建业务表、公开视图、RLS、写入校验触发器和种子问答。`migrations/0002_moderation.sql` 将新投稿切换为待审核，并增加管理员白名单、受限审核 RPC 和不可由浏览器修改的操作日志。

## 执行

1. 新建 Supabase 免费项目。
2. 打开 SQL Editor，依次完整执行 `migrations/0001_experience.sql` 和 `migrations/0002_moderation.sql`。
3. 在 Authentication 中创建并确认管理员用户，再把该用户的 `auth.users.id` 私下写入 `moderator_accounts`。
4. 在 Table Editor 中确认 `questions`、`answers`、`reports`、`moderator_accounts`、`moderation_actions`，并在 Views 中确认 `wall_notes`、`question_pool`。

当前版本不需要打开 Anonymous Sign-Ins。浏览器使用项目的 publishable key（旧版界面中叫 `anon public` key）访问 REST API：

- `anon` 只能向三张业务表执行受控 `INSERT`，不能直接读取底表。
- 公开读取只能通过 `wall_notes` 与 `question_pool`，两个视图都不会返回 `author_session_id`。
- 触发器根据提问身份推导方向与目标身份，校验回答者身份，禁止自问自答，并限制同一会话重复回答。
- 新问题写入 `pending`，管理员批准后变为 `open`；新回答写入 `pending`，管理员批准后变为 `published`。
- `authenticated` 用户仍不能直接读写底表。只有 UUID 位于 `moderator_accounts` 且启用的用户才能执行管理 RPC。

## 前端字段契约

`prototype/backend.js` 使用以下 REST 资源：

| 资源 | 方法 | 用途 |
| --- | --- | --- |
| `wall_notes` | `GET` | 单张推荐流和问答墙 |
| `question_pool` | `GET` | 当前身份可回答的问题 |
| `questions` | `POST` | 提交待审问题 |
| `answers` | `POST` | 提交待审回答 |
| `reports` | `POST` | 举报公开便签 |

写入请求使用 `Prefer: return=minimal`，所以公共角色不需要底表的 `SELECT` 权限。`note_id` 等于对应回答的 UUID，举报可以直接关联到 `answers.id`。

## 安全边界

审核后台通过以下 RPC 工作：`admin_whoami`、`admin_dashboard`、`admin_list_questions`、`admin_list_answers`、`admin_list_reports`、`admin_list_actions`、`admin_moderate_question`、`admin_moderate_answer`、`admin_resolve_report`。状态更新和日志写入在同一事务内完成；举报“下架并解决”会同时隐藏回答、解决举报并写入两条日志。

这是带人工审核的小范围测试方案，不是完整的正式运营安全模型。公开前端 key 天生对所有访问者可见，匿名会话 ID 也可以被伪造；当前数据库约束和频率限制只能降低误操作与低成本滥用，不能替代验证码、服务端风控、监护人同意和未成年人数据治理。

不要把 `service_role` key、数据库密码、管理员 UUID 或其他凭据放进网页或 GitHub 仓库。正式扩大运营前仍需补充验证码/防刷、备份恢复演练、告警、管理员分权和未成年人隐私合规流程。
