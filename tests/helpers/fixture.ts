import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const TEST_ZIP_PATH = path.resolve(process.cwd(), 'tests/fixtures/anonymized-export.zip')

export async function readTestZipBuffer(): Promise<Buffer> {
  return readFile(TEST_ZIP_PATH)
}

export async function createTestZipFile(): Promise<File> {
  const buffer = await readTestZipBuffer()
  return new File([new Uint8Array(buffer)], 'anonymized-export.zip', { type: 'application/zip' })
}
