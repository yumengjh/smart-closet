# 实施记录

2026-10-14：已从当前 HEAD 为前后端分别建立 codex/realtime-tryon-poc，配对目录位于 /Users/yaopinxin/project/tryon-lab-20261014。原工作区无变更。

已核对无白边 BASE 资产、现有摄像头和构建发布脚本。采用 frontend-design 的现有品牌延续原则、karpathy-guidelines 的小范围实现和 Playwright 实际浏览器验证。

已实现：现有 BASE 素材选择、一次性 Alpha 轮廓估计、分区网格形变、WebGL 合成、前臂近似遮挡、Pose Worker、模型本地资源安装与测试页。已修正 Vue 模板内带类型箭头表达式的编译错误；typecheck 通过。
官方 Pose Lite 模型为 5777746 字节，SHA256 59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a；依赖固定 @mediapipe/tasks-vision 1.1.0。
视频样本 pose_squats.mp4 官方存储地址返回 404，已改查实际测试资源地址。独立预览初次启动缺 .local 目录，补建后启动。

2026-10-15：完成浏览器实跑并修复两个运行时问题：MediaPipe 1.1 的 module Worker 需 ES-module WASM loader；删除 WebGL 对象后不能强制 loseContext，否则同一 canvas 再启动失败。Vite 忽略本地 QA 文件，模型依赖优化已完成。

独立预览数据目录 .local/try-on-preview 创建临时 tryon 账号（密码不写本记录），复制一件实际透明短袖素材，仅该临时衣柜有新增；原 8080 服务及其数据未修改。实际 API 返回 ACTIVE，元信息 T恤、短袖，输入素材通过 Alpha 检查。

最终 89 项前端测试通过；类型检查、build:server 与后端 package 通过。10 张混合上衣轮廓 8 张可处理、2 张拒绝，尚无视觉成功率。Chromium GPU 约 10 分钟后单次读数 30/10 FPS、p95 18ms、最近帧处理 12ms。截图已目视检查；390px 无横向溢出。原衣物露边和袖子贴合仍明显。未测真实手机、热降频、电量和物理摄像头。

最终实验 JAR 已启动在 http://127.0.0.1:18084/try-on 。补齐 SPA /try-on 转发，直接访问 200；index 引用资源全部可读，实际服务的模型字节数与 SHA256 同 manifest，WASM MIME 为 application/wasm。通过实际打包页面再次运行录制视频，GPU 姿态追踪和合成成功、浏览器零错误；停止后 Worker 从 1 变 0，video 暂停、src 清除、srcObject 为 null。

原 8080 服务保持 PID 19195 且健康；原两仓库 main 的未提交变更列表保持不变。实验前端 Vite 18851 与独立 JAR 18084 留运行供查看；最初无用的 Vite 18850 已停止并确认端口释放。新改动留在实验 worktree，尚未提交或推送。

打包页面停止后再次导入同一录制视频验证成功：重新出现“正在跟随你的动作 · GPU”，无渲染器错误。预览浏览器留在打包测试页供观察；仅播放本地测试视频。

2026-10-15：按用户漏识别反馈，复现双肩可靠但髋在画面外被旧规则全拒绝。新增纯追踪状态处理：双肩 .4 起追/.3 保持，缺髋采用模板衣长，700ms 短暂丢点保留，1200ms 结果年龄上限；过期/离开/Worker 停滞后隐藏。细分状态提示，移动端允许长状态换行，未修改模型自身 .5 阈值。

93 项测试通过，build:server 与后端 package 成功。实验 JAR 重启为 PID 75444，仍为 18084 与原独立数据库；8080 仍为 PID 19195。实际提供的 6 个 index 资源与发布文件逐字节一致，TryOnPage-CI5i2Q9D.js SHA256 b43f019d970cf8bf0e0b57f1ed699ec116665512a910eee176583248c958a084。

