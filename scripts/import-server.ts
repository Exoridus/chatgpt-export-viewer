import path from 'node:path'
import { importDatasets, type DatasetImportMode } from './shared/datasetImporter'

interface CliOptions {
  patterns: string[]
  outputDir: string
  mode: DatasetImportMode
}

async function main() {
  const options = parseArgs()
  try {
    const result = await importDatasets({ patterns: options.patterns, outputDir: options.outputDir, mode: options.mode })
    console.log(`Imported ${result.conversations} conversations and ${result.assets} assets into ${options.outputDir}.`)
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message)
    } else {
      console.error(error)
    }
    process.exit(1)
  }
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const patterns: string[] = []
  let outputDir = 'dist'
  let mode: DatasetImportMode = 'upsert'
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]
    if (token === '--input') {
      const next = args[i + 1]
      if (next) {
        patterns.push(next)
        i += 1
      }
      continue
    }
    if (token === '--output') {
      const next = args[i + 1]
      if (next) {
        outputDir = next
        i += 1
      }
      continue
    }
    if (token === '--mode') {
      const next = args[i + 1]
      if (!next) {
        throw new Error('Missing value after --mode')
      }
      if (next !== 'upsert' && next !== 'replace' && next !== 'clone') {
        throw new Error(`Unknown --mode value: ${next}`)
      }
      mode = next
      i += 1
      continue
    }
    if (!token.startsWith('-')) {
      patterns.push(token)
    }
  }
  return {
    patterns: patterns.length ? patterns : ['./*.zip'],
    outputDir: path.resolve(process.cwd(), outputDir),
    mode,
  }
}

void main()
