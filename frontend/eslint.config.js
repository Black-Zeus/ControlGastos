import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'evidencias-barrido-*'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Reglas clásicas de hooks. Las reglas nuevas de react-hooks 7 orientadas al React
      // Compiler (set-state-in-effect, static-components, preserve-manual-memoization…)
      // exigirían reescribir patrones válidos del código actual; se evaluarán aparte.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', {
        allowConstantExport: true,
        // Hooks de contexto y helpers que conviven con su componente a propósito.
        allowExportNames: ['useAuth', 'useAdminAuth', 'useTheme', 'fmtMoney', 'pwdStrength'],
      }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
)
