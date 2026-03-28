# Synthetic Test Fixtures

`tests/fixtures/syntheticExports.ts` defines small synthetic export ZIP fixtures used by regression tests.

## Fixture Catalog

- `normalSmall`: representative conversations with pinned/unpinned mix and message token metadata.
- `mixedAssets`: linked + unlinked generated assets for gallery/filter style behavior.
- `sparseOptional`: sparse optional fields with minimal metadata.
- `malformedAssetsJson`: `chat.html` with non-strict `assetsJson` object literal style.
- `duplicateSafeUrls`: duplicate/whitespace `safe_urls`, archived flag, and `memory_scope`.
- `pinSort`: multiple pinned conversations with different `pinned_time` values.
- `unusualAssetPaths`: unusual asset path/reference shape that still resolves through fallback matching.
- `minimalUserNoBirthYear`: minimal `tmp/user.json` profile without `birth_year`.
- `onboardingEmpty`: import archive with no conversations for onboarding/empty import scenarios.
- `localizedText`: localized/German-oriented conversation content.
- `messageTypeMatrix`: text/code (TS, Python, Rust), voice memo, image pointer, and file embed in one conversation.
- `extremeLongMessages`: stress-test fixture with very long user/assistant content.
- `specialCharactersAndEncoding`: emoji/unicode/symbol-heavy text payloads.
- `missingFieldsRobustness`: sparse or missing fields in mapping/messages plus one intentionally invalid empty-path conversation.
- `pinnedSearchSystemPrompts`: pinned conversation with multiple system prompts and search-history metadata.

## Why This Exists

These fixtures keep regression tests independent from one large anonymized archive and provide targeted coverage for normal and edge-case import shapes.
