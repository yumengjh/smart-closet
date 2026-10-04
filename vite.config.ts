import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createApiUrls } from './src/domain/api-url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_API_BASE_URL || ''
  const proxyTarget = env.CLOSET_API_PROXY_TARGET || 'http://127.0.0.1:8080'
  createApiUrls(base)
  if (env.CLOSET_STANDALONE_BUILD === 'true' && (!base.startsWith('https://') || env.VITE_USE_MOCKS !== 'false')) {
    throw new Error('独立生产构建需要 HTTPS VITE_API_BASE_URL，并关闭 VITE_USE_MOCKS。')
  }
  return {
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('ant-design-vue') || id.includes('@ant-design/icons-vue')) return 'ui-kit'
          if (id.includes('/vue/') || id.includes('/vue-router/') || id.includes('/pinia/') || id.includes('/@vue/')) return 'vue-vendor'
          return 'vendor'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: proxyTarget, changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest, request) => {
            // Preserve same-origin development after the proxy changes the Host header.
            const origin = request.headers.origin
            try {
              if (origin && new URL(origin).host === request.headers.host) proxyRequest.setHeader('Origin', new URL(proxyTarget).origin)
            } catch { /* Invalid or opaque origins remain subject to backend CORS checks. */ }
          })
        },
      },
    },
  },
  }
})
