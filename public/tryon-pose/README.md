# 实时试穿本地姿态检查资源

构建前 `npm run setup:pose` 会自动准备这里的文件（`build`、`build:server`、`build:standalone` 都已挂上）：

- `wasm/`：从 `node_modules/@mediapipe/tasks-vision` 复制 ES 模块版运行库，不联网。
- `pose_landmarker_lite.task`：按 `manifest.json` 的地址下载，SHA256 不一致即构建失败。已存在且校验通过时跳过。

两者都可重建，不进 Git。设 `CLOSET_POSE_OFFLINE=1` 可禁止下载，缺文件时直接失败。
资源从本站加载，摄像头画面不离开设备，服务运行时不下载模型。缺资源时试穿页退回文字拍摄提示。

MediaPipe：https://github.com/google-ai-edge/mediapipe ，框架 Apache-2.0；模型说明见 manifest 中的 documentation。
