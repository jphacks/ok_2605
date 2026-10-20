const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDatabase } = require('./helpers/database.cjs');
const {
  createNotificationPermissionRequester,
  wasNotificationPermissionRequested,
  markNotificationPermissionRequested,
} = require('../src/features/reminders/notification-permission.ts');

function api(db, permission = { status: 'denied', granted: false, canAskAgain: true }) {
  const calls = [];
  return {
    calls,
    async prepare() { calls.push('channel'); },
    async get() { calls.push('get'); return permission; },
    async request() { calls.push('request'); return permission; },
    wasRequested: () => wasNotificationPermissionRequested(db),
    markRequested: () => markNotificationPermissionRequested(db),
  };
}

test('fresh Android denied status still requests the native permission after creating the channel', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  const adapter = api(db);
  await createNotificationPermissionRequester(adapter)('initial');
  assert.deepEqual(adapter.calls, ['channel', 'get', 'request']);
  assert.equal(await wasNotificationPermissionRequested(db), true);
});

test('simultaneous initial requests and a provider remount prompt only once', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  const adapter = api(db);
  const request = createNotificationPermissionRequester(adapter);
  await Promise.all([request('initial'), request('initial'), request('none')]);
  await createNotificationPermissionRequester(adapter)('initial');
  assert.equal(adapter.calls.filter((call) => call === 'request').length, 1);
  await request('explicit');
  assert.equal(adapter.calls.filter((call) => call === 'request').length, 2);
});

test('an already granted or permanently denied permission never opens the OS dialog', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  for (const permission of [
    { status: 'granted', granted: true, canAskAgain: true },
    { status: 'denied', granted: false, canAskAgain: false },
  ]) {
    const adapter = api(db, permission);
    const request = createNotificationPermissionRequester(adapter);
    await request('initial');
    await request('explicit');
    assert.ok(!adapter.calls.includes('request'));
  }
});

test('ordinary schedule refreshes do not prompt or consume the initial request', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  const adapter = api(db);
  await createNotificationPermissionRequester(adapter)('none');
  assert.deepEqual(adapter.calls, ['channel', 'get']);
  assert.equal(await wasNotificationPermissionRequested(db), false);
});

test('a failed native request is retryable without marking the prompt complete', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  const adapter = api(db);
  let failed = false;
  const request = createNotificationPermissionRequester({ ...adapter, request: async () => {
    if (!failed) { failed = true; throw Error('activity not ready'); }
    return adapter.request();
  } });
  await assert.rejects(request('initial'), /activity not ready/);
  assert.equal(await wasNotificationPermissionRequested(db), false);
  await request('initial');
  assert.equal(await wasNotificationPermissionRequested(db), true);
});

test('the initial prompt decision survives closing and reopening the database', async (t) => {
  const { mkdtempSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'nomupay-permission-'));
  const { db, close, reopen } = createDatabase(join(directory, 'permission.sqlite'));
  t.after(() => { close(); rmSync(directory, { recursive: true }); });
  await markNotificationPermissionRequested(db);
  reopen();
  const adapter = api(db);
  await createNotificationPermissionRequester(adapter)('initial');
  assert.ok(!adapter.calls.includes('request'));
});

test('fresh iOS undetermined permission requests the standard dialog once before any medication exists', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  const adapter = api(db, { status: 'undetermined', granted: false, canAskAgain: true, ios: { status: 0 } });
  const request = createNotificationPermissionRequester(adapter);
  await request('initial');
  await request('initial');
  assert.equal(adapter.calls.filter((call) => call === 'request').length, 1);
  assert.equal(await wasNotificationPermissionRequested(db), true);
});

test('iOS denial is not prompted again automatically or by an explicit request', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  let permission = { status: 'undetermined', granted: false, canAskAgain: true, ios: { status: 0 } };
  let prompts = 0;
  const request = createNotificationPermissionRequester({
    ...api(db),
    get: async () => permission,
    request: async () => {
      prompts++;
      permission = { status: 'denied', granted: false, canAskAgain: false, ios: { status: 1 } };
      return permission;
    },
  });
  await request('initial');
  await request('initial');
  const denied = await request('explicit');
  assert.equal(prompts, 1);
  assert.equal(denied.canAskAgain, false);
});

test('permission granted in iOS Settings is picked up without another dialog', async (t) => {
  const { db, close } = createDatabase(); t.after(close);
  await markNotificationPermissionRequested(db);
  const adapter = api(db, { status: 'granted', granted: true, canAskAgain: true, ios: { status: 2 } });
  const result = await createNotificationPermissionRequester(adapter)('none');
  assert.equal(result.granted, true);
  assert.ok(!adapter.calls.includes('request'));
});
