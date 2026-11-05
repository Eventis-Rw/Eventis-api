import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * The Eventis baseline. Rules here exist to prevent a specific, observed failure —
 * not as style preference. If you cannot name the failure a rule prevents, it does not belong.
 */
export default tseslint.config(
  {
    // Build output, and the config files that configure the tooling itself — they are
    // not in any tsconfig, so type-aware linting cannot parse them.
    ignores: [
      'dist/**',
      'build/**',
      '.next/**',
      'coverage/**',
      'node_modules/**',
      'drizzle/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.cjs',
      '**/.*.cjs',
      '**/.*.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  importX.flatConfigs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: process.cwd() },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          project: ['./tsconfig.json', './packages/*/tsconfig.json', './apps/*/tsconfig.json'],
        }),
      ],
    },
    rules: {
      // Correctness
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-param-reassign': 'error',
      'require-atomic-updates': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',

      // `any` is how type safety silently stops existing
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // Import hygiene
      'import-x/no-cycle': ['error', { maxDepth: Infinity }],
      // `bun:test`, `bun:sqlite` etc. are runtime built-ins with no file on disk.
      'import-x/no-unresolved': ['error', { ignore: ['^bun:', '^node:'] }],
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': 'error',
      'import-x/order': [
        'error',
        {
          // No separate 'type' group: a type import sorts with the module it comes from,
          // which is where a reader looks for it.
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // Time and randomness are dependencies. Inject them, do not reach for them.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'Do not read the clock directly. Inject a Clock so the behaviour is testable. Use clock.now().',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/test/**', '**/__tests__/**'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'no-console': 'off',
    },
  },
  prettier,
);
