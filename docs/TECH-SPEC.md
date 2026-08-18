# 数据与接口规格

本文以 Supabase schema v3 和当前静态前端为准。标为“未来规划”的内容尚未实现，不能作为现有接口调用。

## 1. 当前架构

```text
GitHub Pages 静态前台
  -> Supabase PostgREST（公开视图 + SECURITY DEFINER RPC）
  -> PostgreSQL（RLS、约束、审核、限流、恢复码、运行状态）

GitHub Pages /admin.html
  -> Supabase Auth Magic Link
  -> 白名单管理 RPC
```

普通参与者没有账号，以浏览器生成的匿名会话 ID 参与。管理员必须拥有 Supabase Auth JWT，且其 UUID 位于启用的 `moderator_accounts` 白名单。前台的审核消息由恢复码轮询 `submission_events` 得到，不是实时推送服务。

## 2. 当前枚举与状态

数据库使用带 `CHECK` 的小写文本字段，不是 PostgreSQL enum type。

```text
Role              = adult | child
Direction         = adult_to_child | child_to_adult
Source            = user | official
QuestionStatus    = pending | open | closed | hidden | rejected
AnswerStatus      = pending | published | hidden | rejected
ReportStatus      = open | resolved | dismissed
ModeratorRole     = owner | reviewer
SubmissionType    = question | answer
```

方向和目标身份由数据库根据提问者身份生成：

```text
adult 提问 -> adult_to_child -> 只能由 child 回答
child 提问 -> child_to_adult -> 只能由 adult 回答
```

`draft` 只存在浏览器草稿中，不是数据库内容状态；当前没有 `archived` 状态。

## 3. 当前数据模型

### `questions`

```text
id
author_session_id       # 原会话 ID 的带命名空间 SHA-256 指纹
author_role
target_role             # generated
direction               # generated
body                    # 5-80 字符
anonymous
status
source
created_at / updated_at
moderated_at / moderated_by / moderation_reason
submitter_feedback
resubmitted_at
submission_revision
```

### `answers`

```text
id
question_id
author_session_id       # 哈希指纹
author_role
body                    # 1-160 字符
anonymous
status
featured
created_at / updated_at
moderated_at / moderated_by / moderation_reason
submitter_feedback
resubmitted_at
submission_revision
unique(question_id, author_session_id)
```

### `reports`

```text
id
target_type             # 固定为 note
target_id               # answers.id
reporter_session_id     # 哈希指纹
reason                  # privacy | abuse | spam | other
status
created_at
resolved_at / resolved_by / resolution_note
unique(target_type, target_id, reporter_session_id)
```

### 管理与运营

```text
moderator_accounts      # 管理员 UUID、owner/reviewer、enabled
moderation_actions      # 审核、举报、内容和设置的审计记录
runtime_settings        # 单例三档运营开关、公开说明、更新人/时间
abuse_rate_buckets      # 会话/网络哈希对应的动作窗口和封禁时间
```

### 匿名投稿恢复

```text
submission_receipts     # 恢复码 SHA-256、实体类型/ID、有效期、撤销/访问时间
submission_events       # 投稿、审核、发布、隐藏、关闭、回答与精选事件
```

当前没有服务端 `User`、Reaction、收藏或通用 Notification 模型。身份、草稿、收藏和已看记录保存在浏览器；投稿事件只能由持有对应恢复码的人查询。

## 4. 公开数据投影

### `wall_notes`

只投影状态为 `published` 的回答，以及状态为 `open` 或 `closed` 的原问题：

```json
{
  "note_id": "00000000-0000-4000-8000-000000000202",
  "question_id": "00000000-0000-4000-8000-000000000101",
  "answer_id": "00000000-0000-4000-8000-000000000202",
  "direction": "adult_to_child",
  "question": "你觉得大人最容易忘记什么？",
  "answer": "忘记自己以前也会害怕。",
  "published_at": "2026-08-17T02:00:00Z",
  "featured": true,
  "answer_count": 4
}
```

视图不返回昵称、账号、会话指纹、`source`、恢复码或审核字段。`anonymous` 当前会存储，但公开投影本身没有昵称字段，因此不会改变便签署名。

### `question_pool`

返回 `id`、`direction`、`asker_role`、`target_role`、`body`、`answer_count`、`created_at`、`status`。只有 `open` 问题进入池；暂停投稿、只读或紧急关闭时视图为空。

紧急关闭时 `wall_notes` 也为空。运行限制写在数据库视图本身，旧客户端不能通过跳过前端状态检查继续读取。

## 5. 当前公共接口

所有路径位于 Supabase `/rest/v1/` 下。

| 调用 | 关键参数 | 成功结果 |
| --- | --- | --- |
| `GET wall_notes` | `select/order/limit` | 公开便签数组 |
| `GET question_pool` | `select/order/limit` | 开放问题数组 |
| `POST rpc/public_runtime_status` | 无 | schema/hardening 版本、三档开关、公开说明 |
| `POST rpc/submit_question` | session、role、body、anonymous | ID、恢复码、`pending`、创建时间 |
| `POST rpc/submit_answer` | session、question ID、role、body、anonymous | ID、恢复码、`pending`、创建时间 |
| `POST rpc/submit_report` | session、note ID、reason | 举报 ID 与状态；重复举报返回 `duplicate` |
| `POST rpc/get_submission_status` | receipt | 正文、状态、版本、反馈、时间和最近 20 个事件 |
| `POST rpc/resubmit_question` | receipt、body、anonymous | 同一问题回到 `pending`，版本加一 |
| `POST rpc/resubmit_answer` | receipt、body、anonymous | 同一回答回到 `pending`，版本加一 |

