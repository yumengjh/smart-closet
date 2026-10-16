# 本地实时试穿资源

运行 `npm run setup:try-on` 安装已固定版本的 MediaPipe WASM 和 Pose Lite 模型。
资源从本站加载；摄像头帧不上传，不在运行服务时下载模型。
模型与 WASM 为可重建本地文件，不进入源码 Git；来源、大小和 SHA256 在 manifest.json。

MediaPipe 来源：https://github.com/google-ai-edge/mediapipe ，框架 Apache-2.0。
模型说明：https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker 。
实验验证不代表完成对所有分发资源的商业授权审查。
