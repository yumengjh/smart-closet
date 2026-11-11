# 前端实现约定

- 所有可见交互控件统一使用 Ant Design Vue：按钮、输入、选择、勾选、弹层、提示、确认、上传入口等。禁止混用原生 select、checkbox、textarea、浏览器 prompt/confirm。定制样式也以组件库为基础；隐藏文件输入及画布底层机制可以保留。
- 沿用产品现有主题、间距与音效服务；不要为单个功能引入另一套控件风格。
- 深浅主题开关使用 Ant Design Vue 控件，沿用产品语义色；默认浅色，保存在当前浏览器。主题只改变界面配色，不改变穿搭画板导出图。
- 导航是底部悬浮胶囊（src/shell/dock.css，所有宽度共用），没有侧栏：今天 / 衣柜 / ＋ / 试穿 / 我的。视觉是常规 ToC：中性灰白底、黑字、黑色主按钮，蓝色只做少量强调，颜色主要来自衣服本身；按钮是小圆角矩形、无阴影，不做彩色大圆钮和衬线刊头（style.css 与 src/theme/tokens.ts 同步，文字对比度 ≥ 4.5:1）。改界面后用 docs/redesign-concepts/shots/shoot.mjs（本地、git 忽略）截图自查。依据 smart-closet-server 的 docs/design/2026-11-11-ToC改版（二）：今日封面方向与实现设计.md。
- 全局助手从右下角的“问鱼搭”悬浮表情唤起（#assistant-dock-slot，手机在胶囊上方），⌘K / Ctrl K 同样可用；默认在下方居中展开，不改变主布局；用户可切换为覆盖右侧、挤开页面的右侧停靠或可拖动的自由窗口，宽度可拖动调整。
- 聊天列表应占面板主要高度。推荐组合在聊天中紧凑显示，详细预览与操作放入 Ant Design Vue 大模态框。
- 音效使用 src/services/sound.ts，尊重已有开关；动效尊重 prefers-reduced-motion。
- 种草（smart-closet-server#197）：衣物状态 WANTED 表示网上看中、还没买。显示名一律用 src/wardrobe/wanted.ts 的 wantedLabel（用户可在界面偏好自定义），不要写死“种草”；件数、色谱只算已拥有；快速入柜的“我有这件 / 种草”切换默认“我有这件”且不跨次记忆。快速入柜页按清新改版保持少字、大留白，说明放进“？”提示，记录用图片网格与“⋯”菜单。
- ToC 改版（smart-closet-server#243）：面向年轻用户，界面少字、一屏一个主操作，说明放进“？”或去掉，不写流程用语和工程用语（词表见（一）第五节）。“今天”页（src/views/TodayPage.vue、src/today/）全程零模型调用：左滑换一套不发任何推荐反馈，右滑等同“今天穿了这套”写穿着记录；纯逻辑放 src/today/deck.ts 并有单测。
- 情绪效果（src/services/celebrate.ts：canvas-confetti 按需加载、motion 弹簧动画）只在真实完成时触发（穿上、首次看到搭配、到账或开通、上身图做好），同一动作只庆祝一次；遵守 prefers-reduced-motion 与音效开关，不替代状态说明。新增第三方依赖要把许可证放进 public/licenses 并登记 THIRD-PARTY-NOTICES.md。