业务拒绝使用稳定错误码，例如 `submissions_paused`、`read_only`、`emergency_lockdown`、`rate_limited`、`question_not_open`、`own_question`、`already_answered`、`not_found` 与 `not_resubmittable`。参数和数据库约束错误可能以 SQLSTATE/PostgREST 错误返回，前端适配器保留 HTTP status 与数据库 code。

成功投稿返回的恢复码为 64 位十六进制 bearer secret，服务端仅保存其 SHA-256。默认 365 天有效，重提不延期、不轮换。当前没有客户端幂等键；成功响应丢失后重新发起投稿可能创建重复内容。

## 6. 服务端校验

- 会话 ID 去除首尾空白后须为 8-128 字符，只允许字母、数字、点、下划线、冒号和连字符，且首字符为字母或数字。
- 服务端不接受前端指定 `direction`、`target_role`、`source` 或公开状态。
- 回答必须匹配问题的目标身份，原问题必须开放；同一会话不能自问自答，也不能对同题创建第二条回答。
- 问题为 5-80 字符，回答为 1-160 字符；连续空白会压缩为一个空格。
- 问题、回答及其重提会拦截 HTML 尖括号、常见网址、邮箱和大陆手机号模式。该规则不是完整的隐私信息识别。
- 新问题和回答一律进入 `pending`；只有审核通过的内容进入公开视图。
- 只有 `rejected` 内容可凭恢复码重提；回答重提还要求原问题仍为 `open`。
- schema v3 发布加固要求所有 `rejected` 内容具有具体审核理由，投稿事件可承载最长 500 字符的完整反馈。
- 公共写入受会话哈希和可选网络地址哈希双重限流；网络桶额度是单会话的 20 倍，精确阈值见 [`supabase/README.md`](../supabase/README.md#内容校验与限流)。

## 7. 投稿事件

```text
submitted
approved
rejected
resubmitted
published
hidden
closed
reopened
answer_received
featured
```

`get_submission_status` 最多返回最近 20 条，按事件 ID 倒序。前端比较已知事件 ID 后在本机生成“我的”消息。恢复码查询在暂停投稿、只读与紧急关闭时仍可用。

## 8. 管理接口

`reviewer` 与 `owner` 都可执行：

```text
admin_whoami
admin_dashboard
admin_list_questions
admin_list_answers
admin_list_reports
admin_list_actions
admin_moderate_question
admin_moderate_answer
admin_resolve_report
admin_get_runtime_settings
```

只有 `owner` 可以执行 `admin_update_runtime_settings`。所有管理函数先验证 `auth.uid()` 对应的白名单账号是否启用；公开角色和普通已登录用户不能直接读取或修改底表。运营设置修改会记录前后快照。

当前管理列表尚不返回 `submissionRevision`、`resubmittedAt`、`updatedAt` 或 `submitterFeedback`，也仍按首次创建时间排序；审核员不能直接在列表中识别第几次重提，这是已知缺口。

## 9. 前端本地状态

| 数据 | 存储位置 | 跨设备方式 |
| --- | --- | --- |
| 当前身份、草稿、收藏、“我的”副本 | 浏览器本地存储 | 不自动同步 |
| 近期已看便签 | Cookie + 本次访问内存 | 不同步 |
| 匿名会话 ID | 浏览器本地存储 | 不同步 |
| 单条投稿及审核事件 | Supabase | 事先保存恢复码后手动导入 |

清除站点数据会同时删除本机保存的恢复码副本。数据库中的投稿不会因此删除，但用户没有恢复码就无法重新关联它。

## 10. 运行与发布约束

- 部署必须依次应用 `0001`、`0002`、`0003`、`0004`；`0004` 是 schema v3 的发布加固，不改变公开契约版本号。
- Pages 构建只接受 HTTPS 的托管 Supabase URL，并要求 `SUPABASE_URL` 与 `SUPABASE_ANON_KEY`。
- 静态页面通过 CSP 将脚本和样式限制为同源，连接目标限制为同源和托管 Supabase；Lucide 1.8.0 使用项目内 vendor 文件，不依赖运行时 CDN。
- 当前公开页资源版本为 styles/app v13、backend/config v3；修改资源后需同步更新 HTML 查询参数以刷新移动端缓存。
- 工作流运行三个 JavaScript 语法检查和后端契约测试，然后调用 `moderation_status`；只有 `schemaVersion = 3`、`hardeningVersion = 1` 且 `submissionsRequireReview = true` 才发布。
- hardening marker 可确认远端已应用 `0004`，但探针不会穷举检查全部 RPC、权限或字段，发布后仍需执行移动端与权限验收。
- Pages 静态文件回滚不会回滚数据库迁移。

## 11. 未来规划（未实现）

- 参与者账号、监护人关系、账号级跨设备同步与数据删除申请。
- 可撤销/轮换的恢复凭证，以及安全找回机制。
- 投稿幂等键和明确的网络超时恢复协议。
- 服务器端收藏、反应、通用通知与推送服务。
- 正式埋点管线；事件不得携带问题或回答原文。
- 验证码/WAF、风险评分、共享网络限流优化与限流桶定期清理。
- 自动备份恢复演练、告警、审计导出和未成年人隐私治理。
