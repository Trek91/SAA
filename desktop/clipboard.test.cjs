'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readClipboardData, writeClipboardData } = require('./clipboard.cjs');

test('awaits asynchronous text reads and handles a clipboard without images', async () => {
  const value = await readClipboardData({ readText: async () => 'copied question', read: async () => [{ types: ['text/html'] }] });
  assert.deepEqual(value, { text: 'copied question' });
});

test('reads supported image ClipboardItem Blobs without using removed readImage', async () => {
  for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
    const bytes = Buffer.from([0, 42, 255, 7]);
    const value = await readClipboardData({
      readText: async () => '',
      read: async () => [{ types: ['text/html', mime], getType: async (type) => { assert.equal(type, mime); return new Blob([bytes], { type: mime }); } }],
    });
    assert.equal(value.image, `data:${mime};base64,${bytes.toString('base64')}`);
  }
});

test('rejects oversized clipboard images before allocating image bytes', async () => {
  let accessed = false;
  const clipboard = {
    readText: async () => '',
    read: async () => [{ types: ['image/png'], getType: async () => ({ size: 6 * 1024 * 1024 + 1, arrayBuffer: async () => { accessed = true; return new ArrayBuffer(0); } }) }],
  };
  await assert.rejects(readClipboardData(clipboard), /6 MB/);
  assert.equal(accessed, false);
});

test('copy resolves only when the asynchronous native write completes', async () => {
  let release, entered;
  const completed = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  let settled = false;
  const result = writeClipboardData({ writeText: async (text) => { assert.equal(text, 'answer'); entered(); await completed; } }, 'answer').then((value) => { settled = true; return value; });
  await started;
  assert.equal(settled, false);
  release(); assert.equal(await result, true);
  await assert.rejects(writeClipboardData({ writeText: async () => { throw new Error('clipboard busy'); } }, 'answer'), /clipboard busy/);
});
