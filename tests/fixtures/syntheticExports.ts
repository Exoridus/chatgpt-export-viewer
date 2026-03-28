import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { strToU8, zipSync } from 'fflate'

import type { AssetIndex, GraphConversation, GraphMessageMetadata, GraphMultimodalContentPart } from '../../src/types'

const ONE_PIXEL_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z3iQAAAAASUVORK5CYII=',
    'base64',
  ),
)

const TINY_WAV = Uint8Array.from([
  82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 64, 31, 0, 0, 128,
  62, 0, 0, 2, 0, 16, 0, 100, 97, 116, 97, 0, 0, 0, 0,
])

const SAMPLE_TEXT_FILE = strToU8('Lorem ipsum dolor sit amet.\nContact: Firstname Lastname\nPhone: 123456789\n')

const UUID = {
  convoMatrix: '8d2bc978-cc8c-4836-9b95-b6d8e2f6968a',
  convoPinnedSearch: '2ed857cc-6a31-4fc0-a6ff-557364d082d8',
  convoLong: '3958fd3a-0187-44f6-a3cc-2de1c73495a9',
  convoSpecialChars: '8af7452c-e518-42f7-bf48-696385ab33c4',
  convoMissingFields: 'ef333c47-495d-4464-8342-2483d9bb0d47',
  convoEmptyPath: 'f3a239cb-5e42-42e3-b2fa-a8337ee53d12',
  pointerImage: 'sediment://8deea08f-f1ec-4764-a3fa-447cb74e7d8a',
  pointerVoice: 'sediment://f4ab24dd-aeb0-4c9f-b90f-26e8a9bd8eca',
  pointerFile: 'sediment://2efaa42b-892c-44b4-ba44-c2b7c46595f5',
} as const

export interface SyntheticFixture {
  name: string
  description: string
  entries: Record<string, Uint8Array>
}

interface ConversationBuildOptions {
  id: string
  title?: string
  userText?: string
  assistantText?: string
  createTime?: number
  updateTime?: number
  pinnedTime?: number | null
  isArchived?: boolean
  memoryScope?: string | null
  safeUrls?: string[]
  conversationMeta?: Partial<GraphConversation>
  assistantMetadata?: GraphMessageMetadata
  assistantStatus?: string
  userParts?: GraphMultimodalContentPart[]
  assistantParts?: GraphMultimodalContentPart[]
}

