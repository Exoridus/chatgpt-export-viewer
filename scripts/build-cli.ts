import { build } from 'esbuild'
import { mkdir, rm, chmod } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmpDir = path.join(root, 'node_modules', '.cache', 'import-dataset')
const bundleFile = path.join(tmpDir, 'import-dataset.cjs')
const outputFile = resolveOutputFile()
const outputDir = path.dirname(outputFile)
const require = createRequire(import.meta.url)
const aliasEntries = new Map([['fflate', require.resolve('fflate/node')]])

await rm(tmpDir, { recursive: true, force: true })
await mkdir(tmpDir, { recursive: true })
await mkdir(outputDir, { recursive: true })

await build({
  entryPoints: [path.join(root, 'scripts/import-dataset.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: bundleFile,
  logLevel: 'info',
  plugins: [
    {
      name: 'cli-alias',
      setup(build) {
        build.onResolve({ filter: /^fflate$/ }, (args) => {
          const resolved = aliasEntries.get(args.path)
          if (resolved) {
            return { path: resolved }
          }
          return null
        })
      },
    },
  ],
})

const execFileAsync = promisify(execFile)
const pkgCli = require.resolve('@yao-pkg/pkg/lib-es5/bin.js')
await execFileAsync(process.execPath, [pkgCli, bundleFile, '--target', 'node18-linux-x64', '--output', outputFile], {
  cwd: root,
})
try {
  await chmod(outputFile, 0o755)
} catch {
  // Windows does not require chmod for executables.
}

console.log(`Built CLI binary at ${outputFile}`)

function resolveOutputFile(): string {
  const args = process.argv.slice(2)
  const outIndex = args.indexOf('--out')
  if (outIndex === -1) {
    return path.join(root, 'dist', 'import-dataset')
  }
  const outputArg = args[outIndex + 1]
  if (!outputArg) {
    throw new Error('Missing value for --out')
  }
  return path.resolve(process.cwd(), outputArg)
}
