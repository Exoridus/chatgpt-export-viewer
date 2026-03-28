import { describe, expect, it } from 'vitest'

import { parseExportZips } from '../../src/lib/importer'
import { createFixtureZipFile, syntheticFixtures } from '../fixtures/syntheticExports'

describe('synthetic export fixture coverage', () => {
  it('parses representative metadata and keeps token usage only when present', async () => {
    const zipFile = createFixtureZipFile(syntheticFixtures.normalSmall)
    const result = await parseExportZips([zipFile])

    expect(result.conversations).toHaveLength(3)

    const pinned = result.conversations.find((entry) => entry.conversation.id === 'normal-b')
    expect(pinned?.summary.pinned).toBe(true)
    expect(pinned?.summary.pinned_time).toBe(1_710_000_150_000)

    const pinnedAssistant = pinned?.conversation.messages.find((msg) => msg.role === 'assistant')
    expect(pinnedAssistant?.details?.meta?.prompt_tokens).toBe(11)
    expect(pinnedAssistant?.details?.meta?.completion_tokens).toBe(17)
    expect(pinnedAssistant?.details?.meta?.total_tokens).toBe(28)

    const withoutTokens = result.conversations.find((entry) => entry.conversation.id === 'normal-a')
    const assistantWithoutTokens = withoutTokens?.conversation.messages.find((msg) => msg.role === 'assistant')
    expect(assistantWithoutTokens?.details?.meta?.prompt_tokens).toBeUndefined()
    expect(assistantWithoutTokens?.details?.meta?.completion_tokens).toBeUndefined()
    expect(assistantWithoutTokens?.details?.meta?.total_tokens).toBeUndefined()
  })

  it('deduplicates and trims safe_urls while preserving stable order', async () => {
    const zipFile = createFixtureZipFile(syntheticFixtures.duplicateSafeUrls)
    const result = await parseExportZips([zipFile])
    const conversation = result.conversations[0]?.conversation

    expect(conversation?.safe_urls).toEqual(['https://example.test/a', 'https://example.test/b'])
    expect(conversation?.is_archived).toBe(true)
    expect(conversation?.memory_scope).toBe('workspace')
  })

  it('handles sparse optional fields without fabricating token usage', async () => {
    const zipFile = createFixtureZipFile(syntheticFixtures.sparseOptional)
    const result = await parseExportZips([zipFile])
    const payload = result.conversations[0]

    expect(payload.summary.title.length).toBeGreaterThan(0)
    expect(payload.summary.pinned).toBe(false)
    const assistant = payload.conversation.messages.find((msg) => msg.role === 'assistant')
    expect(assistant?.details?.meta?.prompt_tokens).toBeUndefined()
    expect(assistant?.details?.meta?.completion_tokens).toBeUndefined()
    expect(assistant?.details?.meta?.total_tokens).toBeUndefined()
  })

  it('parses malformed assetsJson and unusual asset path references', async () => {
    const malformedZip = createFixtureZipFile(syntheticFixtures.malformedAssetsJson)
    const unusualZip = createFixtureZipFile(syntheticFixtures.unusualAssetPaths)

    const malformed = await parseExportZips([malformedZip])
    const unusual = await parseExportZips([unusualZip])

    expect(malformed.assets.has('assets/malformed.png')).toBe(true)
    expect(unusual.assets.has('assets/weird/asset.png')).toBe(true)
  })

  it('captures linked and unlinked generated assets and minimal user profiles', async () => {
    const mixedZip = createFixtureZipFile(syntheticFixtures.mixedAssets)
    const userZip = createFixtureZipFile(syntheticFixtures.minimalUserNoBirthYear)
    const mixed = await parseExportZips([mixedZip])
    const minimalUser = await parseExportZips([userZip])

    expect(mixed.extras.generatedAssets).toBeDefined()
    expect(mixed.extras.generatedAssets).toHaveLength(2)

    const linked = mixed.extras.generatedAssets?.find((asset) => asset.path.endsWith('/linked.png'))
    const unlinked = mixed.extras.generatedAssets?.find((asset) => asset.path.endsWith('/unlinked.png'))
    expect(linked?.pointers).toEqual(['sediment://generated-linked'])
    expect(unlinked?.pointers).toBeUndefined()

    expect(minimalUser.extras.user?.id).toBe('user-minimal')
    expect(minimalUser.extras.user?.birth_year).toBeUndefined()
  })

  it('supports onboarding-like empty archives without importing fake conversations', async () => {
    const zipFile = createFixtureZipFile(syntheticFixtures.onboardingEmpty)
    const result = await parseExportZips([zipFile])

    expect(result.conversations).toHaveLength(0)
    expect(result.extras.user?.id).toBe('user-empty')
  })

  it('keeps localized text fixtures parseable for UI-facing snippets', async () => {
    const zipFile = createFixtureZipFile(syntheticFixtures.localizedText)
    const result = await parseExportZips([zipFile])

    expect(result.conversations).toHaveLength(1)
    expect(result.conversations[0].summary.title).toBe('Unterhaltung Lokalisiert')
    expect(result.conversations[0].summary.snippet).toContain('Kannst du mir beim Import helfen?')
  })

  it('covers message type matrix with code, assets and voice-related content', async () => {
    const zipFile = createFixtureZipFile(syntheticFixtures.messageTypeMatrix)
    const result = await parseExportZips([zipFile])

    expect(result.conversations).toHaveLength(1)
    const payload = result.conversations[0]
    const conversation = payload.conversation
    expect(conversation.messages.some((message) => message.role === 'system')).toBe(true)
    expect(Object.keys(conversation.assetsMap ?? {})).toHaveLength(2)

    const userMessage = conversation.messages.find((message) => message.role === 'user')
    const userAssetTypes = userMessage?.blocks
      .filter((block) => block.type === 'asset')
      .map((block) => block.mediaType)
    expect(userAssetTypes).toEqual(['image', 'file'])
    expect(userMessage?.blocks.some((block) => block.type === 'markdown' && block.text.includes('Voice memo transcript'))).toBe(
      true,
    )

    const assistantWithCode = conversation.messages.find((message) =>
      message.blocks.some((block) => block.type === 'code'),
    )
    const codeLanguages = assistantWithCode?.blocks
      .filter((block) => block.type === 'code')
      .map((block) => block.lang)
    expect(codeLanguages).toEqual(['ts', 'python', 'rust'])
    expect(assistantWithCode?.details?.meta?.total_tokens).toBe(340)

    expect(result.assets.has('assets/media/synthetic-image.png')).toBe(true)
    expect(result.assets.has('assets/docs/synthetic-notes.txt')).toBe(true)
  })

  it('supports pinned search history metadata and multiple system prompts', async () => {
    const zipFile = createFixtureZipFile(syntheticFixtures.pinnedSearchSystemPrompts)
    const result = await parseExportZips([zipFile])

    expect(result.conversations).toHaveLength(1)
    const payload = result.conversations[0]
    expect(payload.summary.pinned).toBe(true)
    expect(payload.summary.pinned_time).toBe(1_710_900_010_000)
    expect(payload.conversation.safe_urls).toEqual(['https://example.test/research'])

    const systemMessageCount = payload.conversation.messages.filter((message) => message.role === 'system').length
    expect(systemMessageCount).toBe(2)

    const assistant = payload.conversation.messages.find((message) => message.role === 'assistant')
    expect(assistant?.details?.search?.queries).toEqual([
      'lorem ipsum synthetic reference',
      'example.test documentation',
    ])
    expect(assistant?.details?.search?.sources).toEqual(['example.test', 'docs.example.test'])
  })

  it('handles extremely long messages without truncating conversation import', async () => {
    const zipFile = createFixtureZipFile(syntheticFixtures.extremeLongMessages)
    const result = await parseExportZips([zipFile])

    expect(result.conversations).toHaveLength(1)
    const payload = result.conversations[0]
    expect(payload.summary.title).toBe('Extreme Long Messages')
    expect(payload.summary.snippet.length).toBeLessThanOrEqual(120)

    const userMessage = payload.conversation.messages.find((message) => message.role === 'user')
    const userMarkdown = userMessage?.blocks.find((block) => block.type === 'markdown')
    expect(userMarkdown?.text.length).toBeGreaterThan(100_000)

    const assistantCode = payload.conversation.messages
      .flatMap((message) => message.blocks)
      .filter((block) => block.type === 'code')
    expect(assistantCode).toHaveLength(1)
  })

  it('keeps special characters and unicode-heavy content parseable', async () => {
    const zipFile = createFixtureZipFile(syntheticFixtures.specialCharactersAndEncoding)
    const result = await parseExportZips([zipFile])

    expect(result.conversations).toHaveLength(1)
    const assistantText = result.conversations[0].conversation.messages
      .flatMap((message) => message.blocks)
      .filter((block) => block.type === 'markdown')
      .map((block) => block.text)
      .join('\n')

    expect(assistantText).toContain('Emoji:')
    expect(assistantText).toContain('CJK:')
    expect(assistantText).toContain('RTL:')
  })

  it('remains robust when conversations contain missing fields and invalid paths', async () => {
    const zipFile = createFixtureZipFile(syntheticFixtures.missingFieldsRobustness)
    const result = await parseExportZips([zipFile])

    expect(result.conversations).toHaveLength(1)
    const payload = result.conversations[0]
    expect(payload.summary.title).toBe('Lorem ipsum nested content.')

    const assistant = payload.conversation.messages.find((message) => message.role === 'assistant')
    expect(assistant?.details?.meta?.prompt_tokens).toBe(3)
    expect(assistant?.details?.meta?.completion_tokens).toBe(5)
    expect(assistant?.details?.meta?.total_tokens).toBe(8)

    expect(result.extras.user?.id).toBe('f4d6cbb0-756f-430c-bf04-568cb0f81642')
  })
})
