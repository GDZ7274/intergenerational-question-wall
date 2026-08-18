# 数据与接口草案

## 1. 技术边界

前端可以使用 HTML、CSS 和 JavaScript 实现，但持续运营版本不能依赖 `localStorage` 作为共享数据源。正式产品至少需要 API、数据库、身份凭证、审核后台、通知服务和操作日志。

低保真原型使用本地示例数据，只验证信息架构与交互。

## 2. 枚举

```text
Role = ADULT | CHILD
Action = ASK | ANSWER
Direction = ADULT_TO_CHILD | CHILD_TO_ADULT
Source = USER | OFFICIAL
ContentStatus = DRAFT | PENDING | OPEN | PUBLISHED | REJECTED | HIDDEN | CLOSED | ARCHIVED
```

方向必须由服务端推导：

```text
ADULT + ASK    -> ADULT_TO_CHILD
ADULT + ANSWER -> 只能回答 CHILD_TO_ADULT
CHILD + ASK    -> CHILD_TO_ADULT
CHILD + ANSWER -> 只能回答 ADULT_TO_CHILD
```

## 3. 最小数据模型

### User

```text
id
publicNickname
currentRole
accountStatus
createdAt
updatedAt
```

### Question

```text
id
authorId
authorRole
targetRole
direction
body
source
status
answerLimit
publishedAnswerCount
createdAt
updatedAt
closedAt
```

### Answer

```text
id
questionId
authorId
authorRole
body
source
status
createdAt
updatedAt
```

### Reaction

```text
id
userOrSessionId
targetType
targetId
type
createdAt
```

### Notification

```text
id
recipientId
type
targetType
targetId
readAt
createdAt
```

### Report

```text
id
reporterUserOrSessionId
targetType
targetId
reason
status
createdAt
resolvedAt
```

### ModerationRecord

```text
id
targetType
targetId
operatorId
decision
reasonCode
note
createdAt
```

## 4. 公开数据投影

问答墙不直接返回完整 User、Question 和 Answer 对象，而返回脱敏后的便签投影：

```json
{
  "questionId": "q_123",
  "answerId": "a_456",
  "direction": "ADULT_TO_CHILD",
  "question": "你觉得大人最容易忘记什么？",
  "answer": "忘记自己以前也会害怕。",
  "questionNickname": "一位大人",
  "answerNickname": "一位小朋友",
  "publishedAt": "2026-08-17T10:00:00+08:00",
  "answerCount": 4,
  "featured": true
}
```

公开接口不得返回 `source`、真实账号信息、审核记录或内部风险字段。

## 5. API 草案

### 公共浏览

```text
GET /api/wall?cursor=
GET /api/questions/:id
POST /api/reports
```

### 参与者

```text
GET /api/me
PATCH /api/me/role
GET /api/me/questions
GET /api/me/answers
GET /api/me/notifications
POST /api/questions
PATCH /api/questions/:id
POST /api/questions/:id/close
GET /api/question-pool?role=&cursor=
POST /api/questions/:id/answers
PATCH /api/answers/:id
```

### 运营后台

```text
GET /api/admin/moderation
POST /api/admin/moderation/:targetType/:targetId/decision
POST /api/admin/questions
PATCH /api/admin/questions/:id/feature
GET /api/admin/supply-demand
POST /api/admin/site/read-only
```

## 6. 服务端校验

- 不信任前端提交的 `direction`、`targetRole`、`source` 或公开状态。
- 根据登录身份推导问答方向和可回答范围。
- 验证问题仍为开放状态且未达到回答上限。
- 对重复请求使用幂等键，避免断网重试生成重复内容。
- 对文本长度、频率、敏感信息和内容状态进行二次校验。
- 用户输入按纯文本存储和渲染，禁止直接注入 HTML。
- 公开查询只返回已审核、未隐藏和已脱敏的数据。
- `source` 仅允许运营后台设置或修改，前台不可伪造。

## 7. 通知事件

```text
QUESTION_APPROVED
QUESTION_REJECTED
ANSWER_APPROVED
ANSWER_REJECTED
QUESTION_RECEIVED_ANSWER
CONTENT_FEATURED
CONTENT_HIDDEN
```

MVP 可先实现站内通知，短信、微信模板消息或推送由账号方案决定。

## 8. 分析事件

```text
wall_viewed
note_opened
identity_selection_started
identity_selected
question_draft_started
question_submitted
answer_pool_viewed
answer_draft_started
answer_submitted
notification_opened
content_shared
content_reported
```

分析事件不携带问题或回答原文，不记录不必要的个人信息。

## 9. 非功能要求

- 公共页面应支持服务端缓存或 CDN，审核隐藏后可及时失效。
- 移动端弱网下保留草稿和明确重试状态。
- 所有写接口需要鉴权、限流和审计。
- 关键写操作需要幂等处理。
- 支持数据备份、删除请求和紧急只读模式。
- 页面需要满足基本键盘、屏幕阅读器和减少动效设置。
