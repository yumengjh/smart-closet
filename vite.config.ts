import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createApiUrls } from './src/domain/api-url'
import { versionFromTag } from './src/domain/app-version'

/** Version shown in Settings: CLOSET_APP_VERSION (CI passes the v* tag), else package.json; commit from CI or git. */
function buildInfo(env: Record<string, string>) {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
  let commit = env.CLOSET_APP_COMMIT || env.GITHUB_SHA || ''
  if (!commit) {
    try { commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
    catch { /* Not a git checkout: the version alone is shown. */ }
  }
  return { version: versionFromTag(env.CLOSET_APP_VERSION, pkg.version), commit: commit.slice(0, 12), builtAt: new Date().toISOString() }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_API_BASE_URL || ''
  const proxyTarget = env.CLOSET_API_PROXY_TARGET || 'http://127.0.0.1:8080'
  createApiUrls(base)
  if (env.CLOSET_STANDALONE_BUILD === 'true' && (!base.startsWith('https://') || env.VITE_USE_MOCKS !== 'false')) {
    throw new Error('独立生产构建需要 HTTPS VITE_API_BASE_URL，并关闭 VITE_USE_MOCKS。')
  }
  const build = buildInfo(env)
  return {
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(build.version),
    __APP_COMMIT__: JSON.stringify(build.commit),
    __APP_BUILT_AT__: JSON.stringify(build.builtAt),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@mediapipe/tasks-vision')) return 'pose-vision'
          if (id.includes('ant-design-vue') || id.includes('@ant-design/icons-vue')) return 'ui-kit'
          if (id.includes('/vue/') || id.includes('/vue-router/') || id.includes('/pinia/') || id.includes('/@vue/')) return 'vue-vendor'
          return 'vendor'
        },
      },
    },
  },
  server: {
    watch: { ignored: ['**/.local/**', '**/.planning/**', '**/output/**'] },
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
