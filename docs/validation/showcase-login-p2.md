# P2 登录官方精选本地验证

日期：2026-11-15。任务：server #263 / web #266。基线 `270a6ef34fff29df873abe5d908c1cad48faaa96`，worktree `art-showcase-web`，分支 `feat/art-showcase-web`。

## 范围与行为

- 仅登录页启用。桌面最多展示前两项，手机展示其中首张可用图；每张有 `AI生成` 标签。图片成功加载前保留原插画，空、列表失败、图片错误均回到原布局，不插入加载提示或改变登录表单。
- 只接收公开 DTO 五个字段。图片必须精确匹配 `/api/public/creations/showcases/{id}/image`，拒绝远程 URL、私人媒体路径、查询、片段与路径穿越。
- 复用 platformRequest，匿名选项仅允许精确 GET `/api/public/creations/showcases`；省略 cookie、不触发账号检查或登录跳转。所有既有受保护请求保留账号 epoch、CSRF、401 和账号冲突处理。
- 每次挂载立即尝试一次。为移除已打开页面中的下架素材，可见页每 60 秒检查列表，回到前台也尝试刷新；同一组件所有入口共用 60 秒节流，最多一次在途请求，隐藏时跳过。请求最多等待 5 秒。卸载标记失效、清除 interval 与事件监听，晚响应不更新响应式数据。已展示图片不是即时撤回；当前页最多等待下一次列表检查，其他人保存的文件不在可撤回范围。

## 已执行

- `npm test`：296/296 通过，新增 7 项覆盖空与非法 DTO、路径限制、字段裁剪、匿名请求凭据/账号保护/401/白名单/超时；31 项相关请求层测试包含在全量中。
- `CLOSET_POSE_OFFLINE=1 npm run build`：通过，包含 vue-tsc。已有 pose 权重从原前端复制，setup 脚本 SHA256 验证通过，没有下载模型。仅构建本 worktree 的 dist，未运行 build:server。现有大型 chunk 提示仍在。
- `semgrep scan --config p/typescript --config p/secrets --error ...`：6 个实现文件，110 条实际运行规则，0 发现；本次不是全仓依赖审计。报告在 `.local/showcase-semgrep.json`。
- `git diff --check`：通过。

## Ego 实际浏览器

用 `npm run dev:showcase-fixture` 在 `127.0.0.1:5186` 提供全部本地接口和合成 PNG，不访问真实账户、私人作品或模型。截图内均明确标作本地示意，不证明艺术效果。

- 1440×900 浅色：两个完整图片、标题、说明与生成标签，登录表单独立；无横向溢出。
- 390×844 深色：仅一张可用图，无横向溢出；登录按钮在首屏。背景实测 rgb(22,22,22)。键盘从用户名 Tab 到密码；减少动态效果时 auth-sheet animationName=none。
- empty、503、401、全部图片 404：精选隐藏、原插画恢复，输入保留；各状态实际提交错误登录均显示“账号或密码不正确”，仍在 /login。
- slow：列表尚未返回时登录可提交；注册页面可从账号继续到密码，无精选区。
- 十次 focus 事件：请求计数 24→24。将本地时钟模拟经过 61 秒后更改为 retired 并触发 focus：精选隐藏，表单仍在。
- slow 响应期间跳到注册，6 秒后精选不回填，额外十次 focus 前后请求计数 26→26，注册仍可用。

截图（本机忽略目录）：

- `/Users/yaopinxin/project/art-showcase-web/.local/showcase-desktop.png`
- `/Users/yaopinxin/project/art-showcase-web/.local/showcase-mobile-dark.png`

移动截图为稳定暗色。桌面末次重拍紧接深色切回浅色，Ant 控件仍有配色过渡，布局与两图可确认；最初稳定浅色页面已实际观察，展示型桌面截图如需使用应静态重拍。

## 限制与清理

尚未对实际后端的发布/下架资源联调，未验证真实艺术素材效果，未 push、创建 PR、运行 CI、部署或调用付费模型。由父代理做最终集成验收。fixture 与 Ego task space 在交付前关闭；5186 不保留监听。node_modules 仅为本地复用软链接，不纳入提交。
