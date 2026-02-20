# ChatGPT Data Export Viewer

ChatGPT Data Export Viewer is a static React + TypeScript SPA that merges an optional hosted SLIM dataset (generated into `dist/` via the native importer) with conversations imported from official ChatGPT data export ZIP files. Everything runs locally in the browser unless you explicitly publish generated files.

License: **AGPL-3.0-or-later**.

## Features

- Import ChatGPT export ZIP files (drag-and-drop via file picker) and convert them to the SLIM runtime schema.
- Merge server conversations with local IndexedDB entries; pinned conversations float to the top.
- ChatGPT-inspired UI with virtualized sidebar, markdown rendering, hybrid code previews, optional CodeMirror viewer, assistant variants, and collapsible thinking/tool/search metadata.
- Two-stage trigram search palette (Ctrl/Cmd + F or K) with snippets, context lines, and jump-to-hit highlighting.
- Gallery view for generated assets, grouped by whether they still appear in a conversation.
- Settings modal with cache toggle, server-compatible export, cleanup, and purge options (with live size estimates).
- Markdown export per conversation, asset resolution for both server and locally cached files, and GitHub Pages deep-link fallback (`public/404.html`).

## Usage

### Hosted SPA (GitHub Pages)

The app uses `HashRouter`, so the same build works at `/` and in subdirectories (`/repo/#/conversation-id`).

- Pages URL pattern: `https://<owner>.github.io/<repo>/`
- Example (replace placeholders): `https://your-user.github.io/ChatGPTDataExportViewer/`
- Releases + Pages are published automatically by the workflow on pushes to `main` (or manual trigger).

If you host a modified version for users over a network (SaaS/self-host for others), AGPL requires you to offer the complete corresponding source code of the deployed version to those users.

### Recommended Self-Hosting Flow (Release ZIP)

1. Open the latest GitHub release and download `dist.zip`.
2. Extract it on your server/host filesystem.
3. Copy one or more ChatGPT export ZIP files into that extracted folder.
4. Run the included importer executable in that folder:

   ```bash
   ./import-dataset
   # optional output override:
   ./import-dataset --out ./public ./exports/*.zip
   ```

5. Serve the folder as static files (`index.html`, `assets/*`, `conversations.json`, `conversations/*`, `import-dataset` optional to keep).

The executable has no Node.js runtime dependency and writes server-ready static files directly.

<details>
<summary>Advanced setup (clone + npm build)</summary>

1. Clone this repository.
2. Install dependencies: `npm install`
3. Build app + copy CLI to dist: `npm run dist`
4. Import exports into dist:

   ```bash
   npm run import -- "./*.zip"
   npm run import -- --mode replace "./exports/**/*.zip"
   npm run import -- --mode clone "./exports/**/*.zip"
   ```

5. Deploy `dist/` to your static host.

</details>

### Privacy

- The app never uploads your ZIP files or IndexedDB contents; everything happens in-browser.
- Local caching is opt-in. Toggle **Cache in IndexedDB** inside Settings to allow automatic reuse; otherwise, conversations live only for the current tab session.
- “Purge Database” wipes IndexedDB and clears the limited localStorage keys (`importsAvailable`, `cacheConversations`).

### Development

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

Deploy `dist/` to your preferred static host.

### Tests

```bash
npm run test
```

Test coverage includes:
- Browser-side ZIP parsing (`src/lib/importer.ts`) using an anonymized export fixture.
- Server-side dataset generation modes (`upsert`, `replace`, `clone`) via `scripts/shared/datasetImporter.ts`.
- Frontend import modal mode selector behavior and copy.

Fixture management:
- `tests/fixtures/anonymized-export.zip` is a reduced (10 conversations), anonymized dataset derived from a real ChatGPT export ZIP.
- Regenerate it with `npm run fixture:test-zip -- <path-to-export.zip>`. The fixture script replaces image/audio payloads with minimal test files while preserving import structure.

## Server Dataset Builder

