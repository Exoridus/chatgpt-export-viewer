import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { importDatasets } from '../../scripts/shared/datasetImporter'
import { mergeSummaries } from '../../src/lib/merge'
import type { Conversation, ConversationSummary, GeneratedAsset } from '../../src/types'
import { syntheticFixtures, writeFixtureZipFile } from '../fixtures/syntheticExports'

async function withTempDir(run: (outputDir: string) => Promise<void>) {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'viewer-import-synthetic-'))
  try {
    await run(outputDir)
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
}

describe('importDatasets synthetic fixtures', () => {
  it('keeps pinned sorting deterministic using pinned_time (earliest pinned first)', async () => {
    await withTempDir(async (outputDir) => {
      const zipPath = await writeFixtureZipFile(syntheticFixtures.pinSort, outputDir)
      const result = await importDatasets({ patterns: [zipPath], outputDir, mode: 'replace' })
      expect(result.conversations).toBe(3)

      const summaries = JSON.parse(
        await readFile(path.join(outputDir, 'conversations.json'), 'utf-8'),
      ) as ConversationSummary[]

      const merged = mergeSummaries(summaries, [])
      expect(merged.map((item) => item.id)).toEqual(['pin-early', 'pin-late', 'pin-none'])
      expect(merged.slice(0, 2).every((item) => item.pinned === true)).toBe(true)
      expect(merged[2].pinned).toBe(false)
    })
  })

  it('persists generated assets (linked + unlinked) and writes their files', async () => {
    await withTempDir(async (outputDir) => {
      const zipPath = await writeFixtureZipFile(syntheticFixtures.mixedAssets, outputDir)
      const result = await importDatasets({ patterns: [zipPath], outputDir, mode: 'replace' })

      expect(result.conversations).toBe(2)
      expect(result.assets).toBeGreaterThanOrEqual(3)

      const generatedAssets = JSON.parse(
        await readFile(path.join(outputDir, 'generated_files.json'), 'utf-8'),
      ) as GeneratedAsset[]

      expect(generatedAssets.map((asset) => asset.path).sort()).toEqual([
        'user-fixtures/generated/linked.png',
        'user-fixtures/generated/unlinked.png',
      ])

      await expect(access(path.join(outputDir, 'assets', 'assets', 'inline-linked.png'))).resolves.toBeUndefined()
      await expect(
        access(path.join(outputDir, 'assets', 'user-fixtures', 'generated', 'linked.png')),
      ).resolves.toBeUndefined()
      await expect(
        access(path.join(outputDir, 'assets', 'user-fixtures', 'generated', 'unlinked.png')),
      ).resolves.toBeUndefined()
    })
  })

  it('preserves deduped safe_urls and archive/memory conversation metadata in written payloads', async () => {
    await withTempDir(async (outputDir) => {
      const zipPath = await writeFixtureZipFile(syntheticFixtures.duplicateSafeUrls, outputDir)
      const result = await importDatasets({ patterns: [zipPath], outputDir, mode: 'replace' })
      expect(result.conversations).toBe(1)

      const conversation = JSON.parse(
        await readFile(path.join(outputDir, 'conversations', 'dedupe-safe-urls', 'conversation.json'), 'utf-8'),
      ) as Conversation

      expect(conversation.safe_urls).toEqual(['https://example.test/a', 'https://example.test/b'])
      expect(conversation.is_archived).toBe(true)
      expect(conversation.memory_scope).toBe('workspace')
    })
  })

  it('imports mixed message types and persists referenced assets safely', async () => {
    await withTempDir(async (outputDir) => {
      const zipPath = await writeFixtureZipFile(syntheticFixtures.messageTypeMatrix, outputDir)
      const result = await importDatasets({ patterns: [zipPath], outputDir, mode: 'replace' })

      expect(result.conversations).toBe(1)
      expect(result.assets).toBe(2)

      await expect(access(path.join(outputDir, 'assets', 'assets', 'media', 'synthetic-image.png'))).resolves.toBeUndefined()
      await expect(access(path.join(outputDir, 'assets', 'assets', 'docs', 'synthetic-notes.txt'))).resolves.toBeUndefined()
    })
  })

  it('keeps pinned/search/system metadata stable through dataset import summaries', async () => {
    await withTempDir(async (outputDir) => {
      const zipPath = await writeFixtureZipFile(syntheticFixtures.pinnedSearchSystemPrompts, outputDir)
      const result = await importDatasets({ patterns: [zipPath], outputDir, mode: 'replace' })
      expect(result.conversations).toBe(1)

      const summaries = JSON.parse(
        await readFile(path.join(outputDir, 'conversations.json'), 'utf-8'),
      ) as ConversationSummary[]
      expect(summaries[0].pinned).toBe(true)
      expect(summaries[0].pinned_time).toBe(1_710_900_010_000)

      const conversation = JSON.parse(
        await readFile(path.join(outputDir, 'conversations', summaries[0].id, 'conversation.json'), 'utf-8'),
      ) as Conversation
      expect(conversation.safe_urls).toEqual(['https://example.test/research'])
      expect(conversation.messages.filter((message) => message.role === 'system')).toHaveLength(2)
    })
  })

  it('handles missing fields fixture by skipping invalid paths but keeping valid messages', async () => {
    await withTempDir(async (outputDir) => {
      const zipPath = await writeFixtureZipFile(syntheticFixtures.missingFieldsRobustness, outputDir)
      const result = await importDatasets({ patterns: [zipPath], outputDir, mode: 'replace' })
      expect(result.conversations).toBe(1)

      const summaries = JSON.parse(
        await readFile(path.join(outputDir, 'conversations.json'), 'utf-8'),
      ) as ConversationSummary[]
      expect(summaries).toHaveLength(1)

      const conversation = JSON.parse(
        await readFile(path.join(outputDir, 'conversations', summaries[0].id, 'conversation.json'), 'utf-8'),
      ) as Conversation
      const assistant = conversation.messages.find((message) => message.role === 'assistant')
      expect(assistant?.details?.meta?.prompt_tokens).toBe(3)
      expect(assistant?.details?.meta?.completion_tokens).toBe(5)
      expect(assistant?.details?.meta?.total_tokens).toBe(8)
    })
  })

  it('imports extreme long message fixture without truncating persisted payloads', async () => {
    await withTempDir(async (outputDir) => {
      const zipPath = await writeFixtureZipFile(syntheticFixtures.extremeLongMessages, outputDir)
      const result = await importDatasets({ patterns: [zipPath], outputDir, mode: 'replace' })
      expect(result.conversations).toBe(1)

      const summaries = JSON.parse(
        await readFile(path.join(outputDir, 'conversations.json'), 'utf-8'),
      ) as ConversationSummary[]
      const conversation = JSON.parse(
        await readFile(path.join(outputDir, 'conversations', summaries[0].id, 'conversation.json'), 'utf-8'),
      ) as Conversation
      const userMessage = conversation.messages.find((message) => message.role === 'user')
      const markdown = userMessage?.blocks.find((block) => block.type === 'markdown')
      expect(markdown?.text.length).toBeGreaterThan(100_000)
    })
  })
})
