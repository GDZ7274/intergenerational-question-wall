# Supabase 体验库

`migrations/0001_experience.sql` 是手机体验版的完整初始化脚本。它创建三张底表、两个公开视图、RLS、写入校验触发器和一组与前端原型一致的种子问答。

## 执行

1. 新建 Supabase 免费项目。
2. 打开 SQL Editor，新建查询并粘贴 `migrations/0001_experience.sql` 的全部内容。
3. 运行一次，确认结尾显示成功。
4. 在 Table Editor 中确认 `questions`、`answers`、`reports`，并在 Views 中确认 `wall_notes`、`question_pool`。

当前版本不需要打开 Anonymous Sign-Ins。浏览器使用项目的 publishable key（旧版界面中叫 `anon public` key）访问 REST API：

- `anon` 只能向三张底表执行 `INSERT`，不能直接读取底表。
- 公开读取只能通过 `wall_notes` 与 `question_pool`，两个视图都不会返回 `author_session_id`。
- 触发器根据提问身份推导方向与目标身份，校验回答者身份，禁止自问自答，并限制同一会话重复回答。
- 体验模式中的问题和回答会立即公开；运营人员可在 Supabase Table Editor 中把状态改为 `hidden` 或 `closed`。

## 前端字段契约

`prototype/backend.js` 使用以下 REST 资源：

| 资源 | 方法 | 用途 |
| --- | --- | --- |
| `wall_notes` | `GET` | 单张推荐流和问答墙 |
| `question_pool` | `GET` | 当前身份可回答的问题 |
| `questions` | `POST` | 发布问题 |
| `answers` | `POST` | 发布回答 |
| `reports` | `POST` | 举报公开便签 |

写入请求使用 `Prefer: return=minimal`，所以公共角色不需要底表的 `SELECT` 权限。`note_id` 等于对应回答的 UUID，举报可以直接关联到 `answers.id`。

## 安全边界

这是邀请制小范围测试方案，不是正式运营安全模型。公开前端 key 天生对所有访问者可见，匿名会话 ID 也可以被伪造；当前数据库约束和频率限制只能降低误操作与低成本滥用，不能替代账号体系、验证码、服务端风控、内容审核和监护人同意流程。

正式运营前至少需要改为服务端签发身份、审核后发布、管理员分权、操作日志、备份与滥用处置。不要把 `service_role` key、数据库密码或其他管理员凭据放进网页或 GitHub 仓库。
