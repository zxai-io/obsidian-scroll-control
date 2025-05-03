import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    // Global ignores
    ignores: [
      'dist/',
      'main.js',
      'node_modules/',
      'esbuild.config.mjs',
      '.prettierrc.js',
      'eslint.config.mjs',
    ],
  },
  // Base JS recommended config
  eslint.configs.recommended,
  {
    // Global settings for all JS/TS files
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node, // Includes node globals
        // Add electron globals if specific ones are needed
        // but usually not necessary as 'electron' is externalized
      },
    },
    rules: {
      'no-console': 'warn', // Replace with Notice or logger
    },
  },
  // TypeScript specific configurations
  {
    files: ['**/*.ts'],
    extends: [
      // Recommended TS rules
      ...tseslint.configs.recommendedTypeChecked,
      // Recommended stylistic rules ONLY for type-checked files
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Enforce strict types, disallow 'any'
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Add other strict rules as needed
      // 'require-jsdoc': 'warn', // Consider enabling later if needed
    },
  },
  // Prettier config - must be last
  prettierConfig,
)
