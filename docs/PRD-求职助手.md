# 求职助手 App · 产品需求文档（PRD）

| 项目 | 内容 |
|------|------|
| 文档版本 | v1.0 |
| 日期 | 2026-10-10 |
| 状态 | 已评审冻结（技术选型与范围已确认） |
| 阅读对象 | 开发（Trae）、测试、产品 |

---

## 1. 项目背景与目标

### 1.1 背景
求职者普遍存在三个痛点：投递简历后石沉大海、多公司多岗位进度难以追踪、面试准备缺乏针对性。大模型技术使"逐岗位定制简历 + 定向面试题准备"成为可能。

### 1.2 目标
- **北极星**：提升用户"投递 → 面试 → Offer"转化率
- V1 可衡量指标：单个用户平均生成 ≥ 5 份定向优化简历；面试题标记"已掌握"率 ≥ 60%
- 非目标（V1 不做）：内推社区、简历托管投递、移动端原生 App、社交分享

### 1.3 范围总览

| 优先级 | 模块 | 说明 |
|--------|------|------|
| P0 | 用户登录 | 邮箱+密码，JWT 会话 |
| P0 | 简历中心 | 上传解析 / 文本编辑 / 版本管理 |
| P0 | 简历优化 | 简历 + JD → AI 优化建议 + 改写全文 |
| P0 | 求职进度 | 岗位 CRUD、状态流转、时间线 |
| P0 | 面试题生成 | JD + 简历 → 分类题库 + 参考答案 |
| P0 | 仪表盘 | 统计卡、漏斗、本周动态 |
| P1 | AI 模拟面试对话 | 多轮追问 + 评分 |
| P1 | 通知提醒 | 面试前一天提醒、投递无反馈提醒 |
| P1 | 数据导出 | JSON 备份 |
| P2 | PWA 离线、周报、多简历对比 | — |

---

## 2. 用户画像与用户故事

**目标用户**：1–5 年经验的互联网从业者，活跃投递期同时跟进 5–15 个岗位。

| 编号 | 用户故事 | 验收要点 |
|------|----------|----------|
| US-1 | 作为求职者，我想上传现有简历并自动转为文本，以便快速建立档案 | PDF/DOCX 解析为可编辑文本 |
| US-2 | 作为求职者，我想针对某个 JD 优化简历，以便提高过筛率 | 产出优化点说明 + 改写全文，可保存版本 |
| US-3 | 作为求职者，我想看所有投递的岗位按状态分布，以便知道下一步该做什么 | 看板视图 + 拖拽流转 |
| US-4 | 作为求职者，我想记录每个岗位的面试进展，以便复盘和跟进 | 时间线 + 事件备注 |
| US-5 | 作为求职者，我想基于 JD 和简历生成面试题，以便针对性准备 | 三类题目 + 参考答案 + 掌握标记 |
| US-6 | 作为用户，我想用自己的 API Key，以便控制 AI 成本 | 设置页配置，消耗可见 |

---

## 3. 功能需求详述（P0）

### 3.1 用户登录（MVP）

**描述**：邮箱 + 密码注册/登录，JWT 会话保持。

**交互流程**：
1. `/login` 页提供「登录 / 注册」两个 Tab
2. 注册：邮箱、密码（≥8 位，含字母和数字）、确认密码；前端先做格式校验，后端二次校验并检查邮箱唯一性
3. 登录成功 → 签发 JWT（httpOnly cookie，7 天）→ 跳转 `/dashboard`
4. 未登录访问受保护路由 → 重定向 `/login`
5. 找回密码：V1.1 排期

**验收标准**：
- 正确凭据登录成功，错误凭据返回明确错误信息（不区分"用户不存在/密码错误"，防枚举）
- 密码使用 bcrypt(cost=10) 哈希存储
- 刷新页面会话保持；登出后 cookie 清除

### 3.2 简历中心

**描述**：管理基础简历（1 份正文 + N 个定向优化版本）。

| 功能 | 说明 | 验收标准 |
|------|------|----------|
| 上传解析 | PDF/DOCX 上传，后端 pdf-parse/mammoth 解析为纯文本回填编辑器 | 常见单栏排版解析正确；失败给出明确提示且不影响原内容 |
| 文本编辑 | 标题 + 正文（纯文本，保留换行） | 保存后再次进入内容一致 |
| 版本列表 | 每个简历展示优化版本数与最近更新时间 | 版本数与实际记录一致 |
| 默认简历 | 一个用户仅一份默认简历 | 设置默认后原默认自动取消 |
| 版本历史 | 时间线展示：版本名、JD 快照、建议条数、创建时间 | 与优化工作台保存的数据一致 |

**约束**：简历正文 ≤ 20,000 字符；上传文件 ≤ 5MB，仅允许 .pdf/.docx（MIME 双重校验）。

