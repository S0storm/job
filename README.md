# 求职助手 App

面向求职者的 AI 求职管理工具：**逐岗位定制简历 + 定向面试题准备**。核心解决三个痛点——投递石沉大海、多岗位进度难追踪、面试准备缺乏针对性。

需求文档见 [docs/PRD-求职助手.md](docs/PRD-求职助手.md)（v1.0 已冻结）。

---

## 功能模块

| 模块 | 说明 |
|------|------|
| 用户登录 | 邮箱 + 密码注册/登录，JWT HttpOnly Cookie 会话（7 天） |
| 简历中心 | 1 份基础正文 + N 个定向优化版本；PDF/DOCX 上传自动解析为文本；只读查看页与版本历史回溯 |
| 简历优化 | 简历 + JD → AI 输出「优化点说明 + 改写全文」，可编辑、保存为新版本、另存为新简历、导出 Markdown |
| 求职进度 | 6 列看板（意向/已投递/笔试中/面试中/Offer/已结束），拖拽流转 + 岗位详情时间线 |
| 面试题生成 | 基于 JD + 简历生成 9 道分类面试题（技术/项目/行为），含参考答案与「已掌握」标记 |
| 仪表盘 | 统计卡 + 投递转化漏斗 + 进行中流程 + 本周动态 |
| 设置 | Kimi API Key 与模型配置（服务端加密存储）、本月消耗统计、测试连接 |

---

## 技术栈

**前端**（`web/`）
- React 19 + TypeScript + Vite 7
- Tailwind CSS v3 + shadcn/ui（Radix UI 基础组件）
- React Router 7（声明式路由 + 路由守卫）
- Recharts（漏斗/图表）、sonner（toast）

**后端**（`server/`）
- Node.js + Express 5 + TypeScript（CJS，开发用 `tsx` 直跑）
- Prisma 6 + SQLite（开发）/ PostgreSQL（生产，无需改代码）
- bcryptjs 密码哈希、jsonwebtoken 会话、multer + pdf-parse/mammoth 文件解析
- AES-256-GCM 加密存储用户级 AI 密钥

**共享**（`shared/`）
- `types.ts`：前后端共享的领域类型与 AI 输出契约，避免两处定义漂移

---

## 目录结构

```
job/
├─ docs/                  PRD 等产品文档
├─ shared/                前后端共享类型与契约
├─ server/                后端服务
│  ├─ prisma/
│  │  ├─ schema.prisma    8 张表（users/resumes/resume_versions/jobs/...）
│  │  └─ migrations/      数据库迁移
│  └─ src/
│     ├─ index.ts         启动入口
│     ├─ app.ts           Express 应用装配
│     ├─ routes/          auth / resumes / ai / jobs / interview / stats / settings
│     ├─ lib/             kimi 客户端、加密、上传解析、AI 任务队列
│     └─ middleware/      requireAuth 鉴权
└─ web/                   前端应用
   └─ src/
      ├─ pages/           Login / Dashboard / ResumeList / ResumeEdit / ResumeView / Optimize / JobsBoard / JobDetail / Interview / Settings
      ├─ components/      AppLayout、RequireAuth、ResumeVersionDialog、ui/（shadcn 组件）
      └─ lib/             api 封装、auth、各领域请求模块
```

---

## 快速开始

### 环境要求

- Node.js 20+
- npm

### 1. 安装依赖

```bash
npm --prefix server install
npm --prefix web install
```

### 2. 配置环境变量

```bash
cp server/.env.example server/.env
```

按需修改 `server/.env`（见下方说明）。

### 3. 初始化数据库

```bash
npm --prefix server run prisma:generate
npm --prefix server run prisma:migrate
```

### 4. 启动开发服务

```bash
npm run dev:server   # 后端 → http://localhost:4000
npm run dev:web      # 前端 → http://localhost:3000
```

前端 Vite 已配置代理：`/api/*` → `http://localhost:4000`，浏览器只需访问 http://localhost:3000。

### 5. 构建

```bash
npm run build:server
npm run build:web
```

---

## 环境变量（`server/.env`）

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 数据库连接串。开发 `file:./dev.db`（SQLite）；生产改为 PostgreSQL 连接串即可 |
| `PORT` | 后端监听端口，默认 `4000` |
| `JWT_SECRET` | 会话签名密钥，**生产必须替换为强随机值** |
| `KIMI_API_KEY` | 全局 Kimi API Key（可被设置页的用户级配置覆盖，留空则需在设置页填写） |
| `KIMI_BASE_URL` | Kimi API 地址，默认 `https://api.moonshot.cn/v1` |
| `KIMI_MODEL` | 默认模型，当前为 `kimi-k2.6` |
| `SETTINGS_ENCRYPTION_KEY` | 用户级 API Key 的 AES-256-GCM 加密密钥，**生产必须替换为强随机值** |

> `.env` 与 `prisma/dev.db` 已在 `.gitignore` 中排除，不会进入版本库。

---

## API 概览

统一前缀 `/api`，错误结构统一为 `{ error: { code, message } }`。

| 分组 | 接口 |
|------|------|
| 认证 | `POST /auth/register`、`POST /auth/login`、`POST /auth/logout`、`GET /auth/me` |
| 简历 | `GET/POST /resumes`、`GET/PUT/DELETE /resumes/:id`、`POST /resumes/:id/upload`、`POST /resumes/:id/versions` |
| AI | `POST /ai/optimize`（异步任务）、`GET /ai/tasks/:id`（轮询）、`POST /ai/interview-questions` |
| 求职进度 | `GET/POST /jobs`、`GET/PUT/DELETE /jobs/:id`、`PATCH /jobs/:id/status`、`POST /jobs/:id/events`、`DELETE /events/:id` |
| 仪表盘 / 设置 | `GET /stats/overview`、`PUT /settings/ai`、`POST /settings/ai/test` |

完整契约见 [docs/PRD-求职助手.md](docs/PRD-求职助手.md) §7。

---

## 关于 AI 集成

默认使用 Moonshot（Kimi）OpenAI 兼容接口。当前默认模型 `kimi-k2.6` 为推理模型，代码中已针对性处理：

- **temperature 固定**：推理模型仅接受默认值，客户端对其省略 `temperature` 参数（其他模型仍按场景传 0.4 / 0.7）；
- **思考模式关闭**：请求中显式传 `thinking: { type: 'disabled' }`，避免思考 tokens 占用约 65% 开销；
- **超时 150s**：关闭思考后实测优化约 21–28s、面试题 9 题约 67–98s；
- **并发限制**：Moonshot 账号并发上限较低，命中 429 时按 `Retry-After` 退避并给出可读提示。

每次 AI 调用均落库 `ai_calls`（tokens 与状态），设置页按月展示消耗。

---

## 开发约定

- **单测/联调**：接口层通过临时 Node 脚本 + 真实 Cookie 走通端到端流程，验证后即删；
- **改后端需重启**进程（`tsx watch` 已开启时自动重载）；
- **Prisma 变更**：先停后端再 `prisma generate`（Windows 下引擎文件被占用会失败）。
