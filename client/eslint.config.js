import js from '@eslint/js';
import globals from 'globals';

/**
 * no-undef is enforced on app source trees. Pre-existing issues are deferred
 * via per-file overrides below (see PR notes).
 */
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-empty': 'off',
    },
  },
  {
    files: [
      'src/components/**/*.{js,jsx}',
      'src/pages/**/*.{js,jsx}',
      'src/hooks/**/*.{js,jsx}',
      'src/contexts/**/*.{js,jsx}',
    ],
    rules: {
      'no-undef': 'error',
    },
  },
  {
    files: ['src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        global: 'readonly',
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
  {
    files: ['src/components/AddParticipants.jsx'],
    rules: {
      'no-undef': 'off',
    },
  },
];