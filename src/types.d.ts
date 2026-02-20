/**
 * Global type definitions used by both the graph-shaped ChatGPT export
 * and the render-optimized conversation model inside the app.
 */

// ------------------------------
// Graph-based export (raw data)
// ------------------------------

export interface GraphConversation {
  conversation_id: string
  id?: string
  title?: string
  current_node: string
  mapping: GraphNodeMap
  create_time?: number | null
  update_time?: number | null
  moderation_results?: unknown
  atlas_mode_enabled?: boolean
  async_status?: unknown
  blocked_urls?: string[]
  context_scopes?: string[]
  conversation_origin?: string | null
  conversation_template_id?: string | null
  default_model_slug?: string | null
  disabled_tool_ids?: string[]
  gizmo_id?: string | null
  gizmo_type?: string | null
  is_archived?: boolean
  is_do_not_remember?: boolean
  is_read_only?: boolean
  is_starred?: boolean
  is_study_mode?: boolean
  memory_scope?: string | null
  owner?: string | null
  pinned_time?: number | null
  plugin_ids?: string[]
  safe_urls?: string[]
  sugar_item_id?: string | null
  sugar_item_visible?: boolean
  voice?: string | null
  [extra: string]: unknown
}

export type GraphNodeMap = Record<string, GraphNode>

export interface GraphNode {
  id: string
  parent?: string | null
  children?: string[]
  message?: GraphMessage
}

export type GraphMessage = GraphSystemMessage | GraphAssistantMessage | GraphUserMessage | GraphToolMessage

interface GraphBaseMessage {
  id?: string
  author?: GraphMessageAuthor | null
  create_time?: number | null
  update_time?: number | null
  status?: string | null
  end_turn?: boolean | null
  weight?: number | null
  metadata?: GraphMessageMetadata
  recipient?: string | null
  channel?: string | null
  content?: GraphMessageContent
}

export interface GraphSystemMessage extends GraphBaseMessage {
  author?: GraphMessageAuthor<'system'> | null
}

export interface GraphUserMessage extends GraphBaseMessage {
  author?: GraphMessageAuthor<'user'> | null
}

export interface GraphAssistantMessage extends GraphBaseMessage {
  author?: GraphMessageAuthor<'assistant'> | null
}

export interface GraphToolMessage extends GraphBaseMessage {
  author?: GraphMessageAuthor<'tool'> | null
}

export interface GraphMessageAuthor<Role extends GraphMessageRole = GraphMessageRole> {
  role?: Role
  name?: string | null
  metadata?: Record<string, unknown>
}

export type GraphMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export type GraphMessageContent =
  | GraphMultimodalTextContent
  | GraphThoughtsContent
  | GraphCodeContent
  | GraphExecutionOutputContent
  | GraphReasoningRecapContent
  | GraphSonicWebpageContent
  | GraphSystemErrorContent
  | GraphTextContent
  | GraphTetherQuoteContent
  | GraphTetherBrowsingContent
  | GraphUserEditableContextContent
  | GraphUnknownContent

export interface GraphMultimodalTextContent {
  content_type: 'multimodal_text'
  parts: GraphMultimodalContentPart[]
  text?: string
  thoughts?: never
}

export interface GraphThoughtsContent {
  content_type: 'thoughts' | 'reasoning_recap'
  thoughts?: GraphThoughtFragment[]
  summary?: string | null
  text?: string | null
  parts?: never
}

export interface GraphCodeContent {
  content_type: 'code'
  text: string
  language?: string | null
}

export interface GraphExecutionOutputContent {
  content_type: 'execution_output'
  text?: string
  language?: string | null
}

export interface GraphReasoningRecapContent {
  content_type: 'reasoning_recap'
  text?: string
}

export interface GraphSonicWebpageContent {
  content_type: 'sonic_webpage'
  text: string
  url?: string
}

export interface GraphSystemErrorContent {
  content_type: 'system_error'
  text: string
}

export interface GraphTextContent {
  content_type: 'text'
  text: string
}

export interface GraphTetherQuoteContent {
  content_type: 'tether_quote'
  text: string
  quoted_text?: string
}

export interface GraphTetherBrowsingContent {
  content_type: 'tether_browsing_display'
  text: string
}

