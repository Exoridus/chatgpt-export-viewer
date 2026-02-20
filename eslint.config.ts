import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'
import unusedImports from 'eslint-plugin-unused-imports'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {},
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // Autofix-friendly rules
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'curly': 'error',
      'eqeqeq': ['error', 'always'],
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'no-useless-return': 'error',
      'object-shorthand': 'error',
      'prefer-object-spread': 'error',
      'prefer-template': 'error',
      'max-len': [
        'warn',
        {
          code: 140,
          ignoreRegExpLiterals: true,
          ignorePattern: '^import ',
          ignoreUrls: true,
          ignoreTemplateLiterals: true,
        },
      ],

      // Added from strict profile but intentionally disabled here (non-autofix / high-noise).
      // 'complexity': ['error', { max: 15 }],
      // 'max-lines': ['error', 666],
      // 'no-console': 'warn',
      // 'no-nested-ternary': 'error',
      // 'react/no-array-index-key': 'error',
      // '@typescript-eslint/no-floating-promises': 'error',
      // '@typescript-eslint/no-misused-promises': 'error',

      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
])
