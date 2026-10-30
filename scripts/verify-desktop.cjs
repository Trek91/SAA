const { _electron, chromium } = require('playwright');
const { expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'saa-desktop-check-'));
  const received = [];
  const server = http.createServer(async (req,res) => {
    if (req.method === 'GET') { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><title>SAA fullscreen check</title><body style="background:#dce4df;color:#213b2c;font:24px Segoe UI;padding:50px"><button onclick="document.documentElement.requestFullscreen()">Enter fullscreen</button><p>Local SAA fullscreen verification</p></body>'); return; }
    let body=''; for await (const chunk of req) body+=chunk;
    received.push(JSON.parse(body));
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.write(`data: ${JSON.stringify({choices:[{delta:{content:'## Connected\n\n'}}]})}\n\n`);
    res.end(`data: ${JSON.stringify({choices:[{delta:{content:'Your custom API is working.'}}]})}\n\ndata: [DONE]\n\n`);
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  let app, browser;
  try {
    app = await _electron.launch(process.env.SAA_TEST_EXECUTABLE
      ? {executablePath:process.env.SAA_TEST_EXECUTABLE,args:[`--user-data-dir=${profile}`],env}
      : {args:[path.join(__dirname,'..'),`--user-data-dir=${profile}`],env});
    await app.evaluate(async({clipboard})=>{globalThis.saaTestClipboard=await clipboard.read();});
    const page = await app.firstWindow();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.getByRole('heading',{name:'A little clarity, on demand.'}).waitFor();
    assert.deepEqual(await app.evaluate(({BrowserWindow})=>{ const w=BrowserWindow.getAllWindows()[0];return {focusable:w.isFocusable(),top:w.isAlwaysOnTop()}; }),{focusable:false,top:true});
    assert.match(await page.locator('.app-shell').evaluate(el=>getComputedStyle(el).backgroundColor),/rgba\(21, 24, 27, 0\.86\)/);
    assert.equal(await page.locator('#root').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    await page.screenshot({path:path.join(__dirname,'../docs/desktop-preview.png')});
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByLabel('API endpoint',{exact:true}).fill(origin+'/chat');
    await page.getByLabel('Model ID',{exact:true}).fill('mock-vision');
    await page.getByLabel('API key',{exact:true}).fill('local-test-key');
    await page.getByRole('button',{name:'Save settings',exact:true}).click();
    await page.getByRole('textbox',{name:'Message',exact:true}).fill('Hello from the desktop check');
    await page.getByRole('button',{name:'Send message',exact:true}).click();
    await page.getByText('Your custom API is working.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Copy answer',exact:true}).click();
    await page.getByRole('button',{name:'Copied',exact:true}).waitFor();
    assert.match(await app.evaluate(({clipboard})=>clipboard.readText()),/custom API is working/);
    await page.getByRole('button',{name:'History',exact:true}).click();
    assert.equal(await page.locator('.history-row').count(),1);
    await page.getByRole('button',{name:'New chat',exact:true}).click();
    // Exercise the narrow clipboard bridge while the host remains non-focusable.
    await page.evaluate(()=>window.saa.writeClipboard('A clipboard question'));
    await page.getByRole('button',{name:'Paste clipboard without taking focus',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Message"]').value==='A clipboard question').catch(async e=>{
      console.log('Paste diagnosis',await page.evaluate(async()=>({clipboard:await window.saa.clipboard(),value:document.querySelector('textarea[aria-label="Message"]').value,notice:document.querySelector('.inline-notice')?.textContent})));
      await page.screenshot({path:path.join(__dirname,'../docs/desktop-diagnosis.png')}); throw e;
    });
    assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'A clipboard question');
    await page.getByRole('button',{name:'Send message',exact:true}).click();
    await page.getByText('Your custom API is working.',{exact:true}).waitFor();
    await page.getByRole('slider',{name:'Panel opacity'}).fill('60');
    await expect.poll(()=>page.evaluate(async()=> (await window.saa.load()).settings.opacity)).toBe(.6);
    const state = await page.evaluate(()=>window.saa.load());
    assert.equal(state.settings.hasKey,true); assert.equal(state.settings.apiKey,'');
    const encrypted = await fs.readFile(path.join(profile,'settings.enc'));
    assert.equal(encrypted.includes(Buffer.from('local-test-key')),false);
    await expect.poll(()=>page.evaluate(async()=> (await window.saa.load()).conversations.length)).toBe(2);
    const dataDirectory=await app.evaluate(({app})=>app.getPath('userData'));
    const disk=JSON.parse(await fs.readFile(path.join(dataDirectory,'conversations.json'),'utf8'));
    assert.equal(disk.length,2); assert.equal(received.length,2);
    // Exercise the new ClipboardItem image API, then verify real request content.
    await app.evaluate(async({ClipboardItem,clipboard,nativeImage})=>{
      const image=nativeImage.createFromBitmap(Buffer.from([0,0,255,255,0,0,255,255,0,0,255,255,0,0,255,255]),{width:2,height:2});
      if(image.isEmpty())throw new Error('The test PNG fixture is empty.');
      await clipboard.write([new ClipboardItem({'image/png':new Blob([new Uint8Array(image.toPNG())],{type:'image/png'})})]);
    });
    await page.getByRole('button',{name:'Paste clipboard without taking focus',exact:true}).click();
    await page.getByRole('button',{name:'Remove Clipboard image',exact:true}).waitFor().catch(async e=>{
      console.log('Image clipboard diagnosis',await app.evaluate(async({clipboard})=>({items:(await clipboard.read()).map(i=>i.types)})),await page.locator('.inline-notice').allTextContents());
      try{console.log('Image bridge result',await page.evaluate(async()=>{const c=await window.saa.clipboard();return {textLength:c.text.length,imageLength:c.image?.length};}));}catch(error){console.log('Image bridge error',error.message);}
      throw e;
    });
    await page.getByRole('textbox',{name:'Message',exact:true}).fill('Describe this pixel.');
    await page.getByRole('button',{name:'Send message',exact:true}).click();
    await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
    assert.equal(received.length,3);
    assert.equal(received[2].messages.at(-1).content[1].type,'image_url');
    await page.getByRole('button',{name:'Compact panel',exact:true}).click();
    await page.getByRole('button',{name:'Expand panel',exact:true}).waitFor({state:'visible'});
    await page.getByRole('button',{name:'Expand panel',exact:true}).click();
    assert.deepEqual(errors,[]);
    // Genuine Chromium DOM fullscreen, in a dedicated disposable browser profile.
    await page.evaluate(()=>window.saa.windowAction('hide'));
    browser=await chromium.launch({channel:'msedge',headless:false});
    const fullscreen=await browser.newPage({viewport:null}); await fullscreen.goto(origin);
    await fullscreen.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
    await fullscreen.waitForFunction(()=>!!document.fullscreenElement&&document.hasFocus());
    await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setFocusable(false);w.showInactive();});
    assert.equal(await fullscreen.evaluate(()=>!!document.fullscreenElement&&document.hasFocus()),true);
    await page.evaluate(()=>window.saa.writeClipboard('Fullscreen clipboard check'));
    await page.getByRole('button',{name:'Paste clipboard without taking focus',exact:true}).click();
    assert.equal(await fullscreen.evaluate(()=>!!document.fullscreenElement&&document.hasFocus()),true);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused()),false);
    await page.evaluate(()=>window.saa.windowAction('clickThrough'));
    assert.equal(await fullscreen.evaluate(()=>!!document.fullscreenElement&&document.hasFocus()),true);
    await page.evaluate(()=>window.saa.windowAction('clickThrough'));
    const capture=await page.evaluate(()=>window.saa.capture());
    assert.match(capture,/^data:image\/png;base64,/);
    assert.equal(await fullscreen.evaluate(()=>!!document.fullscreenElement&&document.hasFocus()),true);
    console.log('Desktop checks passed: native launch, passive/no-focus, transparency, mock API/SSE, copy/paste, encrypted key storage, saved history, compact restore.');
    console.log('Browser fullscreen check passed: Edge DOM fullscreen and document focus preserved while SAA showInactive, clipboard paste, click-through and screen capture ran.');
  } finally {
    if(browser) await browser.close();
    if(app) { await app.evaluate(async({clipboard})=>{if(globalThis.saaTestClipboard?.length)await clipboard.write(globalThis.saaTestClipboard);else clipboard.clear();}).catch(()=>{}); await app.close(); }
    server.close();
    assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()));
    assert.equal(path.basename(profile).startsWith('saa-desktop-check-'),true);
    await fs.rm(profile,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
