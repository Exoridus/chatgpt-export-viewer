# Contributing

## Commit Convention (Gitmoji)

This repository uses a simple gitmoji commit format:

- `EMOJI + space + short summary`
- Example: `✨ Add About modal with AGPL hosting notice`

Commits are validated by the local `commit-msg` hook.
Hooks are managed with Husky. After cloning, run `npm install` once to install hooks.

Recommended CLI helper:

```bash
npx gitmoji -c
```

You can also run:

```bash
npm run commit
```

## Version Tag Convention

Release tags must follow strict semantic version tags:

- `vMAJOR.MINOR.PATCH`
- Example: `v1.2.3`

Tag format is validated in local hooks and CI.

## Local Validation

```bash
npm run validate:commit -- --edit .git/COMMIT_EDITMSG
npm run validate:tags
npm run lint
npm run test
```
