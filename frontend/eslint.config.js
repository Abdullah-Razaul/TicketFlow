export default [{
  files: ['**/*.{js,jsx}'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', console: 'readonly', fetch: 'readonly', FormData: 'readonly', Date: 'readonly', Number: 'readonly', String: 'readonly', Math: 'readonly', JSON: 'readonly', Promise: 'readonly', Error: 'readonly', setTimeout: 'readonly', import: 'readonly' } },
  rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] }
}];
