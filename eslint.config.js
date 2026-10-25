import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [{ ignores: ['node_modules', 'dist', 'supabase/functions', '.cache', '.cache/**', 'test-results', 'playwright-report'] }, js.configs.recommended, {
  files: ['src/**/*.{ts,tsx}'],
  languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } }, globals: { window: 'readonly', document: 'readonly', crypto: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', fetch: 'readonly', Response: 'readonly', URLSearchParams: 'readonly', sessionStorage: 'readonly', history: 'readonly' } },
  plugins: { '@typescript-eslint': tseslint, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
  rules: { ...reactHooks.configs.recommended.rules, 'react-refresh/only-export-components': 'off', 'no-unused-vars': 'off', '@typescript-eslint/no-explicit-any': 'error' },
}];