export const syntheticFixtures: Record<string, SyntheticFixture> = {
  normalSmall: buildFixture(
    'normal-small.zip',
    'Representative export with regular conversations, pinning, metadata and token usage.',
    {
      conversations: [
        buildConversation({
          id: 'normal-a',
          title: 'Normal A',
          createTime: 1_710_000_000,
          updateTime: 1_710_000_050,
          userText: 'How do I parse this export?',
          assistantText: 'Use a slim converter and keep high value metadata.',
          assistantMetadata: {
            message_type: 'next',
            request_id: 'req-normal-a',
            model_slug: 'gpt-4.1',
            requested_model_slug: 'gpt-4.1',
          },
          assistantStatus: 'finished_successfully',
        }),
        buildConversation({
          id: 'normal-b',
          title: 'Normal B (Pinned)',
          createTime: 1_710_000_100,
          updateTime: 1_710_000_200,
          pinnedTime: 1_710_000_150,
          userText: 'Include token counts when present.',
          assistantText: 'Done.',
          assistantMetadata: {
            reasoning_title: 'Token accounting',
            reasoning_status: 'complete',
            usage: {
              prompt_tokens: 11,
              completion_tokens: 17,
              total_tokens: 28,
            },
          } as GraphMessageMetadata,
        }),
        buildConversation({
          id: 'normal-c',
          title: 'Normal C Archived',
          createTime: 1_710_000_300,
          updateTime: 1_710_000_400,
          isArchived: true,
          memoryScope: 'project',
          userText: 'Keep archived and memory scope fields.',
          assistantText: 'Archived + memory scope preserved.',
        }),
      ],
      assetsJson: {},
      extraEntries: {
        'tmp/user.json': toJsonU8({
          id: 'user-normal',
          email: 'normal@example.test',
          chatgpt_plus_user: false,
          birth_year: 1990,
        }),
      },
    },
  ),
  mixedAssets: buildFixture(
    'mixed-assets.zip',
    'Pinned/unpinned conversations with linked and unlinked generated assets.',
    {
      conversations: [
        buildConversation({
          id: 'assets-linked',
          title: 'Linked Assets',
          createTime: 1_710_100_000,
          updateTime: 1_710_100_100,
          pinnedTime: 1_710_100_050,
          userParts: [
            'Please keep linked assets.',
            { content_type: 'image_asset_pointer', asset_pointer: 'sediment://inline-linked' },
            { content_type: 'image_asset_pointer', asset_pointer: 'sediment://generated-linked' },
          ],
          assistantText: 'Linked assets captured.',
        }),
        buildConversation({
          id: 'assets-unpinned',
          title: 'Unpinned',
          createTime: 1_710_100_200,
          updateTime: 1_710_100_250,
          userText: 'No assets here',
          assistantText: 'Acknowledged',
        }),
      ],
      assetsJson: {
        'sediment://inline-linked': {
          file_path: 'assets/inline-linked.png',
          mime_type: 'image/png',
        },
        'sediment://generated-linked': {
          file_path: 'user-fixtures/generated/linked.png',
          mime_type: 'image/png',
        },
      },
      extraEntries: {
        'tmp/user.json': toJsonU8({
          id: 'user-fixtures',
          email: 'fixtures@example.test',
        }),
        'assets/inline-linked.png': ONE_PIXEL_PNG,
        'user-fixtures/generated/linked.png': ONE_PIXEL_PNG,
        'user-fixtures/generated/unlinked.png': ONE_PIXEL_PNG,
      },
    },
  ),
  sparseOptional: buildFixture(
    'sparse-optional.zip',
    'Sparse export with minimal optional fields and no token usage metadata.',
    {
      conversations: [
        buildConversation({
          id: 'sparse-a',
          title: '',
          userText: 'Sparse conversation',
          assistantText: 'Still valid.',
          createTime: 1_710_200_000,
          updateTime: 1_710_200_005,
          assistantMetadata: {
            message_type: 'next',
          },
        }),
      ],
      assetsJson: {},
      extraEntries: {},
    },
  ),
  malformedAssetsJson: buildMalformedAssetsJsonFixture(),
  duplicateSafeUrls: buildFixture(
    'duplicate-safe-urls.zip',
    'Conversation-level safe_urls with duplicates/whitespace and archive/memory values.',
    {
      conversations: [
        buildConversation({
          id: 'dedupe-safe-urls',
          title: 'Dedupe Safe URLs',
          createTime: 1_710_300_000,
          updateTime: 1_710_300_010,
          safeUrls: [' https://example.test/a ', 'https://example.test/a', '', 'https://example.test/b '],
          isArchived: true,
          memoryScope: 'workspace',
        }),
      ],
      assetsJson: {},
      extraEntries: {},
    },
  ),
  pinSort: buildFixture(
    'pin-sort.zip',
    'Multiple pinned conversations with different pinned_time values for deterministic sorting checks.',
    {
      conversations: [
        buildConversation({
          id: 'pin-early',
          title: 'Pin Early',
          createTime: 1_710_400_000,
          updateTime: 1_710_400_010,
          pinnedTime: 1_710_400_005,
        }),
        buildConversation({
          id: 'pin-late',
          title: 'Pin Late',
          createTime: 1_710_400_100,
          updateTime: 1_710_400_120,
          pinnedTime: 1_710_400_090,
        }),
        buildConversation({
          id: 'pin-none',
          title: 'Not pinned',
          createTime: 1_710_400_200,
          updateTime: 1_710_400_400,
          pinnedTime: null,
        }),
      ],
      assetsJson: {},
      extraEntries: {},
    },
  ),
  unusualAssetPaths: buildFixture(
    'unusual-asset-paths.zip',
    'Generated assets with unusual path prefixes and pointer references.',
    {
      conversations: [
        buildConversation({
          id: 'unusual-assets',
          title: 'Unusual assets',
          createTime: 1_710_500_000,
          updateTime: 1_710_500_100,
          userParts: [{ content_type: 'image_asset_pointer', asset_pointer: 'sediment://odd-path' }],
          assistantText: 'Should still resolve.',
        }),
      ],
      assetsJson: {
        'sediment://odd-path': {
          file_path: './assets/weird/asset.png',
          mime_type: 'image/png',
        },
      },
      extraEntries: {
        'nested/archive/assets/weird/asset.png': ONE_PIXEL_PNG,
      },
    },
  ),
  minimalUserNoBirthYear: buildFixture(
    'minimal-user-no-birth-year.zip',
    'Fixture with minimal user profile and missing birth_year.',
    {
      conversations: [
        buildConversation({
          id: 'user-minimal',
          title: 'Minimal user profile',
          createTime: 1_710_600_000,
          updateTime: 1_710_600_010,
        }),
      ],
      assetsJson: {},
      extraEntries: {
        'tmp/user.json': toJsonU8({
          id: 'user-minimal',
          email: 'minimal@example.test',
          chatgpt_plus_user: true,
        }),
      },
    },
  ),
  onboardingEmpty: buildFixture(
    'onboarding-empty.zip',
    'Fixture intentionally carrying no conversation data to mimic first-use onboarding imports.',
    {
      conversations: [],
      assetsJson: {},
      extraEntries: {
        'tmp/user.json': toJsonU8({
          id: 'user-empty',
        }),
      },
    },
  ),
  localizedText: buildFixture(
    'localized-text.zip',
    'Localized text content for route/UI tests and parsing behavior.',
    {
      conversations: [
        buildConversation({
          id: 'localized-de',
          title: 'Unterhaltung Lokalisiert',
          createTime: 1_710_700_000,
          updateTime: 1_710_700_010,
          userText: 'Kannst du mir beim Import helfen?',
          assistantText: 'Ja, importiere die ZIP-Datei lokal im Browser.',
        }),
      ],
      assetsJson: {},
      extraEntries: {},
    },
  ),
  messageTypeMatrix: buildFixture(
    'message-type-matrix.zip',
    'Conversation with text, multi-language code snippets, voice memo, image pointer and file embed.',
    {
      conversations: [buildMessageTypeMatrixConversation()],
      assetsJson: {
        [UUID.pointerImage]: {
          file_path: 'assets/media/synthetic-image.png',
          mime_type: 'image/png',
        },
        [UUID.pointerVoice]: {
          file_path: 'assets/media/synthetic-voice.wav',
          mime_type: 'audio/wav',
        },
        [UUID.pointerFile]: {
          file_path: 'assets/docs/synthetic-notes.txt',
          mime_type: 'text/plain',
        },
      },
      extraEntries: {
        'assets/media/synthetic-image.png': ONE_PIXEL_PNG,
        'assets/media/synthetic-voice.wav': TINY_WAV,
        'assets/docs/synthetic-notes.txt': SAMPLE_TEXT_FILE,
      },
    },
  ),
  extremeLongMessages: buildFixture(
    'extreme-long-messages.zip',
    'Stress-test fixture with extremely long messages and mixed markdown/code sections.',
    {
      conversations: [
        buildConversation({
          id: UUID.convoLong,
          title: 'Extreme Long Messages',
          createTime: 1_711_000_000,
          updateTime: 1_711_000_120,
          userText: longLoremText(4000),
          assistantText: [
            '```json',
            '{"name":"Firstname Lastname","phone":"123456789"}',
            '```',
            '',
            longLoremText(3500),
          ].join('\n'),
        }),
      ],
      assetsJson: {},
      extraEntries: {},
    },
  ),
  specialCharactersAndEncoding: buildFixture(
    'special-characters-and-encoding.zip',
    'Special characters, emoji and unicode edge-cases kept synthetic and parse-safe.',
    {
      conversations: [
        buildConversation({
          id: UUID.convoSpecialChars,
          title: 'Special Characters',
          createTime: 1_711_100_000,
          updateTime: 1_711_100_050,
          userText:
            'Lorem ipsum \u2014 quotes: \u201csmart\u201d / \u2018single\u2019 / symbols: \u00a7 \u00b6 \u20ac \u00a5 \u00b1 \u2022',
          assistantText:
            'Emoji: \ud83d\ude00 \ud83d\ude80 \ud83e\udd16 | CJK: \u6f22\u5b57 | RTL: \u0627\u0644\u0639\u0631\u0628\u064a\u0629 | combining: e\u0301',
        }),
      ],
      assetsJson: {},
      extraEntries: {},
    },
  ),
  missingFieldsRobustness: buildFixture(
    'missing-fields-robustness.zip',
    'Conversations with missing/partial JSON fields to validate importer resilience.',
    {
      conversations: [buildMissingFieldsConversation(), buildEmptyPathConversation()],
      assetsJson: {},
      extraEntries: {
        'tmp/user.json': toJsonU8({
          id: 'f4d6cbb0-756f-430c-bf04-568cb0f81642',
          email: 'fixture-missing-fields@example.test',
          full_name: 'Firstname Lastname',
          phone_number: '123456789',
        }),
      },
    },
  ),
  pinnedSearchSystemPrompts: buildFixture(
    'pinned-search-system-prompts.zip',
    'Pinned conversation with explicit search metadata and multiple system prompts.',
    {
      conversations: [buildPinnedSearchSystemConversation()],
      assetsJson: {},
      extraEntries: {},
    },
  ),
}

