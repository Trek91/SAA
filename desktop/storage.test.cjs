'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createSettingsTransaction, backupUnreadable } = require('./storage.cjs');

test('concurrent appearance mutation reads the key committed by an earlier settings save', async () => {
  let state = { apiKey: 'old-key', opacity: 0.85 };
  let releaseFirst, enteredFirst;
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const entered = new Promise((resolve) => { enteredFirst = resolve; });
  const writes = [];
  const mutate = createSettingsTransaction({
    get: () => state, validate: (value) => value,
    persist: async (value) => { if (!writes.length) { enteredFirst(); await gate; } writes.push({ ...value }); },
    commit: (value) => { state = value; },
  });
  const keySave = mutate((current) => ({ ...current, apiKey: 'new-key' }));
  await entered;
  const appearanceSave = mutate((current) => ({ ...current, opacity: 0.4 }));
  releaseFirst(); await Promise.all([keySave, appearanceSave]);
  assert.deepEqual(state, { apiKey: 'new-key', opacity: 0.4 });
  assert.deepEqual(writes, [{ apiKey: 'new-key', opacity: 0.85 }, { apiKey: 'new-key', opacity: 0.4 }]);
});

test('failed persistence never commits and does not poison the following transaction', async () => {
  let state = { value: 'original' };
  const mutate = createSettingsTransaction({
    get: () => state, validate: (value) => value,
    persist: async (value) => { if (value.value === 'bad') throw new Error('disk full'); },
    commit: (value) => { state = value; },
  });
  await assert.rejects(mutate(() => ({ value: 'bad' })), /disk full/);
  assert.equal(state.value, 'original');
  await mutate((current) => ({ value: `${current.value}-recovered` }));
  assert.equal(state.value, 'original-recovered');
});

test('recovery preserves exact unreadable bytes even after the original is replaced', async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'saa-storage-test-'));
  t.after(async () => { for (const name of await fs.readdir(folder)) await fs.unlink(path.join(folder, name)); await fs.rmdir(folder); });
  const original = path.join(folder, 'settings.enc');
  const bytes = Buffer.from([0, 1, 255, 8, 0, 42]);
  await fs.writeFile(original, bytes);
  const recovery = await backupUnreadable(original);
  assert.equal(path.dirname(recovery), folder);
  assert.match(recovery, /\.recovery$/);
  assert.deepEqual(await fs.readFile(original), bytes);
  await fs.writeFile(original, 'new data');
  assert.deepEqual(await fs.readFile(recovery), bytes);
  const second = await backupUnreadable(original);
  assert.notEqual(second, recovery);
  assert.equal(await fs.readFile(second, 'utf8'), 'new data');
});
