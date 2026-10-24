<div align="center">

# 鱼搭 · 数字衣柜（用户端）

**手机和桌面一起设计的数字衣柜界面：入柜、衣柜、推荐、搭台、助手、OOTD。**

![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Ant Design Vue](https://img.shields.io/badge/Ant_Design_Vue-4-1677FF?logo=antdesign&logoColor=white)
![Konva](https://img.shields.io/badge/Konva-画板-0D83CD)
![Tests](https://img.shields.io/badge/测试-107_项-success)
![License](https://img.shields.io/badge/license-源码仅供评审_·_非开源-red)

[快速开始](#快速开始) · [功能](#功能) · [构建与发布](#构建与发布) · [后端仓库](https://github.com/yumengjh/smart-closet-server) · [界面流程说明](docs/INTERACTION.md)

<img src="docs/readme/today-outfits.jpg" alt="今天穿什么" width="88%">

</div>

---

> ### ⚠️ 许可声明：源码仅供评审查看，不是开源软件
>
> 鱼搭是独立开发、计划商业化运营的 SaaS 产品。仓库开放，**只是为了让竞赛评委核验项目的真实性与 AI 协同开发过程**。
>
> | 允许（仅限评审人员） | 禁止（未经书面授权） |
> |:--|:--|
> | 阅读源码、文档与提交历史；在自己的设备上临时克隆、构建、运行和测试，用于核验与评分 | **复制、转发、Fork、镜像、公开发布；修改或二次开发；商业或生产使用；用于训练 AI 模型；提取规则、数据与设计做相似产品** |
>
> 完整条款见 [LICENSE](LICENSE)。需要其他用途，请先取得权利人书面授权。

这是鱼搭的**用户端**，需要配合后端 [smart-closet-server](https://github.com/yumengjh/smart-closet-server) 使用。后端提供接口、本地模型、推荐引擎和助手运行时；本仓库只负责界面与交互。两个仓库建议检出到相邻目录：

```text
project/
├── smart-closet          # 本仓库（用户端）
└── smart-closet-server   # 后端
```

独立运行前端的测试与构建不要求后端目录存在。

## 功能

| 模块 | 说明 |
|:--|:--|
| 账号 | 登录、凭邀请码注册、首次改密、登录设备管理、自助注销；会话失效自动回到登录 |
| 快速入柜 | 连拍上传，后台抠图与识别，处理中心统一查看任务、提醒与重试 |
| 我的衣柜 | 分页与键盘翻页、颜色精确筛选、语义搜索与以图搜图、相似衣物提示、回收站 |
| 今天穿什么 | 按天气与风格推荐，每套附依据；换一批、换一件、反馈 |
| 多画板搭台 | Konva 画板，多画板、图层、变换、导出；助手的方案落在临时画板 |
| 全局助手 | 右侧覆盖面板，可固定、拖动；流式回复，操作以浏览器回执为准 |
| 个人 OOTD | 基准人物、多模特、动作、身材调节，生成前须确认 |
| 主题与手机端 | 浅色 / 深色主题；手机底部面板、手势翻页；PWA |

## 界面一览

<table>
<tr>
<td width="50%"><img src="docs/readme/quick-intake.jpg" alt="快速入柜"><br><sub><b>快速入柜</b></sub></td>
<td width="50%"><img src="docs/readme/wardrobe.jpg" alt="我的衣柜"><br><sub><b>我的衣柜</b></sub></td>
</tr>
<tr>
<td><img src="docs/readme/rec-explain.jpg" alt="推荐依据"><br><sub><b>推荐有依据</b></sub></td>
<td><img src="docs/readme/workspace.jpg" alt="多画板搭台"><br><sub><b>多画板搭台</b></sub></td>
</tr>
<tr>
<td><img src="docs/readme/assistant.jpg" alt="全局助手"><br><sub><b>全局助手</b></sub></td>
<td><img src="docs/readme/mobile.jpg" alt="手机端"><br><sub><b>手机端</b></sub></td>
</tr>
</table>

## 快速开始

需要 Node.js 22+（本机验证使用 Node 24.18 / npm 11.16）。先启动后端（见[后端 README](https://github.com/yumengjh/smart-closet-server#快速开始)），再：

```sh
npm ci
npm run dev
```

Vite 默认把 `/api` 代理到 `127.0.0.1:8080`。登录后上传照片即可：

```mermaid
flowchart LR
    A[上传照片] --> B[服务端排队 / 识别 / 本地处理]
    B --> C[查看原图与结果]
    C --> D[选择展示图并核对信息]
    D --> E[确认入柜]
```

- 进度、模型调用和步骤耗时来自服务端；没有结果图时显示明确的等待状态。
- 只识别模式保留原图；AI 失败时保留照片，允许填写信息入柜；问题照片要求重新上传。
- 任务终态停止轮询，查询失败退避；刷新页面读取已提交任务，**不自动重试付费请求**。
- 首次登录先进入“设置新密码”；遇到 `401` 回到登录，`403 PASSWORD_CHANGE_REQUIRED` 回到密码设置。

<details>
<summary>界面演示模式（无需后端）</summary>

只有显式设置 `VITE_USE_MOCKS=true npm run dev` 才会使用浏览器示例数据。演示模式全程标注，禁止提交与重试 AI，不用定时器伪造完成状态或识别值。正常运行无需设置此变量。

</details>

## 构建与发布

| 命令 | 用途 |
|:--|:--|
| `npm run dev` | 开发服务器，代理 `/api` 到后端 |
| `npm run build:server` | 构建并发布到相邻后端的 `src/main/resources/static/`，由 Spring Boot 同源提供 |
| `npm run build:standalone` | 独立静态站点，API 地址由 `VITE_API_BASE_URL` 指定 |
| `npm run typecheck` | `vue-tsc` 类型检查 |
| `npm test` | 单元测试（Node 内置测试运行器） |
| `npm run deploy:local` | 本机一键构建并重启后端 |

**同源发布**（本机或局域网使用）：

```sh
npm run build:server
cd ../smart-closet-server && mvn spring-boot:run
```

后端 `static/assets/` 是被忽略的构建产物，干净检出必须先执行此构建再打包后端。`build:server` 固定以 `VITE_USE_MOCKS=false` 构建。局域网访问时给后端设置 `SERVER_ADDRESS=0.0.0.0`。

**独立部署**（前端静态站点 + 后端分开）：复制 `.env.example` 为 `.env.production.local`，填写公开的 `VITE_API_BASE_URL`，执行 `npm run build:standalone`，把 `dist/` 交给任意静态服务器；后端需配置 `CLOSET_CORS_ALLOWED_ORIGINS` 与 `CLOSET_COOKIE_SECURE`。详见[前后端独立部署](https://github.com/yumengjh/smart-closet-server/blob/main/docs/INDEPENDENT_DEPLOYMENT.md)。

推送 `v*` 标签时，持续集成会发布静态站点。

### 版本号

设置页导航底部显示「前端 v… · 提交号」和「服务端 v… · 提交号」，用来确认线上跑的是哪一版。

- 前端：构建时注入。打 `v*` 标签部署时用标签（`v1.2.0` 显示为 `v1.2.0`），否则用 `package.json` 的 `version`；提交号来自 CI 的 `GITHUB_SHA` 或本地 `git rev-parse`。也可用 `CLOSET_APP_VERSION`、`CLOSET_APP_COMMIT` 手动指定。
- 服务端：读公开的 `/api/health`（`version`、`commit`）；本地运行显示 `dev`。

## 目录

```text
src/
  views/          页面：登录、衣柜、录入、详情、任务、搭配、我的……
  wardrobe/       衣柜列表、筛选、翻页
  recommend/      今天穿什么、推荐卡片与依据
  outfit/         画板（Konva）、画板切换与保存
  agent/          全局助手面板与命令执行回执
  ootd/           基准人物、模特、动作、OOTD
  presets/        预设衣物库
  similar/        相似衣物与以图搜图
  notifications/  处理中心与提醒
  services/       API 封装（api.ts、platform.ts）、音效
  stores/         Pinia 状态
  domain/         与服务端对应的领域逻辑（角色分类、图片规则等）
  shell/          主布局、侧栏、手机端导航
  theme/ styles/  主题与全局样式
tests/            单元测试
docs/             界面流程、PWA、OOTD 界面设计、评审记录
```

## 测试与持续集成

```sh
npm run typecheck
npm test
npm run build
```

107 项测试覆盖工作区注册、侧栏偏好、翻页件数、OOTD 任务状态、搭配错误等。CircleCI（`.circleci/config.yml`）在每次推送与 PR 时使用 Node.js 24，在干净检出中运行 `npm ci`、测试、类型检查和关闭模拟的构建；不会调用真实 AI 或发布页面。GitHub Actions 只负责标签部署与手动检查。

后端回归在 `smart-closet-server` 执行 `mvn test`。

## 开发约定

- 所有可见交互控件统一使用 **Ant Design Vue**，不混用原生 select、checkbox、textarea、浏览器 prompt / confirm；完整约定见 [AGENTS.md](AGENTS.md)。
- 全局助手覆盖在右侧，打开、关闭、固定都不改变主布局尺寸。
- 音效走 `src/services/sound.ts` 并尊重开关；动效尊重 `prefers-reduced-motion`。
- 改界面先改本仓库源码，再用 `npm run build:server` 发布，不手工改后端的构建产物。

## 更多文档

- [页面流程与状态说明](docs/INTERACTION.md) · [PWA](docs/PWA.md) · [OOTD 模特、动作与身材调节界面](docs/2026-10-12-OOTD模特、动作与身材调节界面.md)
- [衣物入库设计](https://github.com/yumengjh/smart-closet-server/blob/main/docs/design/衣物入库最新设计.md) · [平台级鱼搭与个人 OOTD 设计](https://github.com/yumengjh/smart-closet-server/blob/main/docs/design/2026-10-06-平台级鱼搭助手与个人OOTD设计.md) · [后端运行与接口文档](https://github.com/yumengjh/smart-closet-server/blob/main/docs/CLOSET_PRODUCT.md)

## 许可

本仓库采用[鱼搭源码可见评审许可](LICENSE)：**源码仅供竞赛评审人员核验之用，不是开源软件**。未经权利人书面授权，不得复制、转发、公开发布、Fork、修改、二次开发、商业使用，或将其用于训练 AI 模型。第三方组件与预训练模型遵循各自原有的许可证。
