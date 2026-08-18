# GitHub Pages + Supabase 部署

当前线上版采用以下结构：

```text
手机浏览器 -> GitHub Pages 前台 -> Supabase REST API -> PostgreSQL + RLS
管理员浏览器 -> GitHub Pages /admin.html -> Supabase Auth + 审核 RPC
```

GitHub Pages 负责发布 `prototype/` 中的静态文件；Supabase 负责数据、管理员登录、审核权限和操作日志。浏览器只持有公开 publishable key，管理员操作使用登录后的短期 JWT；任何页面都不包含 `service_role` key。

## 当前能力边界

已接入 Supabase 的共享能力：

- 读取已发布问答墙和开放的问题池。
- 提交问题、回答和举报；新投稿默认进入待审核状态。
- 数据库通过状态字段和公开视图控制哪些内容出现在前台。
- 管理员在 `admin.html` 审核问题与回答、处置举报、管理公开内容并查看操作记录。

仍保存在当前浏览器的内容：

- “大人 / 小朋友”身份选择、匿名会话 ID。
- 草稿、收藏、近期已看记录和推荐去重。
- “我的提问 / 我的回答”的本机副本和站内提示。

因此当前版本可用于邀请用户进行带人工审核的手机端测试，但尚未提供跨设备个人记录同步或监护人账号。清除浏览器站点数据后，本机记录会丢失，但已经成功提交到 Supabase 的内容不会丢失。

## 1. 准备 Supabase

1. 在 [Supabase](https://supabase.com/) 新建项目，并妥善保存数据库密码。
2. 在项目的 **SQL Editor** 中依次运行 [`supabase/migrations/0001_experience.sql`](../supabase/migrations/0001_experience.sql) 和 [`supabase/migrations/0002_moderation.sql`](../supabase/migrations/0002_moderation.sql)。不要颠倒顺序。
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
6. 保持 Email 登录启用，关闭公开注册。管理员从后台输入白名单邮箱并使用一次性 Magic Link 登录。
7. 在 Table Editor 中确认业务表、公开视图、`moderator_accounts` 和 `moderation_actions` 已创建，再按 `supabase/README.md` 的检查步骤验证权限。

前台不启用 Supabase Anonymous Sign-Ins。浏览器直接使用公共 key 写入，数据库只向 `anon` 角色开放受 RLS、约束和触发器限制的插入权限；底层表不向 `anon` 开放读取，公开内容只通过脱敏视图返回。管理员登录使用 `authenticated` 角色，但管理 RPC 还会检查 UUID 白名单。

这个边界能支持小范围手机体验，但公共 key 无法识别真实用户，也不能独立提供可靠的防刷、频率限制、撤回或个人数据权限。正式运营前必须升级为经过验证的用户身份或受控服务端 API。不要在网页、GitHub 仓库或 Actions 变量中使用 `service_role` key。

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

生产部署固定使用审核模式，不再提供跳过审核的开关。必须先执行 `0002_moderation.sql`；部署任务会调用公开的 `moderation_status` 探针，只有数据库返回兼容的审核版本才会继续发布。这样问题审核通过后才进入问题池，回答审核通过后才生成公开便签。

`SUPABASE_ANON_KEY` 虽然放在 GitHub Variables 中，但部署后仍会出现在浏览器可读取的 `config.js` 里。这是 Supabase 公共前端密钥的正常用法，不代表它可以绕过 RLS。

## 4. 启用并发布 Pages

1. 打开仓库的 **Settings > Pages**。
2. 在 **Build and deployment** 中将 **Source** 设为 **GitHub Actions**。
3. 推送 `main` 分支，或在 **Actions** 页面手动运行 `Deploy prototype to GitHub Pages`。
4. 等待工作流完成后访问：

   ```text
   https://<你的用户名>.github.io/intergenerational-question-wall/
   ```

工作流会先检查 JavaScript 和关键资源、验证远端审核数据库版本，再复制 `prototype/` 到临时发布目录，并用仓库变量生成仅用于线上 artifact 的 `config.js`。仓库中的 `prototype/config.js` 会继续保留空配置，方便本地演示，也避免把某个 Supabase 项目地址硬编码进源码。缺少两个必填变量、URL 不是 HTTPS 或审核迁移未执行时，工作流会主动失败。

以后每次向 `main` 推送都会自动更新网站。由于浏览器和 CDN 可能缓存静态资源，发布后应在手机上重新打开页面或执行一次强制刷新。

## 5. 移动端验收

至少使用两台设备或两个独立浏览器会话验证：

1. 设备 A 选择身份并提交问题。
2. 确认新问题没有立即出现在问题池；管理员从 `admin.html` 批准后才出现。
3. 设备 B 选择相反身份并提交回答，确认回答没有立即出现在墙上；管理员批准后才出现。
4. 提交一次举报，在后台执行“下架并解决”，确认便签从墙上消失且操作记录包含回答和举报两条日志。
5. 使用未加入白名单的 Supabase 用户登录，确认无法读取或执行任何管理 RPC。
6. 清除设备 A 的站点数据，确认本机“我的”和已看记录会重置，而共享投稿仍存在。
7. 查看浏览器控制台和 Actions 日志，确认没有 RLS、跨域或静态资源 404 错误。

## 发布前检查

- 在 Supabase 中确认 RLS 已开启，并以公共 key 实测不能读取底层表、待审核内容、作者标识或后台字段。
- 为问题、回答和举报保留长度限制、枚举约束、频率限制与内容审核；浏览器生成的会话 ID 不是登录凭证，更不是监护人身份验证。
- 定期复核管理员白名单、操作日志和 Supabase 备份策略；日常审核不要绕过后台直接改表，否则不会留下完整日志。
- 当前页面从 `unpkg.com` 加载图标，在部分网络环境中可能较慢；公开测试前建议改为项目内资源。
- 确认便签图、背景图、字体和其他素材允许公开使用。
- 主要服务中国大陆用户时，需评估 GitHub Pages 与 Supabase 的访问稳定性、域名备案及未成年人个人信息合规。

## 自定义域名（可选）

可以在 **Settings > Pages > Custom domain** 中填写已持有的域名，并按 GitHub 给出的提示配置 DNS。启用后保留 **Enforce HTTPS**。自定义域名不会改变 Supabase 的安全要求。

切换自定义域名后，还必须把新域名对应的 `/admin.html` 加到 Supabase **Authentication > URL Configuration > Redirect URLs**；否则管理员 Magic Link 无法返回后台。