Use `npm run import` to convert one or more ChatGPT export ZIP files into the static server format **inside `dist/`** (`dist/conversations.json`, `dist/conversations/<id>/conversation.json`, optional assets, and `dist/search_index.json`). By default the command glob-matches `./*.zip` from the repo root. Override the glob (directories or files) by passing positional arguments, e.g.:

```bash
npm run import -- "./chatgpt-export.zip"
npm run import -- "./exports/**/*.zip"
npm run import -- --mode replace "./exports/**/*.zip"
npm run import -- --mode clone "./exports/**/*.zip"
```

Mode behavior (same wording as the import modal):
- `Import newer and missing entries` (`--mode upsert`, default): imports newer conversations and adds conversations that do not exist yet.
- `Import and replace all existing entries` (`--mode replace`): clears existing dataset files before importing selected archives.
- `Import missing entries and clone when timestamps differ` (`--mode clone`): imports missing conversations and keeps both versions when timestamps differ by writing a suffixed copy ID.

Run the command **after** `npm run dist` so the build artifacts remain intact.

## Standalone CLI Importer

- Build the native binary with `npm run build:cli`. It outputs to `dist/import-dataset`.
- `dist/import-dataset` supports the same mode values and behavior described above (`upsert`, `replace`, `clone`).
- Usage examples:

  ```bash
  ./dist/import-dataset                           # imports ./*.zip into ./ (current directory)
  ./dist/import-dataset --out ./dist ./exports/*.zip
  ./dist/import-dataset --mode clone ./exports/*.zip
  ./dist/import-dataset --mode replace ./exports/*.zip
  npm run import -- "./exports/**/*.zip"          # convenience wrapper that writes to dist/
  ```

- Outputs:
  - `${out}/conversations.json`
  - `${out}/conversations/<id>/conversation.json`
  - `${out}/assets/...`
  - `${out}/search_index.json`

## CI/CD (Lint/Test/Build/Release/Deploy)

`.github/workflows/ci-cd.yml`:

- `push` + `pull_request`: always run lint and tests
- `push` tag (`v*`): run build -> release -> deploy (GitHub Pages)
- `workflow_dispatch`: manual run entrypoint (release/deploy still require a tag ref)

Release notes are generated from gitmoji commit messages via:

```bash
bash scripts/generate-release-notes.sh <tag> <owner/repo>
```

Template:

- `.github/templates/release-notes.md`

Release flow:
1. Create a valid tag (`vMAJOR.MINOR.PATCH`)
2. Push the tag
3. Workflow builds `dist/` (+ `dist/import-dataset`), adds SHA-256 checksums to release notes, publishes GitHub Release, then deploys the same artifact to Pages

## Commit and Tag Conventions

- Commits use gitmoji style: `EMOJI + space + summary`
- Tags must use `vMAJOR.MINOR.PATCH` (for example `v1.4.0`)
- Use `npm run commit` (or `npx gitmoji -c`) for guided commit creation
- See `CONTRIBUTING.md` for details

---

## Acceptance Checklist

- [x] First load performs fetch-only initialization (no IndexedDB/localStorage writes until allowed).
- [x] Sidebar import button ingests ChatGPT ZIP files, converts to SLIM JSON, and sets `importsAvailable`.
- [x] Local/server indexes merge with latest `last_message_time` and pinned grouping; virtualized list scales to thousands.
- [x] Search palette (Ctrl/Cmd + F or K) builds a trigram index, loads lazily, and jumps to anchored messages while auto-expanding matching code previews.
- [x] Conversation viewer renders markdown, hybrid code previews, optional CodeMirror, assistant variants, collapsed details, and per-message anchors (`msg-<id>`).
- [x] Settings modal exposes cache toggle, export ZIP (server-compatible), cleanup (server-wins), and purge (IndexedDB + localStorage.clear) with size estimates.
- [x] Export Markdown button emits a `.md` snapshot with blocks, variants, and collapsed detail sections.
- [x] GitHub Pages deep links work via `public/404.html` + runtime redirect handler.
