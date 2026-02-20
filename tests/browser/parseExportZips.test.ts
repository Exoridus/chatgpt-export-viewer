import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { parseExportZips } from '../../src/lib/importer'
import { createTestZipFile } from '../helpers/fixture'

describe('parseExportZips', () => {
  it('imports conversations/assets from anonymized export fixture', async () => {
    const zipFile = await createTestZipFile()
    const result = await parseExportZips([zipFile])

    expect(result.conversations.length).toBe(10)
    expect(result.assets.size).toBeGreaterThan(0)
    expect(result.assetMime.size).toBe(result.assets.size)

    const first = result.conversations[0]
    expect(first.conversation.schema_version).toBe(1)
    expect(first.conversation.messages.length).toBeGreaterThan(2)
    expect(first.summary.title.length).toBeGreaterThan(0)
  })

  it('skips unsafe asset paths from archive descriptors', async () => {
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
    const zipFile = new File([zipBytes], 'unsafe.zip', { type: 'application/zip' })
    const result = await parseExportZips([zipFile])

    expect(result.conversations).toHaveLength(1)
    expect(result.assets.size).toBe(0)
  })
})
