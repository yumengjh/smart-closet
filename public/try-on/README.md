# 本地实时试穿资源

运行 `npm run setup:try-on` 安装固定版本的 MediaPipe WASM 和模型：
- 姿态：Pose Lite，必需。
- 手部：Gesture Recognizer，含 21 点手部骨骼和手势标签，可选。
- 面部：Face Landmarker，可选。

可选模型只在页面打开对应开关时加载，缺失时只提示，不影响姿态追踪。
资源从本站加载；摄像头帧不上传，运行服务时也不会下载模型。
模型与 WASM 都可重建，不进入源码 Git；来源、大小和 SHA256 见 manifest.json。

MediaPipe 来源：https://github.com/google-ai-edge/mediapipe ，框架 Apache-2.0。
模型说明：https://ai.google.dev/edge/mediapipe/solutions/vision/ 。
实验验证不等于已完成全部分发资源的商业授权审查。
