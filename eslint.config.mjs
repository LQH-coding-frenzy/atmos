import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      '**/dist/**',
      'apps/web/public/maplibre/**',
      '**/coverage/**',
      '**/.vercel/**',
      'weather-dashboard-rough-design-example/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['scripts/**/*.mjs', 'jobs/**/*.mjs', 'apps/web/scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['apps/web/public/sw.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
);
