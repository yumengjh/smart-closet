import { preview } from 'vite'

// Frontend only: use the existing server and its authenticated wardrobe/file APIs.
// No second backend, shared H2 file, copied garments, or test-account wardrobe.
process.env.CLOSET_API_PROXY_TARGET ||= 'http://127.0.0.1:8080'
const server = await preview({ preview: { host: '127.0.0.1', port: 18084, strictPort: true } })
console.log('实时试穿实验前端：http://localhost:18084/try-on')
console.log(`衣柜接口：${process.env.CLOSET_API_PROXY_TARGET}（使用原账号；localhost 可沿用原登录）`)
for (const event of ['SIGTERM', 'SIGINT']) process.once(event, () => server.httpServer.close(() => process.exit(0)))
