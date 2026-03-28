import '@testing-library/jest-dom/vitest'

if (!(globalThis as unknown as { __APP_VERSION__?: string }).__APP_VERSION__) {
  ;(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = 'test-version'
}

if (!(globalThis as unknown as { __APP_COMMIT__?: string }).__APP_COMMIT__) {
  ;(globalThis as unknown as { __APP_COMMIT__: string }).__APP_COMMIT__ = 'test-commit'
}

if (!(globalThis as unknown as { __APP_REPO_URL__?: string }).__APP_REPO_URL__) {
  ;(globalThis as unknown as { __APP_REPO_URL__: string }).__APP_REPO_URL__ = 'https://example.com/repo'
}
