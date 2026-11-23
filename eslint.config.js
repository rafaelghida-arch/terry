// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'server/*', 'modules/*/android/*', 'modules/*/ios/*'] },
  {
    // O app não usa o React Compiler. Os players do expo-video/expo-audio são objetos
    // nativos imperativos (player.currentTime = t é a API documentada), e os "refs do
    // valor mais recente" são intencionais. Mantemos essas regras como aviso.
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]);
