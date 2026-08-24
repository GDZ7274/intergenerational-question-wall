# GitHub Pages + Supabase 部署

当前线上版采用以下结构：

```text
手机浏览器 -> GitHub Pages 前台 -> Supabase REST API -> PostgreSQL + RLS
管理员浏览器 -> GitHub Pages /admin.html -> Supabase Auth + 审核 RPC
实体便签采集 -> 受鉴权 Edge Function -> 私有待审 Storage -> 公开媒体 Storage
```

GitHub Pages 负责发布 `prototype/` 中的静态文件；Supabase 负责数据、管理员登录、审核权限、操作日志和实体便签媒体。浏览器只持有公开 publishable key，管理员操作使用登录后的短期 JWT；`service_role` 只存在于 Supabase Edge Function 的托管环境中，任何页面和 GitHub 配置都不包含它。

## 当前能力边界

已接入 Supabase 的共享能力：

- 读取已发布问答墙和开放的问题池。
- 通过受控 RPC 提交问题、回答和举报；新投稿默认进入待审核状态。
- 为问题和回答签发恢复码，可轮询审核状态、在另一设备手动恢复，并修改重投被驳回内容。
- 数据库通过状态字段和公开视图控制哪些内容出现在前台。
- 管理员在 `admin.html` 审核问题与回答、处置举报、管理公开内容、查看操作记录与运行状态。
- 白名单内工作人员可在移动端拍摄实体便签；浏览器重编码后通过短期单对象地址写入私有桶，审核通过才复制到公开桶并进入统一滑动墙。

仍保存在当前浏览器的内容：

- “大人 / 小朋友”身份选择、匿名会话 ID 和本机保存的恢复码副本。
- 草稿、收藏、近期已看记录和推荐去重。
- “我的提问 / 我的回答”的本机副本和站内提示。

因此当前版本可用于邀请用户进行带人工审核的手机端测试，但尚未提供账号级跨设备同步或监护人账号。清除浏览器站点数据后，本机记录和恢复码副本都会丢失；数据库投稿仍存在，但只有事先另存恢复码，才能在另一设备重新关联单条投稿。

## 1. 准备 Supabase