### 3.3 简历优化（核心卖点）

**描述**：选择简历 + 粘贴/关联 JD → 调用 Kimi API → 输出「优化点说明 + 改写后全文」，可编辑、保存为新版本、导出 Markdown。

**交互流程**：
1. 进入 `/optimize`，顶部选择简历（默认选中默认简历）
2. 左侧：简历原文（可编辑）+ JD 输入区（可从已建岗位关联带入，也可手动粘贴）
3. 点击「生成优化」→ 按钮 loading（防重复提交）→ 后端异步调用 Kimi → 返回结构化结果
4. 右侧：优化点卡片（逐条）+ 改写全文（可编辑）
5. 「保存为新版本」：最终文本 + JD 快照 + 优化建议落库，版本历史可见
6. 「导出 Markdown」：前端下载 .md 文件

**AI 输出契约（JSON）**：
```json
{
  "suggestions": ["string，逐条优化说明"],
  "optimized_content": "string，完整改写后的简历文本"
}
```
后端校验 JSON 合法性，非法/超时返回明确错误可重试。

**异常处理**：
- API Key 未配置/失效 → 引导设置页
- Kimi 超时（>60s）→ 返回"生成超时，请重试"
- 输入为空 → 前端拦截

**验收标准**：
- 完整走通：选择简历 → 输入 JD → 生成 → 编辑 → 保存版本 → 历史可见 → 导出一致
- 生成过程页面可正常交互（非全局阻塞）
- 同一简历多版本互不覆盖
### 3.4 求职进度

**描述**：以看板 + 时间线双视图管理投递全流程。

**状态机**（默认单向流转，任意阶段可进入"已结束"）：
```
意向 → 已投递 → 笔试中 → 面试中 → Offer
                          ↘ 已结束（终态，需二次确认）
```
- "面试中"内部不分轮次，轮次由时间线事件表达（一面/二面/HR面均为事件类型）

**功能点**：

| 功能 | 说明 |
|------|------|
| 岗位 CRUD | 公司*、岗位*、薪资、城市、JD、投递渠道；删除二次确认 |
| 看板 | 6 列（意向/已投递/笔试中/面试中/Offer/已结束），卡片拖拽换列，列内按更新时间排序 |
| 详情页 | 头部信息 + 流程时间线（倒序，最新高亮）+ JD 面板 + 快捷操作 |
| 事件记录 | 类型（投递/笔试/一面/二面/HR面/Offer/终止）+ 日期 + 备注；事件可增删 |
| 关联跳转 | 详情页可直接跳转「用这份 JD 优化简历」「生成面试题」并自动带入 |

**验收标准**：
- 拖拽换列即时生效并持久化；刷新后状态不变
- 时间线按日期倒序展示，备注完整显示
- 从详情页跳转优化/面试题时，JD 自动带入对应输入框

### 3.5 面试题生成

**描述**：基于岗位 JD + 简历生成定向面试题，分类练习。

**AI 输出契约（JSON）**：
```json
{
  "questions": [
    {
      "category": "tech | project | behavior",
      "question": "string",
      "answer": "string，参考答案",
      "key_points": ["string，考察点"]
    }
  ]
}
```
默认每次生成 9 题（每类 3 题）；「重新生成」整批替换并二次确认。

**功能点**：

| 功能 | 说明 |
|------|------|
| 题库生成 | 选择岗位（仅非"已结束/意向"可选）→ 生成 → 分类 Tab 展示 |
| 练习 | 题目卡片展开显示参考答案；点击圆圈标记"已掌握"（持久化） |
| 掌握度 | 顶部进度：已掌握 / 总题数 |
| 岗位关联 | 题目挂在岗位下，换岗位即换题库 |

**验收标准**：生成结果按三类正确分组；掌握标记刷新后保持；生成失败可重试且不产生脏数据。

### 3.6 首页仪表盘

**内容**：
- 4 统计卡：累计投递、面试中、本周面试（含最近一场时间）、Offer 数
- 投递转化漏斗：意向 → 已投递 → 笔试 → 面试 → Offer（同源数据计算）
- 进行中的流程：面试中/笔试中岗位列表，点击进详情
- 本周动态：本周发生的事件流水

**验收标准**：所有数字与求职进度数据实时一致（后端聚合，前端不独立计算口径）。

### 3.7 设置

- AI 配置：Kimi API Key（密码输入可显隐）、模型选择、本月消耗统计、测试连接
- 账号：昵称修改、邮箱只读、找回密码入口
- 通知偏好（V1 仅持久化开关，不触发实际通知）
- 数据导出（V1.1）

---

## 4. 非功能需求

