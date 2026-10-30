const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1505, height: 1045 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:1420');
    await page.getByRole('heading', {name:'A little clarity, on demand.'}).waitFor();
    await page.screenshot({ path: path.join(__dirname, '../docs/ui-preview.png') });
    await page.getByRole('button', {name:'Explain something', exact:true}).click();
    assert.equal(await page.getByRole('textbox', {name:'Message',exact:true}).inputValue(), 'Explain something');
    await page.getByRole('slider', {name:'Panel opacity'}).fill('60');
    assert.equal(await page.locator('.opacity-value').textContent(), '60%');
    await page.getByRole('button', {name:'Settings',exact:true}).click();
    await page.getByRole('heading', {name:'Make it your own.'}).waitFor();
    await page.getByLabel('Model ID', {exact:true}).fill('local-model');
    await page.getByRole('button', {name:'Save settings',exact:true}).click();
    await page.getByRole('textbox', {name:'Message',exact:true}).waitFor();
    await page.getByRole('button', {name:'Send message',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Open the SAA desktop app'}).waitFor();
    await page.getByRole('button', {name:'History',exact:true}).click();
    await page.getByRole('heading', {name:'Your conversations.'}).waitFor();
    assert.equal(await page.locator('.history-row').count(), 1);
    await page.getByRole('button', {name:'New chat',exact:true}).click();
    await page.getByRole('button', {name:'Settings',exact:true}).click();
    await page.screenshot({ path: path.join(__dirname, '../docs/settings-preview.png') });
    await page.getByRole('button', {name:'Back to chat',exact:true}).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('heading', {name:'A little clarity, on demand.'}).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(__dirname, '../docs/mobile-preview.png') });
    assert.deepEqual(errors, []);
    console.log('UI checks passed: desktop/native-size layout, prompts, opacity, settings, visible API boundary, history, mobile overflow, no renderer errors.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