export function createFixtureZipBytes(fixture: SyntheticFixture): Uint8Array {
  return zipSync(fixture.entries, { level: 9 })
}

export function createFixtureZipFile(fixture: SyntheticFixture): File {
  const bytes = createFixtureZipBytes(fixture)
  return new File([bytes as BlobPart], fixture.name, { type: 'application/zip' })
}

export async function writeFixtureZipFile(fixture: SyntheticFixture, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true })
  const zipPath = path.join(outputDir, fixture.name)
  const bytes = createFixtureZipBytes(fixture)
  await writeFile(zipPath, Buffer.from(bytes))
  return zipPath
}

function buildMalformedAssetsJsonFixture(): SyntheticFixture {
  const conversation = buildConversation({
    id: 'malformed-assets',
    title: 'Malformed assetsJson fixture',
    createTime: 1_710_250_000,
    updateTime: 1_710_250_010,
    userParts: [{ content_type: 'image_asset_pointer', asset_pointer: 'sediment://asset-malformed' }],
    assistantText: 'Parsed from JS literal assetsJson.',
  })
  const chatHtml = [
    '<!doctype html>',
    '<html>',
    '<body>',
    '<script>',
    `var jsonData = ${JSON.stringify([conversation])};`,
    'var assetsJson = {',
    "  // non strict literal",
    "  'sediment://asset-malformed': {",
    "    file_path: 'assets/malformed.png',",
    "    mime_type: 'image/png',",
    '  },',
    '};',
    '</script>',
    '</body>',
    '</html>',
  ].join('\n')

  return {
    name: 'malformed-assets-json.zip',
    description: 'Legacy/non-strict assetsJson format in chat.html with comments and trailing comma.',
    entries: {
      'chat.html': strToU8(chatHtml),
      'conversations.json': toJsonU8([conversation]),
      'assets/malformed.png': ONE_PIXEL_PNG,
    },
  }
}

