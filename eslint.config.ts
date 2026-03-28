import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import security from 'eslint-plugin-security';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unicorn from 'eslint-plugin-unicorn';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.vite/**', '.cache/**', 'public/**', '**/*.min.*'],
  },

  // Base JavaScript recommendations
  js.configs.recommended,

  // TypeScript recommended + type-aware strict/stylistic baseline
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // React / Hooks / Vite refresh
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,

  // Accessibility
  jsxA11y.flatConfigs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
      security,
      unicorn,
    },
    rules: {
      // Import management
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': 'off',

      // Core ESLint
      complexity: 'off',
      curly: 'error',
      eqeqeq: ['error', 'always'],
      'guard-for-in': 'error',
      'max-classes-per-file': ['error', 10],
      'max-len': [
        'error',
        {
          code: 160,
          ignoreRegExpLiterals: true,
          ignorePattern: '^import ',
          ignoreUrls: true,
          ignoreTemplateLiterals: true,
          ignoreStrings: false,
        },
      ],
      'max-lines': 'off',
      'no-bitwise': 'error',
      'no-caller': 'error',
      'no-console': 'off',
      'no-eval': 'error',
      'no-extra-bind': 'error',
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1 }],
      'no-nested-ternary': 'off',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-sequences': 'error',
      'no-template-curly-in-string': 'error',
      'no-undef-init': 'error',
      'no-useless-escape': 'warn',
      'no-useless-return': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'prefer-object-spread': 'error',
      'prefer-template': 'error',
      radix: 'error',

      // React
      'react/display-name': 'off',
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
      'react/jsx-key': 'error',
      'react/jsx-no-bind': 'off',
      'react/jsx-no-constructed-context-values': 'error',
      'react/jsx-no-leaked-render': 'error',
      'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
      'react/no-array-index-key': 'off',
      'react/no-danger': 'warn',
      'react/no-find-dom-node': 'warn',
      'react/no-string-refs': ['error', { noTemplateLiterals: true }],
      'react/no-unsafe': 'error',
      'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],

      // React plugin rules not useful here / noisy with TS
      'react/no-unused-prop-types': 'off',
      'react/prop-types': 'off',

      // React hooks / refresh tuning
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',

      // TypeScript correctness
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': false,
          'ts-nocheck': false,
          'ts-check': false,
        },
      ],
      '@typescript-eslint/consistent-indexed-object-style': ['error', 'record'],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: false, fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/default-param-last': 'error',
      '@typescript-eslint/member-delimiter-style': [
        'error',
        {
          multiline: { delimiter: 'semi', requireLast: true },
          singleline: { delimiter: 'comma', requireLast: false },
          multilineDetection: 'brackets',
        },
      ],
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: [
            'signature',
            'public-static-field',
            'protected-static-field',
            'private-static-field',
            'public-instance-field',
            'protected-instance-field',
            'private-instance-field',
            'constructor',
            'public-static-method',
            'protected-static-method',
            'private-static-method',
            'public-instance-method',
            'protected-instance-method',
            'private-instance-method',
          ],
        },
      ],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            arguments: false,
            attributes: false,
          },
        },
      ],
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-shadow': ['error', { hoist: 'all' }],
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/prefer-readonly': 'off',
      '@typescript-eslint/prefer-reduce-type-parameter': 'error',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/prefer-ts-expect-error': 'error',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: false,
          allowAny: false,
          allowNullish: false,
          allowRegExp: false,
        },
      ],
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/unified-signatures': 'error',

      // Accessibility
      'jsx-a11y/no-autofocus': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/anchor-is-valid': 'off',

      // Security
      ...security.configs.recommended.rules,
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-possible-timing-attacks': 'off',
      'security/detect-bidi-characters': 'error',

      // Unicorn
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-useless-undefined': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-default-parameters': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-spread': 'off',
      'unicorn/prefer-ternary': 'off',
      'unicorn/prevent-abbreviations': 'off',
    },
  },

  // Tests / Vitest
  {
    files: ['tests/**/*.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
    plugins: {
      vitest,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...vitest.environments.env.globals,
      },
      parserOptions: {
        project: null,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'no-console': 'off',
      'max-lines': 'off',
      'vitest/no-focused-tests': 'error',
      'vitest/no-identical-title': 'error',
      'vitest/expect-expect': 'off',
    },
  },

  // Node / config files / scripts
  {
    files: [
      '*.config.ts',
      'vite.config.ts',
      'vitest.config.ts',
      'eslint.config.ts',
      'stylelint.config.ts',
      'commitlint.config.ts',
      'scripts/**/*.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
      parserOptions: {
        project: null,
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'unicorn/prefer-node-protocol': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // Prettier compatibility: keep this last
  prettier,
]);