| 类别 | 要求 |
|------|------|
| 性能 | 首屏 < 2s；AI 接口超时阈值 60s；看板交互响应 < 100ms |
| 安全 | bcrypt 密码哈希；JWT httpOnly cookie + SameSite=Lax；参数化查询；上传白名单；API Key 仅存服务端 |
| 隐私 | 简历/JD 仅服务端内存处理，不落第三方日志；AI 调用走 HTTPS |
| 成本 | 单次优化 3K–5K tokens，面试题 4K–6K tokens；ai_calls 逐笔记录，设置页月度展示 |
| 可用性 | Chrome/Edge 最近两个大版本；最小宽度 1280px |
| 兼容性 | SQLite（开发）/ PostgreSQL（生产）经 Prisma 无感切换 |

---

## 5. 信息架构

```
/login                    登录/注册
/dashboard                首页仪表盘
/resume                   简历列表
/resume/:id               简历编辑 + 版本历史
/optimize                 AI 优化工作台（?resume=id&job=id 深链带入）
/jobs                     求职看板
/jobs/:id                 岗位详情（时间线）
/interview                面试题练习（?job=id 深链带入）
/settings                 设置
```

全局布局：左侧边栏导航（含用户卡片）、顶栏（全局搜索、AI 状态、通知、退出）、内容区。

---

## 6. 数据库设计

```
users
  id            String   PK
  email         String   @unique
  password_hash String
  nickname      String   @default("求职者")
  created_at    DateTime @default(now())

resumes
  id            String   PK
  user_id       String   FK → users.id
  title         String
  content       String               // 纯文本正文
  source_file   String?
  is_default    Boolean  @default(false)
  created_at / updated_at DateTime

resume_versions
  id                String PK
  resume_id         String FK → resumes.id（级联删除）
  label             String             // 如"字节电商 · 优化版"
  jd_snapshot       String             // 生成时 JD 快照
  optimized_content String
  suggestions       Json               // 优化点数组
  created_at        DateTime

jobs
  id          String PK
  user_id     String FK → users.id
  company / position  String
  salary / city / source String?
  jd_text     String?  @db.Text
  status      String   // wish|applied|written|interviewing|offer|ended
  created_at / updated_at DateTime

job_events
  id         String PK
  job_id     String FK → jobs.id（级联删除）
  type       String   // 投递|笔试|一面|二面|HR面|Offer|终止
  event_date DateTime
  note       String?
  created_at DateTime

interview_qa
  id         String PK
  job_id     String FK → jobs.id（级联删除）
  category   String   // tech|project|behavior
  question / answer  String @db.Text
  key_points Json
  mastered   Boolean  @default(false)
  created_at DateTime

ai_calls
  id         String PK
  user_id    String FK
  scene      String   // optimize|interview
  tokens_in / tokens_out Int
  cost       Decimal?
  status     String   // ok|failed
  created_at DateTime
```

索引：jobs(user_id, status)、job_events(job_id, event_date)、interview_qa(job_id)、ai_calls(user_id, created_at)。
---

## 7. API 设计（REST，统一前缀 /api）

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/register | 注册，设置 cookie |
| POST | /auth/login | 登录 |
| POST | /auth/logout | 登出，清除 cookie |
| GET | /auth/me | 当前用户 |

### 简历
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /resumes | 列表（含版本数） |
| POST | /resumes | 新建 |
| GET | /resumes/:id | 详情 + 版本历史 |
| PUT | /resumes/:id | 更新标题/正文 |
| DELETE | /resumes/:id | 删除（级联版本） |
| POST | /resumes/:id/upload | multipart 上传，返回解析文本 |
| POST | /resumes/:id/versions | 保存优化版本 |

### AI
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /ai/optimize | {resume_id, jd_text} → 异步任务返回 task_id；GET /ai/tasks/:id 轮询 |
| POST | /ai/interview-questions | {job_id, resume_id} → 整批生成并落库，返回题目 |

### 求职进度
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /jobs | 列表（可按 status 过滤） |
| POST | /jobs | 新建 |
| GET | /jobs/:id | 详情 + 事件时间线 |
| PUT | /jobs/:id | 更新基本信息 |
| PATCH | /jobs/:id/status | {status} 流转校验 |
| DELETE | /jobs/:id | 删除（级联事件/题目） |
| POST | /jobs/:id/events | 新增事件 |
| DELETE | /events/:id | 删除事件 |

### 仪表盘 / 设置
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /stats/overview | 统计卡 + 漏斗数据 |
| PUT | /settings/ai | 保存 API Key（服务端加密） |
| POST | /settings/ai/test | 测试 Key 连通性 |

**约定**：错误统一 `{ error: { code, message } }`；401 前端跳登录；`updated_at` 服务端维护。

---

## 8. AI 集成设计（Kimi API）

