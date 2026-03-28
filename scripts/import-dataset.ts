#!/usr/bin/env node
import path from 'node:path'

import { type DatasetImportMode,importDatasets } from './shared/datasetImporter'

interface CliOptions {
  outputDir: string
  patterns: string[]
  mode: DatasetImportMode
}

const locale = Intl.DateTimeFormat().resolvedOptions().locale
const isDe = locale.startsWith('de')

const strings = {
  searching: isDe ? 'Suche nach Exporten in:' : 'Searching for exports in:',
  success: isDe ? '\nErfolg! Importiert:' : '\nSuccess! Imported:',
  convs: isDe ? 'Unterhaltungen' : 'conversations',
  assets: isDe ? 'Medien' : 'assets',
  into: isDe ? 'nach' : 'into',
  error: isDe ? '\nFehler:' : '\nError:',
  unexpectedError: isDe ? '\nEin unerwarteter Fehler ist aufgetreten:' : '\nAn unexpected error occurred:',
  pressAnyKey: isDe ? '\nDrücken Sie eine beliebige Taste zum Beenden...' : '\nPress any key to exit...',
  missingOut: isDe ? 'Fehlender Wert nach --out' : 'Missing value after --out',
  missingMode: isDe ? 'Fehlender Wert nach --mode' : 'Missing value after --mode',
  unknownMode: isDe ? 'Unbekannter --mode Wert:' : 'Unknown --mode value:',
  unknownOption: isDe ? 'Unbekannte Option:' : 'Unknown option:',
}

async function main() {
  const { outputDir, patterns, mode } = parseArgs()
  try {
    console.log(`${strings.searching} ${patterns.join(', ')}`)
    const result = await importDatasets({ outputDir, patterns, mode })
    console.log(`${strings.success} ${result.conversations} ${strings.convs} und ${result.assets} ${strings.assets} ${strings.into} ${outputDir}.`)
  } catch (error) {
    if (error instanceof Error) {
      console.error(`${strings.error} ${error.message}`)
    } else {
      console.error(`${strings.unexpectedError} ${String(error)}`)
    }
  } finally {
    if (process.platform === 'win32' && process.stdin.isTTY) {
      console.log(strings.pressAnyKey)
      process.stdin.setRawMode(true)
      process.stdin.resume()
      await new Promise((resolve) => process.stdin.once('data', resolve))
    }
  }
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  let outputDir = '.'
  let mode: DatasetImportMode = 'upsert'
  const patterns: string[] = []
  
  const executableDir = path.dirname(process.argv[1] || '.')

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]
    if (token === '--out') {
      const next = args[i + 1]
      if (!next) {
        throw new Error(strings.missingOut)
      }
      outputDir = next
      i += 1
      continue
    }
    if (token === '--mode') {
      const next = args[i + 1]
      if (!next) {
        throw new Error(strings.missingMode)
      }
      if (next !== 'upsert' && next !== 'replace' && next !== 'clone') {
        throw new Error(`${strings.unknownMode} ${next}`)
      }
      mode = next
      i += 1
      continue
    }
    if (token.startsWith('-')) {
      throw new Error(`${strings.unknownOption} ${token}`)
    }
    patterns.push(token)
  }

  // If no patterns provided, check current dir AND executable dir
  if (patterns.length === 0) {
    patterns.push(path.join(process.cwd(), '*.zip'))
    if (path.resolve(executableDir) !== path.resolve(process.cwd())) {
      patterns.push(path.join(executableDir, '*.zip'))
    }
  }

  return {
    outputDir: path.resolve(process.cwd(), outputDir),
    patterns,
    mode,
  }
}

void main()