function buildFixture(
  name: string,
  description: string,
  input: {
    conversations: GraphConversation[]
    assetsJson: AssetIndex
    extraEntries: Record<string, Uint8Array>
  },
): SyntheticFixture {
  const chatHtml = buildChatHtml(input.conversations, input.assetsJson)
  return {
    name,
    description,
    entries: {
      'chat.html': strToU8(chatHtml),
      'conversations.json': toJsonU8(input.conversations),
      ...input.extraEntries,
    },
  }
}

function buildChatHtml(conversations: GraphConversation[], assetsJson: AssetIndex): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="utf-8"><title>Synthetic export fixture</title></head>',
    '<body>',
    '<script>',
    `var jsonData = ${JSON.stringify(conversations)};`,
    `var assetsJson = ${JSON.stringify(assetsJson)};`,
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

function buildConversation(options: ConversationBuildOptions): GraphConversation {
  const userNodeId = `${options.id}-user`
  const assistantNodeId = `${options.id}-assistant`
  return {
    conversation_id: options.id,
    id: `${options.id}-raw`,
    title: options.title ?? options.id,
    current_node: assistantNodeId,
    create_time: options.createTime ?? 1_710_000_000,
    update_time: options.updateTime ?? options.createTime ?? 1_710_000_000,
    pinned_time: options.pinnedTime === undefined ? null : options.pinnedTime,
    is_archived: options.isArchived,
    memory_scope: options.memoryScope,
    safe_urls: options.safeUrls,
    mapping: {
      [userNodeId]: {
        id: userNodeId,
        parent: null,
        children: [assistantNodeId],
        message: {
          id: `${options.id}-message-user`,
          author: { role: 'user' },
          create_time: options.createTime ?? 1_710_000_000,
          content: {
            content_type: 'multimodal_text',
            parts:
              options.userParts ??
              [options.userText ?? `User text for ${options.id}`],
          },
        },
      },
      [assistantNodeId]: {
        id: assistantNodeId,
        parent: userNodeId,
        children: [],
        message: {
          id: `${options.id}-message-assistant`,
          author: { role: 'assistant' },
          status: options.assistantStatus ?? null,
          create_time: (options.createTime ?? 1_710_000_000) + 1,
          update_time: (options.updateTime ?? options.createTime ?? 1_710_000_000) + 1,
          metadata: options.assistantMetadata,
          content: {
            content_type: 'multimodal_text',
            parts:
              options.assistantParts ??
              [options.assistantText ?? `Assistant text for ${options.id}`],
          },
        },
      },
    },
    ...options.conversationMeta,
  }
}

