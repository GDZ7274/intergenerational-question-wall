# 数据与接口规格

本文以当前静态前台为准：文字问答可在 Supabase schema v3 + 发布加固基线上运行；实体照片便签能力以完整 schema v4 和 `photo-note-media` Edge Function 为准。标为“未来规划”的内容尚未实现，不能作为现有接口调用。

## 1. 当前架构

```text
GitHub Pages 静态前台
  -> Supabase PostgREST（公开视图 + SECURITY DEFINER 公共 RPC）
  -> PostgreSQL（RLS、约束、审核、限流、恢复码、运行状态）

GitHub Pages /admin.html
  -> Supabase Auth Magic Link
  -> 白名单管理 RPC
  -> photo-note-media Edge Function（鉴权媒体上传、预览、发布、下架与清理）
  -> Supabase Storage：photo-note-staging（私有）/ photo-note-public（公开）
```

普通参与者没有账号，以浏览器生成的匿名会话 ID 参与。管理员必须持有 Supabase Auth JWT，且 UUID 位于启用的 `moderator_accounts` 白名单。文本投稿的审核消息由恢复码轮询 `submission_events` 得到，不是实时推送。实体便签仅允许管理员采集和审核，访客无法上传或读取待审原图。

## 2. 枚举与状态

数据库使用带 `CHECK` 的小写文本字段，不是 PostgreSQL enum type。

```text
Role              = adult | child
Direction         = adult_to_child | child_to_adult
Source            = user | official
QuestionStatus    = pending | open | closed | hidden | rejected
AnswerStatus      = pending | published | hidden | rejected
PhotoNoteStatus   = draft | pending | published | hidden | rejected
PhotoNoteSource   = staff_capture | offline_event | archive
ReportStatus      = open | resolved | dismissed
ReportNoteKind    = text | photo
ModeratorRole     = owner | reviewer
SubmissionType    = question | answer
```

方向和目标身份由数据库根据提问者身份生成：

```text
adult 提问 -> adult_to_child -> 只能由 child 回答
child 提问 -> child_to_adult -> 只能由 adult 回答
```

`draft` 只用于浏览器草稿和管理员的实体照片草稿；文本问题/回答没有数据库 `draft` 状态。前台称谓使用“大朋友/小朋友”，不改变数据库的 `adult/child` 值。

## 3. 数据模型

### `questions`

```text
id
author_session_id       # 原会话 ID 的带命名空间 SHA-256 指纹
author_role / target_role / direction   # 后两项由数据库生成
body                    # 5-80 字符
anonymous / status / source
created_at / updated_at
moderated_at / moderated_by / moderation_reason
submitter_feedback / resubmitted_at / submission_revision
```

### `answers`

```text
id / question_id
author_session_id       # 哈希指纹
author_role
body                    # 1-160 字符
anonymous / status / featured
created_at / updated_at
moderated_at / moderated_by / moderation_reason
submitter_feedback / resubmitted_at / submission_revision
unique(question_id, author_session_id)
```

### `photo_notes`

```text
id / created_by
direction
question_text           # 1-160 字符；发布时必填
answer_text             # 1-320 字符；发布时必填
alt_text                # 5-500 字符；发布时必填
internal_note           # 最长 1000 字符，仅后台
source / status / featured / rotation_degrees
staging_object_path     # photo-note-staging，必填且唯一
public_object_path      # photo-note-public，发布时必填
mime_type / file_size_bytes / width / height
created_at / updated_at / submitted_at / published_at
moderated_at / moderated_by / moderation_reason
```

发布中的照片便签必须有方向、转写、`alt_text`、公开对象路径、类型、大小及发布时间；`rejected` 必须有审核理由。当前前台把照片便签映射为独立 `note_id`，其 `questionId` 和 `answerId` 为 `null`。

### 其他业务表

