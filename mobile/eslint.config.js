// ESLint flat config for the mobile app.
//
// ESLint 9+ uses this format. The Expo preset is extended, then
// project-specific rules are added on top.
//
// Note on import resolution: eslint-config-expo registers a TypeScript
// import resolver that crashes on ESLint 9 when there's no tsconfig.
// ESLint's flat config merges settings rather than replacing them, so
// we can't override it from here. Instead we disable import/no-unresolved
// entirely — Metro resolves the real @/ paths at bundle time, and Jest
// resolves them via moduleNameMapper, so lint doesn't need to duplicate
// that check.

const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,

  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'coverage/**',
      'babel.config.js',
      'eslint.config.js',
    ],
  },

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node,
        __DEV__: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      // Import resolution is Metro's and Jest's job, not ESLint's.
      // eslint-config-expo's bundled TypeScript resolver crashes on
      // projects without a tsconfig, and flat config can't override
      // its settings. Turning these off is the clean fix.
      'import/no-unresolved': 'off',
      'import/namespace': 'off',
      'import/no-duplicates': 'off',

      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
    },
  },

  {
    files: ['__tests__/**/*.{js,jsx}', '*.test.{js,jsx}', 'jest.setup.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
]);