function buildMessageTypeMatrixConversation(): GraphConversation {
  const systemNode = 'd08869eb-5574-481f-b423-6474d72f10cb'
  const userNode = '5615d31d-f0bb-4908-8ff3-b4a8b4fb58db'
  const assistantNode = '6043a0d5-f63d-4c11-b65e-e7c9ee386490'
  const assistantFinalNode = '0ca1b470-0ef1-4c2b-a2a6-0fd6d1c61428'

  return {
    conversation_id: UUID.convoMatrix,
    id: '73eb5da2-b494-4cbd-acf9-ed8d054fdd4a',
    title: 'Message Type Matrix',
    current_node: assistantFinalNode,
    create_time: 1_710_800_000,
    update_time: 1_710_800_240,
    mapping: {
      [systemNode]: {
        id: systemNode,
        parent: null,
        children: [userNode],
        message: {
          id: '1f23a536-a97a-4842-a546-8fdc5f299840',
          author: { role: 'system' },
          create_time: 1_710_800_000,
          content: {
            content_type: 'multimodal_text',
            parts: ['System prompt: keep responses concise and deterministic.'],
          },
        },
      },
      [userNode]: {
        id: userNode,
        parent: systemNode,
        children: [assistantNode],
        message: {
          id: '9af09b2f-1a42-45f0-bcc9-f2d992191cdb',
          author: { role: 'user' },
          create_time: 1_710_800_010,
          content: {
            content_type: 'multimodal_text',
            parts: [
              'Lorem ipsum request with attachments from Firstname Lastname (123456789).',
              { content_type: 'audio_asset_pointer', asset_pointer: UUID.pointerVoice, mime_type: 'audio/wav' },
              { content_type: 'audio_transcription', text: 'Voice memo transcript lorem ipsum.' },
              { content_type: 'image_asset_pointer', asset_pointer: UUID.pointerImage, mime_type: 'image/png' },
              { content_type: 'file', asset_pointer: UUID.pointerFile },
            ],
          },
        },
      },
      [assistantNode]: {
        id: assistantNode,
        parent: userNode,
        children: [assistantFinalNode],
        message: {
          id: '96bc8e3b-f1cb-4e4d-a2f4-662fd8f12f08',
          author: { role: 'assistant' },
          create_time: 1_710_800_020,
          status: 'finished_successfully',
          metadata: {
            request_id: 'e4465fe4-8a06-47cc-ba9f-96421fcb5642',
            message_type: 'next',
            model_slug: 'gpt-4.1-mini',
            requested_model_slug: 'gpt-4.1-mini',
            usage: { prompt_tokens: 120, completion_tokens: 220, total_tokens: 340 },
          },
          content: {
            content_type: 'multimodal_text',
            parts: [
              '```ts\nconst value: string = "lorem";\nconsole.log(value)\n```',
              '```python\nprint("ipsum")\n```',
              {
                content_type: 'code',
                language: 'rust',
                text: 'fn main() {\n    println!("lorem");\n}',
              },
            ],
          },
        },
      },
      [assistantFinalNode]: {
        id: assistantFinalNode,
        parent: assistantNode,
        children: [],
        message: {
          id: '994b8a9a-72f1-43eb-b8c3-d4eeb11f572c',
          author: { role: 'assistant' },
          create_time: 1_710_800_030,
          content: {
            content_type: 'multimodal_text',
            parts: ['Final assistant message with text-only summary.'],
          },
        },
      },
    },
  }
}