### 8.1 调用封装
- 服务端单例 Client，读取环境变量 KIMI_API_KEY；用户可在设置页覆盖（user_settings 表，AES-256 加密存储）
- 模型默认 kimi-k2；temperature：优化 0.4（求稳），面试题 0.7（求发散）
- 统一超时 60s，网络错误重试 1 次；每次调用落 ai_calls

### 8.2 简历优化 Prompt（System）
```
你是资深互联网大厂面试官与技术 HR。请根据用户提供的简历原文与目标岗位 JD：
1. 找出简历与 JD 的匹配缺口，给出 3-5 条具体、可执行的优化建议（说明对应 JD 哪一条要求）；
2. 输出改写后的完整简历全文（不改变事实，不虚构经历；描述改为量化成果表述；按 JD 关键词优先级重排）。
严格输出 JSON：{"suggestions": [...], "optimized_content": "..."}，不要输出其他内容。
```

### 8.3 面试题 Prompt（System）
```
你是资深面试官。基于岗位 JD 与候选人简历，生成 9 道面试题，分为三类：
tech（技术基础与原理）、project（针对简历项目的深挖追问）、behavior（行为面试）。
每题包含参考答案（务实、可背诵）与考察点。结合候选人简历中的具体经历出题，避免通用模板题。
严格输出 JSON：{"questions": [{"category","question","answer","key_points":[...]}]}
```

### 8.4 解析与兜底
- 后端宽容解析 JSON；提取失败时截取首个 { 至末个 } 重试一次
- 二次失败 → ai_calls 标记 failed，返回可重试错误

---

## 9. 技术架构

```
┌─────────────┐   HTTPS   ┌───────────────────┐
│ React (Vite) │ ───────▶ │ Express (Node 20)  │
│ Tailwind +   │  /api/*   │ · JWT 鉴权中间件    │
│ shadcn/ui    │ ◀─────── │ · Prisma ORM       │
└─────────────┘   JSON    │ · pdf-parse/mammoth│
                          │ · Kimi API Client  │
                          └────────┬───────────┘
                                   ▼
                     SQLite(开发) / PostgreSQL(生产)
```

- 开发环境 Vite 代理 /api → localhost:4000，生产同源部署
- 目录：web/（前端）、server/（后端）、shared/（共享类型）

---

## 10. 任务拆解与里程碑

| 迭代 | 内容 | 工作量 | 里程碑产出 |
|------|------|--------|-----------|
| 0 | 脚手架 + 数据库 | 0.5 天 | 可运行空壳，Prisma 迁移完成 |
| 1 | 用户登录 | 1 天 | 注册/登录/守卫可用 |
| 2 | 简历中心 | 1.5 天 | 上传解析 + CRUD + 版本历史 |
| 3 | 简历优化 | 2 天 | Kimi 调用链路 + 工作台 |
| 4 | 求职进度 | 1.5 天 | 看板拖拽 + 时间线 |
| 5 | 面试题生成 | 1.5 天 | 题库生成 + 练习 |
| 6 | 联调收尾 | 1 天 | 仪表盘 + 部署文档 |
| 合计 | — | ≈ 9 天 | MVP 发布 |

评审点：迭代 3 结束（核心链路走通）、迭代 6 结束（MVP 验收）。

---

## 11. 验收与测试

- 单元测试（后端）：状态机流转、Prompt JSON 解析兜底、上传校验（核心逻辑覆盖 ≥ 60%）
- 接口测试：每个 API 覆盖正常 / 鉴权 / 参数非法三类用例
- 端到端走查：按 US-1 ~ US-6 逐条验收
- AI 质量抽检：优化建议不虚构经历；题目与 JD/简历相关度人工评分 ≥ 4/5

---

## 12. 风险与应对

| 风险 | 等级 | 应对 |
|------|------|------|
| PDF 复杂排版解析错乱 | 中 | 解析后进入可编辑状态人工核对；文档标注准确率边界 |
| Kimi API 峰值不稳定/超时 | 中 | 60s 超时 + 单次重试 + 明确错误提示 |
| AI 输出 JSON 格式漂移 | 中 | 宽容解析 + 正则兜底 + Prompt 强约束 + 失败落库 |
| API Key 泄露 | 高 | 仅存服务端加密存储；测试连接只返布尔；日志脱敏 |
| 长文本超出模型上下文 | 低 | 简历 2 万字符上限，超限前端拦截 |
| AI 成本失控 | 低 | ai_calls 逐笔记录 + 月度展示；生成按钮防连点 |

---

## 13. 附录：原型与文档索引

- 高保真交互原型：prototype/（React 项目，9 个页面可直接运行）
- 本文档：docs/PRD-求职助手.md
- 视觉与交互规格以原型为准，文字契约以本文档为准；冲突时以本文档为准并在评审中同步原型