export interface GraphUserEditableContextContent {
  content_type: 'user_editable_context'
  text: string
}

export interface GraphUnknownContent {
  content_type: string
  [key: string]: unknown
}

export interface GraphThoughtFragment {
  content?: string | null
  summary?: string | null
  finished?: boolean | null
}

export type GraphMultimodalContentPart =
  | GraphTextPart
  | GraphAssetPointerPart
  | GraphAudioAssetPointerPart
  | GraphAudioTranscriptionPart
  | GraphRealTimeUserAudioVideoPart
  | GraphStructuredPart
  | string

export interface GraphTextPart {
  content_type?: undefined
  text: string
  language?: string
  metadata?: Record<string, unknown>
}

export interface GraphAssetPointerPart {
  content_type?: 'image_asset_pointer'
  asset_pointer: string
  width?: number
  height?: number
  mime_type?: string
  metadata?: Record<string, unknown>
}

export interface GraphAudioAssetPointerPart {
  content_type?: 'audio_asset_pointer'
  asset_pointer: string
  mime_type?: string
  metadata?: Record<string, unknown>
}

export interface GraphAudioTranscriptionPart {
  content_type?: 'audio_transcription'
  text: string
  confidence?: number
  metadata?: Record<string, unknown>
}

export interface GraphRealTimeUserAudioVideoPart {
  content_type?: 'real_time_user_audio_video_asset_pointer'
  asset_pointer: string
  metadata?: Record<string, unknown>
}

export interface GraphStructuredPart {
  content_type?: string
  [key: string]: unknown
}