function buildPinnedSearchSystemConversation(): GraphConversation {
  const systemNodeA = 'a83b0f45-bfd9-4287-9202-a47f2f14e8d3'
  const systemNodeB = 'f4d69ad4-94af-4bc3-8f13-c07afd16d447'
  const userNode = 'ad6a2ef0-c7c8-45e0-b335-34534ebf17a9'
  const assistantNode = 'b1ed7c44-020a-4f95-9f8e-74b027802c76'

  return {
    conversation_id: UUID.convoPinnedSearch,
    id: 'f19f1d1d-b8d6-4818-9482-3826d992bbf6',
    title: 'Pinned Search + System Prompts',
    current_node: assistantNode,
    create_time: 1_710_900_000,
    update_time: 1_710_900_090,
    pinned_time: 1_710_900_010,
    safe_urls: [' https://example.test/research ', 'https://example.test/research'],
    mapping: {
      [systemNodeA]: {
        id: systemNodeA,
        parent: null,
        children: [systemNodeB],
        message: {
          id: '560d1cf4-a43f-48ef-bbe5-b6dd17fb84d0',
          author: { role: 'system' },
          content: {
            content_type: 'multimodal_text',
            parts: ['System prompt A: reply in a neutral and verifiable style.'],
          },
        },
      },
      [systemNodeB]: {
        id: systemNodeB,
        parent: systemNodeA,
        children: [userNode],
        message: {
          id: 'a7809e9c-1269-4eb2-97a3-4f7b3554bcfe',
          author: { role: 'system' },
          content: {
            content_type: 'multimodal_text',
            parts: ['System prompt B: include short source notes and keep markdown compact.'],
          },
        },
      },
      [userNode]: {
        id: userNode,
        parent: systemNodeB,
        children: [assistantNode],
        message: {
          id: 'e7d9d6e2-b8f1-485d-88dc-273f190ac58b',
          author: { role: 'user' },
          content: {
            content_type: 'multimodal_text',
            parts: ['Please search for a concise synthetic research summary.'],
          },
        },
      },
      [assistantNode]: {
        id: assistantNode,
        parent: userNode,
        children: [],
        message: {
          id: '6afbf2cb-d5d0-48a6-8863-4cae87a4f9d8',
          author: { role: 'assistant' },
          status: 'finished_successfully',
          metadata: {
            message_type: 'next',
            request_id: '70e798cc-f2c9-4470-a4ec-08463b8869db',
            reasoning_title: 'Synthetic Search Pass',
            reasoning_status: 'complete',
            search_queries: [
              { type: 'search', q: 'lorem ipsum synthetic reference' },
              { type: 'search', q: 'example.test documentation' },
            ],
            search_result_groups: [
              { type: 'web', domain: 'example.test' },
              { type: 'web', domain: 'docs.example.test' },
            ],
          },
          content: {
            content_type: 'multimodal_text',
            parts: ['Search summary lorem ipsum with grouped synthetic sources.'],
          },
        },
      },
    },
  }
}

