import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src/api/generated'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The component library is the only place that knows Radix exists, so
      // it can be swapped without touching the app.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['radix-ui', '@radix-ui/*'], message: 'Import from @/components/ui instead.' },
            { group: ['../*'], message: 'Use the @/ alias for anything outside this folder.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['../*'], message: 'Use the @/ alias for anything outside this folder.' }] },
      ],
    },
  },
);
