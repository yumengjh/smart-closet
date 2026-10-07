# 前端交付边界

此前只有本地Git仓库，没有origin；GitHub账号yumengjh，后端为私有仓库，按同一范围创建smart-closet。README跨仓库文档改为可在GitHub打开的链接。

src/domain/waiting.ts既有修改将所有并行running步骤连接展示，而非只显示第一个；保留取消优先与等待兜底，现纳入用户授权的工作区整理提交。

独立CI使用Node24，因为测试使用Node内置TypeScript支持；npm ci、55项测试、类型检查、真实API前端构建不依赖相邻后端，不启动真实AI。

临时目录、archify、工具日志、活动规划指针忽略；三份规划Markdown保存。已扫描可达历史394个文本blob，未发现所检查的常见凭据模式；.env／.local未进入Git历史。
