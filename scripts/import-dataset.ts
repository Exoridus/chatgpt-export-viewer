#!/usr/bin/env node
import path from 'node:path'
import { importDatasets, type DatasetImportMode } from './shared/datasetImporter'

interface CliOptions {
  outputDir: string
  patterns: string[]
  mode: DatasetImportMode
}

async function main() {
  const { outputDir, patterns, mode } = parseArgs()
  try {
    const result = await importDatasets({ outputDir, patterns, mode })
    console.log(`Imported ${result.conversations} conversations and ${result.assets} assets into ${outputDir}.`)
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
  let outputDir = '.'
  let mode: DatasetImportMode = 'upsert'
  const patterns: string[] = []
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]
    if (token === '--out') {
      const next = args[i + 1]
      if (!next) {
        throw new Error('Missing value after --out')
      }
      outputDir = next
      i += 1
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
    if (token.startsWith('-')) {
      throw new Error(`Unknown option: ${token}`)
    }
    patterns.push(token)
  }
  return {
    outputDir: path.resolve(process.cwd(), outputDir),
    patterns: patterns.length ? patterns : ['./*.zip'],
    mode,
  }
}

void main()
