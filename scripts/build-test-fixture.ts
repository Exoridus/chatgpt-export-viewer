import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'

const SOURCE_ZIP = path.resolve(process.argv[2] ?? 'tests/fixtures/source-export.zip')
const OUTPUT_ZIP = path.resolve('tests/fixtures/anonymized-export.zip')
const CONVERSATION_LIMIT = 10

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z3iQAAAAASUVORK5CYII=',
  'base64',
)
const ONE_PIXEL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBQWFhUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OFQ8PGisdFR0rKystKy0tKys3KysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrK//AABEIAAEAAQMBEQACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAAAAQID/8QAFxEBAQEBAAAAAAAAAAAAAAAAAAERIf/aAAwDAQACEAMQAAAB3A8f/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEh/9oACAEBAAEFAmP/xAAVEQEBAAAAAAAAAAAAAAAAAAAQIf/aAAgBAwEBPwFH/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAgEBPwEf/8QAFhABAQEAAAAAAAAAAAAAAAAAABEh/9oACAEBAAY/Amf/xAAWEAEBAQAAAAAAAAAAAAAAAAABABH/2gAIAQEAAT8hQsf/2gAMAwEAAgADAAAAEPP/xAAVEQEBAAAAAAAAAAAAAAAAAAABEP/aAAgBAwEBPxBf/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAgEBPxAf/8QAFhEBAQEAAAAAAAAAAAAAAAAAAREh/9oACAEBAAE/EFt3H//Z',
  'base64',
)
const ONE_PIXEL_GIF = Buffer.from('R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64')
const TINY_WAV = buildTinyWav()

if (!existsSync(SOURCE_ZIP)) {
  throw new Error(`Source ZIP not found: ${SOURCE_ZIP}`)
}

const archive = unzipSync(readFileSync(SOURCE_ZIP))
const normalizedEntries = new Map(Object.entries(archive).map(([k, v]) => [normalizePath(k), v]))
const chatEntryName = findRequiredEntry(normalizedEntries, (name) => name.endsWith('chat.html'))
const chatHtml = strFromU8(normalizedEntries.get(chatEntryName))
const allConversations = extractConversations(chatHtml)
const allAssets = extractAssets(chatHtml)

const selectedConversations = allConversations
  .slice()
  .sort((a, b) => Object.keys(b.mapping ?? {}).length - Object.keys(a.mapping ?? {}).length)
  .slice(0, CONVERSATION_LIMIT)
  .map((conversation, index) => anonymizeConversation(conversation, index + 1))

const selectedPointers = collectPointersFromConversations(selectedConversations)
const selectedAssets = {}
for (const pointer of selectedPointers) {
  const descriptor = allAssets[pointer]
  if (descriptor != null) {
    selectedAssets[pointer] = descriptor
  }
}

const referencedAssetPaths = new Set(
  Object.values(selectedAssets)
    .map((value) => resolveAssetPath(value))
    .filter((value) => typeof value === 'string' && value.length > 0),
)

const userFolder = findUserFolder(normalizedEntries)
const generatedPaths = []
if (userFolder) {
  for (const entryName of normalizedEntries.keys()) {
    if (entryName.startsWith(`${userFolder}/`) && !entryName.endsWith('/')) {
      referencedAssetPaths.add(entryName)
      generatedPaths.push(entryName)
    }
  }
}

const entriesOut = {}
entriesOut['chat.html'] = strToU8(buildChatHtml(selectedConversations, selectedAssets))
entriesOut['conversations.json'] = strToU8(`${JSON.stringify(selectedConversations, null, 2)}\n`)
entriesOut['tmp/user.json'] = strToU8(
  `${JSON.stringify({ id: 'user-anonymized', email: 'anon@example.test', chatgpt_plus_user: false }, null, 2)}\n`,
)
entriesOut['tmp/message_feedback.json'] = strToU8('[]\n')
entriesOut['tmp/group_chats.json'] = strToU8('{"chats":[]}\n')
entriesOut['tmp/shopping.json'] = strToU8('[]\n')
entriesOut['tmp/basispoints.json'] = strToU8('{"attachments":[],"containers":[],"container_bindings":[]}\n')
entriesOut['tmp/sora.json'] = strToU8('{"user":null,"tasks":[]}\n')

for (const assetPath of referencedAssetPaths) {
  const normalized = normalizePath(assetPath)
  entriesOut[normalized] = replacementPayload(normalized)
}

const zipped = zipSync(entriesOut, { level: 9 })
mkdirSync(path.dirname(OUTPUT_ZIP), { recursive: true })
writeFileSync(OUTPUT_ZIP, Buffer.from(zipped))

console.log(`Fixture written: ${OUTPUT_ZIP}`)
console.log(`Conversations: ${selectedConversations.length}`)
console.log(`Assets: ${referencedAssetPaths.size}`)
console.log(`Generated assets included: ${generatedPaths.length}`)

function normalizePath(value) {
  return value.replace(/\\/g, '/').replace(/^\.\/?/, '').replace(/^\/+/, '')
}

function findRequiredEntry(entries, predicate) {
  for (const key of entries.keys()) {
    if (predicate(key)) return key
  }
  throw new Error('Required entry not found')
}

