import type { Config } from 'stylelint'

const config: Config = {
  extends: [
    'stylelint-config-standard',
    'stylelint-config-standard-scss',
    'stylelint-config-recess-order',
  ],
  ignoreFiles: ['dist/**', 'node_modules/**', 'coverage/**'],
  rules: {
    // Keep SCSS/CSS-in-JS compatibility where needed.
    'selector-class-pattern': null,
    'scss/dollar-variable-pattern': null,
    'value-keyword-case': null,
    'declaration-empty-line-before': null,
    'rule-empty-line-before': null,
    'function-name-case': null,
    'custom-property-pattern': null,
    'property-no-vendor-prefix': null,
    'at-rule-no-vendor-prefix': null,
    'selector-no-vendor-prefix': null,
    'value-no-vendor-prefix': null,
    'order/properties-order': null,
    'color-function-alias-notation': null,
    'color-function-notation': null,
    'alpha-value-notation': null,
    'property-no-deprecated': null,
    'font-family-name-quotes': null,
    'media-feature-range-notation': null,
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['global'],
      },
    ],
    'max-nesting-depth': 4,
    'no-duplicate-selectors': null,
    'no-empty-source': null,
  },
}

export default config