function buildMissingFieldsConversation(): GraphConversation {
  const userNode = 'd302ddfd-6455-45fa-a8f4-04fe58df2282'
  const assistantNode = '2a3307df-b311-4f1b-b220-db4f9d8ace06'

  return {
    conversation_id: UUID.convoMissingFields,
    id: '8ec92981-57f4-42f2-8f0f-1457eb84ddf3',
    title: '',
    current_node: assistantNode,
    create_time: 1_711_200_000,
    update_time: 1_711_200_040,
    mapping: {
      [userNode]: {
        id: userNode,
        parent: null,
        children: [assistantNode],
        message: {
          author: { role: 'user' },
          content: {
            content_type: 'multimodal_text',
            parts: [
              null as unknown as GraphMultimodalContentPart,
              { content_type: 'multimodal_text', parts: [{ text: 'Lorem ipsum nested content.' }] },
              { content_type: 'unknown_shape', value: 42 },
            ],
          },
        },
      },
      [assistantNode]: {
        id: assistantNode,
        parent: userNode,
        children: [],
        message: {
          id: 'cf8935eb-5e32-4f42-a8a6-8550759376ef',
          author: { role: 'assistant' },
          status: null,
          metadata: {
            finished_duration_sec: 3.21,
            nested: {
              result: {
                usage: {
                  prompt_tokens: 3,
                  completion_tokens: 5,
                  total_tokens: 8,
                },
              },
            },
          },
          content: {
            content_type: 'multimodal_text',
            parts: [{ text: 'Assistant reply with sparse fields.' }],
          },
        },
      },
    },
  }
}

function buildEmptyPathConversation(): GraphConversation {
  return {
    conversation_id: UUID.convoEmptyPath,
    id: '1007a247-a2ca-4c9f-8a43-57b22c5271ec',
    title: 'No valid message path',
    current_node: 'c73092fd-7c64-4d18-a841-340fb6b9f5b7',
    create_time: 1_711_200_100,
    update_time: 1_711_200_110,
    mapping: {},
  }
}

function longLoremText(paragraphs: number): string {
  const line =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum efficitur, metus et ultricies posuere, nibh massa facilisis urna, sed blandit mauris magna sed sem.'
  return Array.from({ length: paragraphs }, (_, index) => `${line} [section ${index + 1}]`).join('\n')
}

function toJsonU8(data: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(data, null, 2)}\n`)
}
