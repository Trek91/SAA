'use strict';

// Electron 45 uses the asynchronous ClipboardItem/Blob API in the main process.
async function readClipboardData(clipboard) {
  const [rawText, items] = await Promise.all([clipboard.readText(), clipboard.read()]);
  const text = rawText.slice(0, 200000);
  for (const item of items) {
    const mime = ['image/png', 'image/jpeg', 'image/webp'].find((type) => item.types.includes(type));
    if (!mime) continue;
    const blob = await item.getType(mime);
    if (!blob || !Number.isFinite(blob.size) || typeof blob.arrayBuffer !== 'function') throw new Error('Clipboard returned an unsupported image payload.');
    if (blob.size > 6 * 1024 * 1024) throw new Error('Clipboard image is too large (6 MB maximum).');
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (!bytes.length) continue;
    return { text, image: `data:${mime};base64,${bytes.toString('base64')}` };
  }
  return { text };
}

async function writeClipboardData(clipboard, text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 4 * 1024 * 1024) throw new Error('Copy text must be smaller than 4 MB.');
  await clipboard.writeText(text);
  return true;
}

module.exports = { readClipboardData, writeClipboardData };
