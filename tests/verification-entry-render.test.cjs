const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// A render-only harness, deliberately BEFORE focus/effects run. These assertions
// cover the stale-ready frame that repository-only tests cannot detect.
const source = readFileSync(join(__dirname, '../src/features/verification/verification-entry-screen.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function render({ allowReader = true, attempt = 'tap-2', savedAttempt = attempt } = {}) {
  const params = { medicationId: '1', scheduledDay: '2026-10-18', notificationKey: 'notice:123', entryAttempt: attempt };
  const savedKey = JSON.stringify(['1', '2026-10-18', undefined, 'notice:123', savedAttempt, allowReader, 0]);
  const states = [true, 0, false, '', { key: savedKey, decision: { kind: 'ready', medicationName: '朝の薬', deadlineAt: '2026-10-18T23:00:00Z' } }];
  let stateIndex = 0;
  const jsx = (type, props) => ({ type, props });
  const reader = function Reader() { throw new Error('native scanner must not mount in this harness'); };
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useState: () => [states[stateIndex++], () => {}], useEffect: () => {}, useCallback: (value) => value },
    'expo-notifications': {},
    'expo-router': { Stack: { Screen: 'Stack.Screen' }, useFocusEffect: () => {}, useLocalSearchParams: () => params, useRouter: () => ({}) },
    'react-native': { ActivityIndicator: 'ActivityIndicator', AppState: { currentState: 'active' }, Pressable: 'Pressable', StyleSheet: { create: (value) => value }, Text: 'Text' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/medication-screen': { medicationColors: {} },
    '@/features/medications/database': {},
    '@/state/penalty-context': { usePenalties: () => ({ refresh: async () => {} }) },
    './verification-screen': { __esModule: true, default: reader },
    './verification-entry': {},
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected import: ${name}`);
    return modules[name];
  } });
  return { tree: exports.default({ allowReader }), reader };
}

test('a fresh tap cannot render the ready state cached for the previous tap before effects run', () => {
  const { tree, reader } = render({ savedAttempt: 'tap-1' });
  assert.notEqual(tree.type, reader);
});

test('the verification-result route cannot render NFC/QR even with a cached ready decision', () => {
  const { tree, reader } = render({ allowReader: false });
  assert.notEqual(tree.type, reader);
});

test('the normal verification route can render a ready decision for the current tap', () => {
  const { tree, reader } = render();
  assert.equal(tree.type, reader);
});
