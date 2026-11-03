import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist', 'dev-dist', 'coverage', 'legacy', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/engine/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    // SPEC.md section 2 and acceptance criterion 2: the engine is pure.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'navigator',
        'fetch',
        'performance',
        'setTimeout',
        'setInterval',
        'console',
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'The engine never reads the clock. Pass today in.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'The engine never reads the clock. Pass today in.',
        },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: ['**/ui/**', '**/data/**', 'idb', 'preact', 'preact/*'] },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
);
