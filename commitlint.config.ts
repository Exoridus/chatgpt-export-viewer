import type { UserConfig } from '@commitlint/types'

const emojiHeaderPattern = /^\p{Extended_Pictographic}(?:\uFE0F)?\s.+/u

const config: UserConfig = {
  plugins: [
    {
      rules: {
        'gitmoji-header': ({ header }) => {
          const valid = typeof header === 'string' && emojiHeaderPattern.test(header)
          return [
            valid,
            "Commit message must start with an emoji, then a space, then a short summary. Example: '✨ Add About modal'",
          ]
        },
      },
    },
  ],
  rules: {
    'header-max-length': [2, 'always', 120],
    'gitmoji-header': [2, 'always'],
  },
}

export default config
