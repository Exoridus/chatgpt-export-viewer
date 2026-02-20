import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { importDatasets } from '../../scripts/shared/datasetImporter'
import type { Conversation } from '../../src/types'
import { TEST_ZIP_PATH } from '../helpers/fixture'

async function withTempDir(run: (outputDir: string) => Promise<void>) {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'viewer-import-test-'))
  try {
    await run(outputDir)
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
}

describe('importDatasets', () => {
  it('writes server dataset from zip fixture', async () => {
    await withTempDir(async (outputDir) => {
      const result = await importDatasets({ patterns: [TEST_ZIP_PATH], outputDir, mode: 'replace' })
      expect(result.conversations).toBe(10)
      expect(result.assets).toBeGreaterThan(0)

      const index = JSON.parse(await readFile(path.join(outputDir, 'conversations.json'), 'utf-8')) as Array<{ id: string }>
      expect(index).toHaveLength(10)

      const firstConversation = JSON.parse(
        await readFile(path.join(outputDir, 'conversations', index[0].id, 'conversation.json'), 'utf-8'),
      ) as Conversation
      expect(firstConversation.schema_version).toBe(1)
      expect(firstConversation.messages.length).toBeGreaterThan(2)
    })
  })

  it('upsert mode is idempotent for identical input', async () => {
    await withTempDir(async (outputDir) => {
      const initial = await importDatasets({ patterns: [TEST_ZIP_PATH], outputDir, mode: 'replace' })
      const second = await importDatasets({ patterns: [TEST_ZIP_PATH], outputDir, mode: 'upsert' })

      expect(initial.conversations).toBe(10)
      expect(second.conversations).toBe(10)
    })
  }, 30_000)

  it('clone mode appends suffixed conversation IDs', async () => {
    await withTempDir(async (outputDir) => {
      await importDatasets({ patterns: [TEST_ZIP_PATH], outputDir, mode: 'replace' })
      const cloned = await importDatasets({ patterns: [TEST_ZIP_PATH], outputDir, mode: 'clone' })
      expect(cloned.conversations).toBe(20)

      const summaries = JSON.parse(
        await readFile(path.join(outputDir, 'conversations.json'), 'utf-8'),
      ) as Array<{ id: string }>
      expect(summaries.some((item) => /_v\d+$/.test(item.id))).toBe(true)
    })
  }, 30_000)

  it('blocks writing unsafe asset paths from archives', async () => {
    await withTempDir(async (outputDir) => {
      const zipPath = path.join(outputDir, 'unsafe.zip')
      const conversation = {
        conversation_id: 'conv-safe',
        title: 'Safe',
        current_node: 'n1',
        mapping: {
          n1: {
            id: 'n1',
            message: {
              id: 'm1',
              author: { role: 'assistant' },
              content: {
                content_type: 'multimodal_text',
                parts: [{ content_type: 'image_asset_pointer', asset_pointer: 'sediment://asset-1' }],
              },
            },
          },
        },
      }
      const chatHtml = `
        <script>
          var jsonData = ${JSON.stringify([conversation])};
          var assetsJson = {"sediment://asset-1":{"file_path":"../escape.png","mime_type":"image/png"}};
        </script>
      `
      const zipBytes = zipSync({
        'chat.html': strToU8(chatHtml),
        '../escape.png': new Uint8Array([1, 2, 3]),
      })
      await writeFile(zipPath, Buffer.from(zipBytes))

      const result = await importDatasets({ patterns: [zipPath], outputDir, mode: 'replace' })
      expect(result.conversations).toBe(1)
      expect(result.assets).toBe(0)

      await expect(access(path.join(outputDir, 'escape.png'))).rejects.toThrow()
    })
  })
})