实际打包页面重复连续视频验证：全身 14/14、半身 36/37 显示；250ms 短暂丢失 3/3 保留；离开后稳定空画面 0/5 显示；重新入镜 12/12 显示。浏览器零错误。半身截图已目视检查，衣物确实出现，但领口、袖口与原衣露边仍不自然。没有测试用户物理摄像头或手机，不承诺漏识别彻底消失。改动仍仅在实验分支且未提交/推送。

390px 视口下长“寻找人物”提示处于画面范围内，文档宽度 390px。停止后 Worker 为 0，video 暂停、src 清空、srcObject 为 null；预览留在待开启状态。

2026-10-15 原素材修正：用户指出原数据已有透明整理衣物，实际对照黑短袖、灰短袖、白色水手服原始/基础/增强/贴纸四个版本，确认 step-2.png 是正确透明整理图，原选择 BASE 错误。候选逻辑现读取并缓存原工作流，区分同为 AI_ENHANCED 的 GENERATE 与 STICKER，偏向当前展示图同流程的透明整理图。原图、旧图库与现有任务均不写入。

95 项前端测试、typecheck 与 build:server 成功。停止独立 JAR 75444，18084 改由前端 preview PID 82923 提供，/api 直接代理原 8080（PID 19195 不变），用 localhost 沿用原账号登录。真实用户 Chrome 已显示原账号和 53 件上衣，默认 T 恤和切换白色短袖都正确显示“衣柜 AI 整理图 · 无白边透明版”。截图 output/playwright/real-wardrobe-connected.png 已目视。

用户 Chrome 的扩展本地文件访问未开，扩展不能代选视频；未修改其安全权限，native 观察也遇 ScreenCaptureKit 错误。改用独立 Playwright QA 页读取三张原 step-2.png 与录制视频，分别 176/191（含首模型启动）、189/189、190/190 渲染帧有衣物，无推理/渲染错误；不是用户物理摄像头效果或成功率。已目视三张截图，原人物残留/褶皱问题修正，但极端袖子拉伸和近似遮挡仍在。停止异步 Worker 后复查为 0，视频暂停。此 QA 页使用本机路由文件，不假称其登录了真实账号；真实账号接入由 Chrome 实页验证。

新入口 http://localhost:18084/try-on；不再使用 tryon 测试账号。脚本 npm run preview:try-on 可重启，原独立数据留存。新变化仍只在实验 worktree、未提交/推送。

2026-10-15 画布优化：按用户反馈删除 640×960 竖屏采集请求，只建议宽 1280 / 30 FPS，支持时要求 resizeMode none；不指定高度或 aspectRatio。stage 随实际视频比例更新、桌面最大页宽 1680 / 控制栏 300，完整 contain 显示，新增 Ant Design Vue 全屏/退出/全屏停止。metadata/resize 事件更新尺寸；离页清理 fullscreenchange 监听。类型检查、build:server 与 diff 检查通过。

原账号真实 Chrome 摄像头实测：video 1280×720，canvas 960×540，GPU Pose 状态正常；全屏画布占可用视口（读数 1470×725，contain 保持原内容比例）。全屏停止、空闲进入/退出全屏验证；停止后视频 paused=true、src=null、videoWidth/Height=0。仅检查 DOM 尺寸/文字，没有保存实时人物图。最终截图在停止相机后拍摄。未改原 8080 进程与衣柜数据，实验预览仍是 PID 82923 / localhost:18084。

2026-10-16（Claude 接手）：两个分支已变基到最新 main（前端 c4e657f、后端 52f3b0c），原未提交成果先单独提交。第二轮贴合优化：轮廓自动锚点（肩线/腋下/袖口中心与上角）、肩线抬高与默认宽度 1.28、袖子按旋转角插值并以肩关节为轴、朝镜头缩短与下垂、长袖肘弯、侧身限幅加宽、One Euro + 画面跟随、索引网格与袖子后画、淡阴影、遮挡半径 0.09。104 项测试、vue-tsc、build:server 通过；三件真实 step-2 素材在 QA 页用真实 Pose Lite GPU 跑平举静态图与深蹲视频，无错误，截图目视。18084 预览已换新包。未测真实摄像头与手机。