function extractConversations(html) {
  const marker = 'var jsonData'
  const startMarker = html.indexOf(marker)
  if (startMarker === -1) throw new Error('var jsonData missing in chat.html')
  const start = html.indexOf('[', startMarker)
  if (start === -1) throw new Error('jsonData array start missing')
  const end = findBalancedEnd(html, start, '[', ']')
  return JSON.parse(html.slice(start, end))
}

function extractAssets(html) {
  const marker = 'var assetsJson'
  const startMarker = html.indexOf(marker)
  if (startMarker === -1) return {}
  const start = html.indexOf('{', startMarker)
  if (start === -1) return {}
  const end = findBalancedEnd(html, start, '{', '}')
  return JSON.parse(html.slice(start, end))
}

function findBalancedEnd(input, start, open, close) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < input.length; i += 1) {
    const ch = input[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\\\') {
        escaped = true
        continue
      }
      if (ch === '\"') {
        inString = false
      }
      continue
    }
    if (ch === '\"') {
      inString = true
      continue
    }
    if (ch === open) depth += 1
    if (ch === close) {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  throw new Error('Unbalanced content while parsing chat.html')
}

function anonymizeConversation(rawConversation, ordinal) {
  const cloned = structuredClone(rawConversation)
  cloned.title = `Anonymized Conversation ${ordinal}`
  walkAndAnonymize(cloned, [])
  return cloned
}

function walkAndAnonymize(value, pathStack) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkAndAnonymize(entry, pathStack.concat(String(index))))
    return
  }
  if (!value || typeof value !== 'object') {
    return
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = pathStack.concat(key)
    if (typeof child === 'string') {
      if (shouldAnonymize(key, child, nextPath)) {
        value[key] = anonymizeString(child)
      }
      continue
    }
    walkAndAnonymize(child, nextPath)
  }
}

function shouldAnonymize(key, input, pathStack) {
  const technicalKeys = new Set([
    'id',
    'conversation_id',
    'current_node',
    'parent',
    'recipient',
    'status',
    'content_type',
    'role',
    'model_slug',
    'kind',
    'default_model_slug',
    'voice',
    'name',
  ])
  if (technicalKeys.has(key)) return false
  if (/^(sediment|upload):\/\//.test(input)) return false
  if (/\.(png|jpe?g|gif|webp|wav|dat)$/i.test(input)) return false
  if (/^file[_-]/i.test(input)) return false
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(input)) return false
  if (pathStack.includes('children')) return false
  return true
}

function anonymizeString(input) {
  const hash = shortHash(input)
  if (input.includes('@')) return `anon-${hash}@example.test`
  if (/^https?:\/\//i.test(input)) return `https://example.test/${hash}`
  return `anon-${hash}`
}

function shortHash(input) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(36).padStart(7, '0').slice(0, 8)
}

function collectPointersFromConversations(conversations) {
  const pointers = new Set()
  const stack = [conversations]
  while (stack.length) {
    const current = stack.pop()
    if (Array.isArray(current)) {
      stack.push(...current)
      continue
    }
    if (!current || typeof current !== 'object') continue
    for (const [key, value] of Object.entries(current)) {
      if (typeof value === 'string' && /^sediment:\/\//.test(value)) {
        pointers.add(value)
      } else if (value && typeof value === 'object') {
        stack.push(value)
      }
      if (key === 'asset_pointer' && typeof value === 'string') {
        pointers.add(value)
      }
    }
  }
  return pointers
}

function resolveAssetPath(descriptor) {
  if (typeof descriptor === 'string') return normalizePath(descriptor)
  if (descriptor && typeof descriptor === 'object') {
    if (typeof descriptor.file_path === 'string') return normalizePath(descriptor.file_path)
    if (typeof descriptor.download_url === 'string') return normalizePath(descriptor.download_url)
  }
  return null
}

function findUserFolder(entries) {
  for (const key of entries.keys()) {
    const match = key.match(/(user-[A-Za-z0-9_-]+)\//)
    if (match) return match[1]
  }
  return null
}

function replacementPayload(assetPath) {
  if (/\.png$/i.test(assetPath)) return ONE_PIXEL_PNG
  if (/\.jpe?g$/i.test(assetPath)) return ONE_PIXEL_JPEG
  if (/\.gif$/i.test(assetPath)) return ONE_PIXEL_GIF
  if (/\.wav$/i.test(assetPath)) return TINY_WAV
  if (/\.dat$/i.test(assetPath)) return new Uint8Array([0])
  return new Uint8Array([0])
}

function buildChatHtml(conversations, assetsJson) {
  return [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="utf-8"><title>Anonymized Chat Export</title></head>',
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

function buildTinyWav() {
  const header = Buffer.from([
    0x52, 0x49, 0x46, 0x46,
    0x24, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x01, 0x00,
    0x40, 0x1f, 0x00, 0x00,
    0x40, 0x1f, 0x00, 0x00,
    0x01, 0x00,
    0x08, 0x00,
    0x64, 0x61, 0x74, 0x61,
    0x00, 0x00, 0x00, 0x00,
  ])
  return new Uint8Array(header)
}