```text
reports                 # note 目标；note_kind 区分 text/photo
moderator_accounts      # 管理员 UUID、owner/reviewer、enabled
moderation_actions      # 内容、举报、照片与设置的审计记录
runtime_settings        # 单例三档运营开关、公开说明、更新人/时间
abuse_rate_buckets      # 会话/网络哈希对应的动作窗口和封禁时间
submission_receipts     # 文本投稿恢复码 SHA-256、有效期和访问时间
submission_events       # 文本投稿、审核、发布、隐藏、关闭、回答与精选事件
```

没有服务端 `User`、Reaction、收藏或通用 Notification 模型。身份、草稿、收藏、已看 Cookie 与近期回看历史均保存在当前浏览器；恢复码只适用于文本问题/回答。

## 4. Storage 与照片媒体安全边界

| 资源 | 可见性 | 访问方式 |
| --- | --- | --- |
| `photo-note-staging` | 私有 | 仅通过鉴权 `photo-note-media` 生成临时上传/预览；浏览器角色没有桶对象读写策略 |
| `photo-note-public` | 公开 | 仅审核发布后由 `wall_notes` 给出受控路径；前台只接受本项目该桶的路径 |
| `photo_notes` 底表 | 管理员 RPC | `anon` 和 `authenticated` 均无直接表权限；RPC/函数再次检查管理员白名单 |

后台先在浏览器将选中照片旋转、缩放至最长边 2048px、重新编码为 JPEG，以移除 EXIF。函数仍会限制 8 MB，校验 JPEG/PNG/WebP 文件头并拒绝含拍摄元数据的文件。`PHOTO_NOTE_ALLOWED_ORIGINS` 必须配置；配置缺失、请求缺少 Origin 或来源不匹配时函数失败关闭。发布时函数把私有对象复制到公开桶；下架后删除公开对象，失败则保持 `hidden` 并允许调用 `clear_media` 重试。schema v4 的 `0006_photo_media_service_boundary.sql` 将所有公开 Storage 状态转换（通过、重新发布、下架、清理和照片举报下架）限制在 Edge Function 的 service-role 包装器内，并把实际审核员 ID 写入审计记录。

## 5. 公开数据投影

### `wall_notes`

只返回可公开展示的文字回答和实体照片便签：

- 文字：`answers.status = published` 且原问题为 `open` 或 `closed`；
- 照片：`photo_notes.status = published`；
- 任一 `emergency_lockdown` 下，视图为空。

```json
{
  "note_id": "00000000-0000-4000-8000-000000000202",
  "question_id": "00000000-0000-4000-8000-000000000101",
  "answer_id": "00000000-0000-4000-8000-000000000202",
  "direction": "adult_to_child",
  "question": "你觉得大朋友最容易忘记什么？",
  "answer": "忘记自己以前也会害怕。",
  "published_at": "2026-08-17T02:00:00Z",
  "featured": true,
  "answer_count": 4,
  "kind": "text",
  "photo_note_id": null,
  "media_bucket": null,
  "media_path": null,
  "alt_text": null,
  "media_width": null,
  "media_height": null
}
```

照片行使用 `kind: "photo"`，`photo_note_id = note_id`，并提供 `media_bucket: "photo-note-public"`、`media_path`、`alt_text`、图片宽高；`question_id`、`answer_id` 都是 `null`。视图不返回昵称、账号、会话指纹、`source`、恢复码、内部备注或审核字段。

### `question_pool`

返回开放文字问题的 `id`、`direction`、`asker_role`、`target_role`、`body`、`answer_count`、`created_at`、`status`。只有 `open` 问题进入池；暂停投稿、只读或紧急关闭时视图为空。

## 6. 公共接口

所有公共数据/RPC 位于 Supabase `/rest/v1/` 下。

