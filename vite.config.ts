import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

const FALLBACK_REPO_URL = 'https://github.com/Exoridus/ChatGPTDataExportViewer'

function getGitValue(command: string, fallback: string): string {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim() || fallback
  } catch {
    return fallback
  }
}

function normalizeRepoUrl(url: string): string {
  if (!url) return FALLBACK_REPO_URL
  if (url.startsWith('git@')) {
    const sshMatch = /^git@([^:]+):(.+)$/.exec(url)
    if (!sshMatch) return FALLBACK_REPO_URL
    return `https://${sshMatch[1]}/${sshMatch[2].replace(/\.git$/, '')}`
  }
  const sshUrlMatch = /^ssh:\/\/git@([^/]+)\/(.+)$/.exec(url)
  if (sshUrlMatch) {
    return `https://${sshUrlMatch[1]}/${sshUrlMatch[2].replace(/\.git$/, '')}`
  }
  return url.replace(/\.git$/, '')
}

const appVersion = getGitValue('git describe --tags --abbrev=0', 'dev')
const appCommit = getGitValue('git rev-parse --short HEAD', 'unknown')
const appRepoRaw = getGitValue('git remote get-url origin', FALLBACK_REPO_URL)
const appRepoUrl = normalizeRepoUrl(appRepoRaw) || FALLBACK_REPO_URL

// https://vite.dev/config/
export default defineConfig({
  root: 'src',
  base: './',
  publicDir: 'public',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(appCommit),
    __APP_REPO_URL__: JSON.stringify(appRepoUrl),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')
          if (!normalized.includes('/node_modules/')) {
            return undefined
          }
          if (
            normalized.includes('/node_modules/react/') ||
            normalized.includes('/node_modules/react-dom/') ||
            normalized.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react'
          }
          if (normalized.includes('/node_modules/react-router') || normalized.includes('/node_modules/@remix-run/')) {
            return 'vendor-router'
          }
          if (normalized.includes('/node_modules/lucide-react/')) {
            return 'vendor-icons'
          }
          if (normalized.includes('/node_modules/idb/')) {
            return 'vendor-storage'
          }
          return undefined
        },
      },
    },
  },
})
