const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['build/**', 'dist/**', '.expo/**'] },
  { files: ['tests/**/*.cjs', 'scripts/**/*.cjs'], languageOptions: { globals: { __dirname: 'readonly' } } },
]);