| 调用 | 关键参数 | 成功结果 |
| --- | --- | --- |
| `GET wall_notes` | `select/order/limit` | 公开文字与照片便签数组 |
| `GET question_pool` | `select/order/limit` | 开放问题数组 |
| `POST rpc/public_runtime_status` | 无 | schema/hardening 版本、照片能力、三档开关与公开说明 |
| `POST rpc/submit_question` | session、role、body、anonymous | ID、恢复码、`pending`、创建时间 |
| `POST rpc/submit_answer` | session、question ID、role、body、anonymous | ID、恢复码、`pending`、创建时间 |
| `POST rpc/submit_report` | session、note ID、reason | 举报 ID、`noteKind` 与状态；重复举报返回 `duplicate` |
| `POST rpc/get_submission_status` | receipt | 文本投稿正文、状态、版本、反馈、时间和最近事件 |
| `POST rpc/resubmit_question` | receipt、body、anonymous | 同一问题回到 `pending`，版本加一 |
| `POST rpc/resubmit_answer` | receipt、body、anonymous | 同一回答回到 `pending`，版本加一 |

成功文本投稿返回的恢复码为 64 位十六进制 bearer secret，服务端仅保存 SHA-256。默认 365 天有效，重提不延期、不轮换。当前没有客户端幂等键。

## 7. 管理与照片接口

管理员先通过 Magic Link 登录；所有管理 RPC 都验证 `auth.uid()` 是否为启用白名单账号。`reviewer` 与 `owner` 可使用内容/举报/照片审核能力，只有 `owner` 可更新运行状态。

```text
admin_whoami / admin_dashboard
admin_list_questions / admin_list_answers / admin_list_reports / admin_list_actions
admin_moderate_question / admin_moderate_answer / admin_resolve_report
admin_get_runtime_settings / admin_update_runtime_settings (owner only)

admin_create_photo_note / admin_get_photo_note / admin_update_photo_note
admin_submit_photo_note / admin_list_photo_notes
admin_moderate_photo_note
```

`admin_moderate_photo_note` 的状态动作是 `approve`、`reject`、`hide`、`publish`、`feature`、`unfeature`、`clear_media`。普通管理员可经此 RPC 执行不改变公开媒体的 `reject`、`feature`、`unfeature`；`approve/publish/hide/clear_media` 会拒绝普通 PostgREST 调用，只能由 `photo-note-media` 的 service-role 包装器执行。`clear_media` 只允许 `hidden` 记录并用于重试公开对象清理；照片举报的“下架并解决”同样经过函数的 `hideReportedPhoto` 动作。

`photo-note-media` 是单一 POST/OPTIONS Edge Function，需要有效管理员 JWT 和允许的 Origin。它提供草稿上传地址、私有预览、上传完成登记、发布复制、下架清理及隐藏媒体清理等受控操作；前端和 GitHub Pages 配置不得包含 `service_role`。

## 8. 服务端校验