1. 在 [Supabase](https://supabase.com/) 新建项目，并妥善保存数据库密码。
2. 在项目的 **SQL Editor** 中依次运行 [`supabase/migrations/0001_experience.sql`](../supabase/migrations/0001_experience.sql)、[`supabase/migrations/0002_moderation.sql`](../supabase/migrations/0002_moderation.sql)、[`supabase/migrations/0003_operational_controls.sql`](../supabase/migrations/0003_operational_controls.sql)、[`supabase/migrations/0004_release_hardening.sql`](../supabase/migrations/0004_release_hardening.sql)、[`supabase/migrations/0005_photo_notes.sql`](../supabase/migrations/0005_photo_notes.sql) 和 [`supabase/migrations/0006_photo_media_service_boundary.sql`](../supabase/migrations/0006_photo_media_service_boundary.sql)。不要颠倒顺序；已运行 schema v3 的项目只需继续执行 `0005` 和 `0006`。
3. 在 **Project Settings > API** 中取得：
   - **Project URL**，格式类似 `https://xxxx.supabase.co`。
   - **Publishable key**；旧项目中可能显示为 `anon public` key。
4. 在 **Authentication > Users** 创建管理员用户，并确认邮箱已验证。复制该用户 UUID，只在 SQL Editor 中执行白名单语句，不要写入仓库：

   ```sql
   insert into public.moderator_accounts (user_id, role)
   values ('<auth.users.id>', 'owner')
   on conflict (user_id) do update
   set role = 'owner', enabled = true;
   ```

5. 在 **Authentication > URL Configuration** 设置：
   - Site URL：`https://<你的用户名>.github.io/intergenerational-question-wall/`
   - Redirect URL：`https://<你的用户名>.github.io/intergenerational-question-wall/admin.html`
6. 保持 Email 登录启用，关闭公开注册。后台请求 Magic Link 时使用 `create_user: false`，所以管理员必须先存在于 Auth Users，且 UUID 位于启用的白名单中。
7. 需要日常审核但不能切换运行状态的账号，将上例角色改为 `reviewer`；只有 `owner` 可修改暂停投稿、只读和紧急关闭。
8. 在 Table Editor 中确认业务表、控制表、`photo_notes`、公开视图、`moderator_accounts` 和 `moderation_actions` 已创建；在 Storage 中确认 `photo-note-staging` 为私有桶、`photo-note-public` 为公开桶。
9. 部署 `photo-note-media` Edge Function，保持 JWT 校验开启，并必须设置 `PHOTO_NOTE_ALLOWED_ORIGINS`。未配置、请求缺少 Origin 或来源不在列表中时，函数会失败关闭。正式 GitHub Pages 的 origin 只包含协议和主机，例如 `https://gdz7274.github.io`，不包含仓库路径；需要本地验收时可逗号分隔追加 `http://127.0.0.1:4173`。
10. 按 [`supabase/README.md`](../supabase/README.md) 验证权限、RPC、统一 `wall_notes` 投影和媒体边界。

前台不启用 Supabase Anonymous Sign-Ins。浏览器使用公共 key 读取脱敏视图，并调用 `SECURITY DEFINER` 公共 RPC 写入；schema v4 已撤销 `anon` 和 `authenticated` 对业务底表、照片表和待审媒体的直接访问。管理员登录使用 `authenticated` 角色，但管理 RPC 和媒体函数还会检查 UUID 白名单。

数据库已提供基础频率限制和常见联系方式过滤，但公共 key 仍无法识别真实用户。会话 ID 可被伪造，共享网络也可能共用网络额度；这些措施不能替代验证码、WAF、可靠身份、撤回或个人数据权限。正式运营前必须补齐服务端风控与未成年人治理。不要在网页、GitHub 仓库或 Actions 变量中使用 `service_role` key。

## 2. 创建 GitHub 仓库

在个人 GitHub 账号中新建一个空仓库，例如 `intergenerational-question-wall`。不要勾选自动创建 README、`.gitignore` 或 License。

本项目当前位于一个包含其他文件的上层工作区中，发布时应只把 `intergenerational-question-wall/` 建成独立仓库，避免将上层目录一并上传：

```bash
cd "/Users/gdz/Documents/New project 2/intergenerational-question-wall"
git init
git add .
git commit -m "Initial question wall experience"
git branch -M main
git remote add origin https://github.com/<你的用户名>/intergenerational-question-wall.git
git push -u origin main
```

## 3. 配置 GitHub Actions 变量

打开仓库的 **Settings > Secrets and variables > Actions > Variables**，创建以下 Repository variables：

| 变量 | 是否必填 | 值 |
| --- | --- | --- |
| `SUPABASE_URL` | 是 | Supabase Project URL |
| `SUPABASE_ANON_KEY` | 是 | Supabase Publishable key 或旧版 anon public key |

生产部署固定使用审核模式，不提供跳过审核的开关。Pages 支持渐进发布：只要数据库返回 `schemaVersion: 3`、`hardeningVersion: 1`、`submissionsRequireReview: true`，文字问答前台即可发布；此路径会自动隐藏照片采集/审核后台入口，并跳过照片投影与媒体函数 CORS 探针。它不启用任何照片能力。

要启用照片能力，必须完成完整 schema v4：数据库还必须返回 `photoNotesEnabled: true`、`photoUploadMode: moderator_only` 和 `photoMediaServiceBoundaryVersion: 1`。Pages 只有在该 v4 条件成立时才执行 `wall_notes` 照片列和 `photo-note-media` 对 Pages origin 的 CORS 预检。schema v4 的正式后端发布仍必须顺序执行 `0005_photo_notes.sql`、`0006_photo_media_service_boundary.sql` 并部署 `photo-note-media` Edge Function；不能以跳过探针或仅推送前台的方式部分启用照片功能。

`SUPABASE_ANON_KEY` 虽然放在 GitHub Variables 中，但部署后仍会出现在浏览器可读取的 `config.js` 里。这是 Supabase 公共前端密钥的正常用法，不代表它可以绕过 RLS。

### 可选：受保护的 Supabase 自动发布

仓库中的 `Release Supabase schema and photo media function` 工作流支持手动预检/部署，也会在推送唯一 `supabase-v*` 标签时固定执行部署；两条路径都绑定 `supabase-production` Environment。建议为该 Environment 配置 required reviewers，避免普通 push 修改生产数据库。标签只是触发方式，不是授权边界：未获 Environment 审批的标签发布不能写入生产数据库。除上表两项外，还要配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Variable（可选） | `SUPABASE_PROJECT_REF` | 20 位项目 ref；未填时由 `SUPABASE_URL` 的主机名推导 |
| Variable（可选） | `PHOTO_NOTE_ALLOWED_ORIGINS` | 允许调用媒体函数的网页 origin；未填时使用仓库所有者的 GitHub Pages origin |
| Secret | `SUPABASE_ACCESS_TOKEN` | 仅供 Supabase CLI 发布，不进入前端 artifact |
| Secret | `SUPABASE_DB_PASSWORD` | 仅供迁移连接，不进入前端 artifact |

先以 `mode=preflight` 运行，检查 CLI 显示的远端迁移历史和 `db push --dry-run`。手动 `mode=deploy` 仍要求确认 `migration_history_confirmed`；而 `supabase-v*` 标签固定为 deploy，不读取这个复选项，但无论哪种路径，dry run 一旦显示会重放任一 `0001` 至 `0004` 迁移都会强制失败。早期通过 SQL Editor 手工执行的迁移通常不会自动进入 Supabase CLI 的迁移历史；应先备份数据库，并按 Supabase 官方 migration repair 流程核对、补齐历史，不能仅依赖勾选确认。

推荐顺序是：在功能分支完成并提交迁移、Edge Function 与前端改动；先推送该功能分支，再从同一提交创建并推送一个未重复使用的 `supabase-v*` 标签。标签工作流先 dry run、拒绝旧迁移重放，再应用待执行迁移、设置函数 origin、部署 `photo-note-media`、验证完整 schema v4、公开照片投影和函数 CORS；成功并通过 Environment 审批后，才合并或推送 `main` 触发 Pages。仅发布文字问答时，可以保留在 schema v3 + hardening 基线并直接发布 Pages；一旦计划启用照片，必须走前述完整 v4 后端发布。preflight 不写远端数据；deploy 属于生产写入，必须经过 Environment 审批。不要把已用于生产的标签移动到其他提交。

## 4. 启用并发布 Pages

1. 打开仓库的 **Settings > Pages**。
2. 在 **Build and deployment** 中将 **Source** 设为 **GitHub Actions**。
3. 推送 `main` 分支，或在 **Actions** 页面手动运行 `Deploy prototype to GitHub Pages`。
4. 等待工作流完成后访问：

   ```text
   https://<你的用户名>.github.io/intergenerational-question-wall/
   ```

工作流会运行 `app.js`、`backend.js`、`admin.js` 的语法检查和 `tests/*.test.mjs`，核对关键资源、v4 迁移与 Edge Function 媒体动作契约，再验证远端审核基线。审核基线为 schema v3 + `hardeningVersion: 1` + `submissionsRequireReview: true`，通过后可发布文字问答前台；在此模式下照片后台会根据缺少的照片摘要字段自动隐藏，且不执行照片投影或函数 CORS 探针。若远端为完整 schema v4，工作流会额外验证照片投影和函数 CORS 后才启用照片能力。随后复制 `prototype/` 到临时发布目录，并用仓库变量生成仅用于线上 artifact 的 `config.js`。仓库中的 `prototype/config.js` 会继续保留空配置，方便本地演示，也避免把项目地址硬编码进源码。缺少变量、URL 不是托管 Supabase HTTPS 地址、审核基线不兼容，或完整 v4 的照片探针失败时，工作流会主动失败。Pages 回滚不会回滚数据库、Storage 或 Edge Function。

当前公开页缓存版本为 `styles.css?v=24`、`app.js?v=25`、`backend.js?v=5`、`config.js?v=4`，后台为 `admin.css?v=6`、`admin.js?v=8`。Lucide 1.8.0 从 `prototype/vendor/lucide.min.js` 自托管。公开页和后台的 CSP 必须允许连接 Supabase API/Edge Function，并允许从受信 Supabase Storage 主机加载已发布照片；公开分享与后台采集的本地预览还需要 `blob:` 图片源。更新这些文件时应同步递增对应查询参数，避免手机端继续命中旧缓存。

以后每次向 `main` 推送都会自动更新网站。由于浏览器和 CDN 可能缓存静态资源，发布后应在手机上重新打开页面或执行一次强制刷新。

## 5. 移动端验收

至少使用两台设备或两个独立浏览器会话验证：

1. 设备 A 选择身份并提交问题，立即另存提交成功返回的恢复码。
2. 确认新问题没有立即出现在问题池；管理员从 `admin.html` 批准后才出现。
3. 设备 B 选择相反身份并提交回答，确认回答没有立即出现在墙上；管理员先驳回并填写反馈。
4. 设备 B 刷新“我的”，确认反馈可见；修改并重投后版本加一，再由管理员批准，确认便签进入公开墙。
5. 在独立浏览器中导入第 1 步恢复码，确认可以恢复问题正文、状态和最近事件；不要在截图或日志中暴露真实恢复码。
6. 提交一次举报，在后台执行“下架并解决”，确认便签从墙上消失且操作记录包含回答和举报两条日志。
7. 分别验证暂停投稿、只读和紧急关闭下的公开墙、问题池、投稿、举报与状态查询，结果应符合 [`supabase/README.md`](../supabase/README.md#运营开关) 的矩阵。
8. 使用 `reviewer` 验证可以审核但不能修改运行状态；使用 `owner` 修改状态后确认日志记录了设置前后值。
9. 使用未加入白名单的 Supabase 用户登录，确认无法读取或执行任何管理 RPC。
10. 清除设备 A 的站点数据，确认“我的”和已看记录会重置；只有事先另存的恢复码可以重新导入投稿。
11. 使用管理员手机拍摄一张测试便签，确认浏览器完成压缩和隐私重编码、私有预览可见，但 `pending` 状态不会出现在公开墙或公开桶 URL 中。
12. 批准测试照片，确认它以 `kind=photo` 进入单张滑动墙，图片、转写与无障碍描述正确；隐藏后确认已打开的墙面会自动移除，并检查公开对象清理结果。可在测试环境模拟一次删除失败，确认隐藏列表出现“重试清理公开图片”且重试成功后入口消失。
13. 使用未加入白名单的登录账号和匿名窗口，确认不能创建上传地址、读取私有预览或直接写入两个媒体桶。
14. 查看浏览器控制台和 Actions 日志，确认没有 RLS、跨域、契约测试、Edge Function 或静态资源 404 错误。

## 发布前检查

- 在 Supabase 中确认 RLS 已开启，并以公共 key 实测不能读取底层表、待审核内容、作者标识或后台字段。
- 为问题、回答和举报保留长度限制、枚举约束、频率限制与内容审核；浏览器生成的会话 ID 不是登录凭证，更不是监护人身份验证。
- 定期复核管理员白名单、操作日志和 Supabase 备份策略；日常审核不要绕过后台直接改表，否则不会留下完整日志。
- 确认 `prototype/vendor/lucide.min.js` 随静态站点发布，CSP 下没有被拦截的脚本、样式、图片或 Supabase 请求。
- 确认便签图、背景图、字体和其他素材允许公开使用。
- 主要服务中国大陆用户时，需评估 GitHub Pages 与 Supabase 的访问稳定性、域名备案及未成年人个人信息合规。

## 自定义域名（可选）

可以在 **Settings > Pages > Custom domain** 中填写已持有的域名，并按 GitHub 给出的提示配置 DNS。启用后保留 **Enforce HTTPS**。自定义域名不会改变 Supabase 的安全要求。

切换自定义域名后，还必须把新域名对应的 `/admin.html` 加到 Supabase **Authentication > URL Configuration > Redirect URLs**；否则管理员 Magic Link 无法返回后台。