export interface GraphMessageMetadata {
  is_visually_hidden_from_conversation?: boolean
  can_save?: boolean
  attachments?: GraphAttachment[]
  request_id?: string
  message_source?: string | null
  timestamp_?: string
  message_type?: string
  pad?: unknown
  parent_id?: string
  finish_details?: unknown
  is_complete?: boolean
  serialization_metadata?: Record<string, unknown>
  rebase_system_message?: boolean
  selected_github_repos?: unknown
  dictation?: unknown
  command?: unknown
  status?: string
  user_context_message_data?: unknown
  is_user_system_message?: boolean
  kwargs?: Record<string, unknown>
  pending_memory_info?: unknown
  requested_model_slug?: string
  canvas?: unknown
  open_in_canvas_view?: boolean
  exclusive_key?: string
  finished_text?: string
  initial_text?: string
  finished_duration_sec?: number
  search_source?: string
  client_reported_search_source?: string
  search_result_groups?: GraphSearchResultGroup[]
  safe_urls?: string[]
  message_locale?: string
  image_results?: unknown
  rebase_developer_message?: boolean
  classifier_response?: string
  reasoning_status?: string
  reasoning_title?: string
  hide_inline_actions?: boolean
  disable_turn_actions?: boolean
  search_queries?: Array<{ type?: string; q?: string }>
  searched_display_string?: string
  debug_sonic_thread_id?: string
  citations?: unknown
  content_references?: unknown
  gizmo_id?: string
  model_slug?: string
  default_model_slug?: string
  parent_run_id?: string
  turn_exchange_id?: string
  weight?: number
  can_save_response?: boolean
  classifier_metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface GraphAttachment {
  id: string
  name?: string
  mime_type?: string
  size?: number
  width?: number
  height?: number
  source?: string
  is_big_paste?: boolean
  metadata?: Record<string, unknown>
}

export interface GraphSearchResultGroup {
  type?: string
  domain?: string
  entries?: GraphSearchResultEntry[]
}

export interface GraphSearchResultEntry {
  type?: string
  url?: string
  title?: string
  snippet?: string
  pub_date?: number | null
  attribution?: string | null
  ref_id?: Record<string, unknown>
}

// ------------------------------
// Asset descriptors (chat.html)
// ------------------------------

export type AssetPointer = string
export type AssetReference = string | AssetDescriptor
export type AssetIndex = Record<AssetPointer, AssetReference>

export interface AssetDescriptor {
  file_path?: string
  mime_type?: string
  mimeType?: string
  download_url?: string
  label?: string
  [key: string]: unknown
}

export interface ResolvedAsset {
  pointer: AssetPointer
  path: string
  mediaType: AssetMediaType
  descriptor?: AssetDescriptor
}

export type AssetMediaType = 'image' | 'audio' | 'video' | 'file'

// --------------------------------------------
// Render-optimized conversation (frontend SLIM)
// --------------------------------------------

export interface Conversation {
  schema_version: 1
  id: string
  title: string
  create_time?: number | null
  update_time?: number | null
  last_message_time: number
  assetsMap?: Record<string, string>
  messages: Message[]
}

export type Role = 'user' | 'assistant' | 'tool' | 'system'

export type Message = UserMessage | AssistantMessage | ToolMessage | SystemMessage

interface BaseMessage<RoleName extends Role = Role> {
  role: RoleName
  id: string
  time?: number | null
  recipient?: string | null
  blocks: Block[]
  details?: Details | null
}

export interface UserMessage extends BaseMessage<'user'> {
  variants?: never
}

export interface ToolMessage extends BaseMessage<'tool'> {
  variants?: never
}

export interface SystemMessage extends BaseMessage<'system'> {
  variants?: never
}

export interface AssistantMessage extends BaseMessage<'assistant'> {
  variants?: MessageVariant[] | null
}

export interface MessageVariant {
  id: string
  time?: number | null
  blocks: Block[]
  details?: Details | null
}

export type Block = MarkdownBlock | CodeBlock | AssetBlock | TranscriptBlock | SeparatorBlock

export interface MarkdownBlock {
  type: 'markdown'
  text: string
}

export interface CodeBlock {
  type: 'code'
  lang?: string
  text: string
}

export interface AssetBlock {
  type: 'asset'
  asset_pointer: string
  mediaType?: 'image' | 'audio' | 'video' | 'file'
  alt?: string
}

export interface TranscriptBlock {
  type: 'transcript'
  text: string
}

export interface SeparatorBlock {
  type: 'separator'
}

export interface SearchDetails {
  kind?: string
  content?: string | null
  queries?: string[]
  sources?: string[]
}

export interface Details {
  thinking?: string | null
  tool?: { name?: string; content: string } | null
  search?: SearchDetails | null
  data?: Record<string, unknown> | null
}

export interface ConversationSummary {
  id: string
  title: string
  snippet: string
  last_message_time: number
  create_time?: number | null
  update_time?: number | null
  mapping_node_count?: number
  saved_at?: number
  source: 'server' | 'local'
  pinned?: boolean
}

export interface GeneratedAsset {
  path: string
  fileName: string
  size?: number
  mime?: string
  pointers?: string[]
}

export interface ExportUserProfile {
  id: string
  email?: string
  chatgpt_plus_user?: boolean
  birth_year?: number | null
}

export interface MessageFeedbackRecord {
  id: string
  conversation_id: string
  user_id: string
  rating: string
  create_time: string
  update_time?: string
  workspace_id?: string | null
  content?: string
  evaluation_name?: string | null
  evaluation_treatment?: string | null
}

export interface GroupChatSummary {
  id: string
  title?: string | null
  create_time?: string | null
  update_time?: string | null
  participant_ids?: string[]
  [key: string]: unknown
}

export interface GroupChatsExport {
  chats: GroupChatSummary[]
}

export interface ShoppingListEntry {
  id?: string
  title?: string
  description?: string | null
  create_time?: string | null
  update_time?: string | null
  [key: string]: unknown
}

export interface BasisPointsExport {
  attachments: Record<string, unknown>[]
  containers: Record<string, unknown>[]
  container_bindings: Record<string, unknown>[]
}

export interface SoraUserProfile {
  id: string
  name?: string | null
  username?: string | null
  is_under_18?: boolean
}

export interface SoraTask {
  id: string
  title?: string | null
  prompt?: string | null
  [key: string]: unknown
}

export interface SoraExport {
  user?: SoraUserProfile
  generations: Record<string, unknown>[]
  tasks: SoraTask[]
  presets: Record<string, unknown>[]
  uploads: Record<string, unknown>[]
}

export interface ExportExtraData {
  user?: ExportUserProfile
  messageFeedback?: MessageFeedbackRecord[]
  groupChats?: GroupChatsExport
  shopping?: ShoppingListEntry[]
  basisPoints?: BasisPointsExport
  sora?: SoraExport
  generatedAssets?: GeneratedAsset[]
}