- 会话 ID 去除首尾空白后须为 8-128 字符，只允许字母、数字、点、下划线、冒号和连字符，且首字符为字母或数字。
- 服务端不接受前端指定 `direction`、`target_role`、`source` 或文字内容公开状态。
- 回答必须匹配问题目标身份，原问题必须开放；同一会话不能自问自答，也不能对同题创建第二条回答。
- 文本问题为 5-80 字符，回答为 1-160 字符；连续空白会压缩为一个空格。文本及重提拦截 HTML 尖括号、常见网址、邮箱和大陆手机号模式。
- 新文本问题/回答一律进入 `pending`；只有审核通过的内容进入公开视图。`rejected` 内容才可凭恢复码重提，回答重提还要求原问题 `open`。
- 实体照片只允许管理员创建；公开前必须有文字转写、`alt_text`、有效图片和公开媒体对象。
- 公共写入受会话哈希和可选网络地址哈希双重限流；网络桶额度是单会话的 20 倍，精确阈值见 [`supabase/README.md`](../supabase/README.md#内容校验与限流)。

## 9. 前端本地状态、同步与分享

| 数据 | 存储位置 | 跨设备方式 |
| --- | --- | --- |
| 当前身份、草稿、收藏及便签快照、“我的”副本 | `localStorage` | 不自动同步 |
| 近期已看去重 | Cookie（最多 100 个 ID、180 天）+ 本次内存 | 不同步 |
| 有序近期回看 | `localStorage`（最多 60 个公开 note ID） | 不同步 |
| 匿名会话 ID | `localStorage` | 不同步 |
| 单条文本投稿及审核事件 | Supabase；凭恢复码读取 | 事先保存恢复码后手动导入 |

前台以 20 秒为间隔轮询 `public_runtime_status`；页面得到 focus、online 或重新 visible 时也同步。状态改变后再拉取公开内容，发布内容可进入墙，已下架内容会从墙、推荐队列、近期回看、收藏校验和打开的详情/分享层移除。内容签名未变化时不重置浏览结束状态。没有实时订阅。

收藏在本机按最近操作排序并保存小型快照；联网时通过 `wall_notes` 重新校验公开状态。分享面板可生成文字便签 PNG，或读取照片便签公开原图；生成后的 Blob 同时用于保存前预览、系统分享和下载，预览对象地址在面板关闭或内容失效时释放。面板也可复制带 `?note=` 的直接链接；打开链接会再次复核公开状态。

## 10. 运行与发布约束

- 文字问答的 Pages 审核基线是 `schemaVersion = 3`、`hardeningVersion = 1`、`submissionsRequireReview = true`。满足该基线时，Pages 可发布前台；管理后台会因照片摘要字段不存在而自动隐藏照片采集/审核入口，且工作流跳过照片投影与 Edge/CORS 探针。
- 完整 schema v4 才启用照片能力。生产必须顺序应用 `0001_experience.sql`、`0002_moderation.sql`、`0003_operational_controls.sql`、`0004_release_hardening.sql`、`0005_photo_notes.sql`、`0006_photo_media_service_boundary.sql`，并部署 `photo-note-media`；已是 schema v3 的项目必须继续执行 `0005` 和 `0006`。
- Pages 将完整 v4 识别为 `schemaVersion = 4`、`hardeningVersion = 1`、`submissionsRequireReview = true`、`photoNotesEnabled = true`、`photoUploadMode = moderator_only`、`photoMediaServiceBoundaryVersion = 1`。只有此时才验证 `wall_notes` 的照片投影，以及 Edge Function 对 Pages origin 的 CORS；探针成功后照片后台和公开照片能力才可用。部署函数前必须设置 `PHOTO_NOTE_ALLOWED_ORIGINS`；生产 origin 只写协议与主机，不含仓库路径。
- `supabase-release` 支持手动 preflight/deploy，也会响应唯一 `supabase-v*` 标签。标签路径固定为 deploy，仍先 dry run 并在发现会重放 `0001` 至 `0004` 时拒绝；所有生产写入都受 `supabase-production` Environment 审批。推荐先将功能提交推送到功能分支并打标签，后端成功后再合并或推送 `main` 发布 Pages。
- 静态页面 CSP 限制脚本样式为同源，连接目标为同源和托管 Supabase；Lucide 使用项目内 vendor 文件。当前资源缓存版本为 styles v23、app v24、backend v5、admin v8；改动资源时须同步更新 HTML 查询参数。
- Pages 工作流运行 `app.js`、`backend.js`、`admin.js` 的语法检查和 `tests/*.test.mjs`。Pages 回滚不会回滚数据库迁移、Storage 或 Edge Function。

## 11. 未来规划（未实现）

- 参与者账号、监护人关系、账号级跨设备同步和数据删除申请。
- 可撤销/轮换的恢复凭证、安全找回以及文本投稿幂等键。
- 服务器端收藏、反应、通用通知与推送服务。
- 正式埋点管线；事件不得携带问题、回答、转写或照片原文。
- 验证码/WAF、风险评分、共享网络限流优化、照片自动脱敏/审核辅助与定期清理策略。
- 备份恢复演练、告警、审计导出和未成年人隐私治理。
