'use strict';
const {_electron}=require('playwright'),{expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{once}=require('node:events'),{spawnSync}=require('node:child_process');
(async()=>{
 if(process.platform!=='darwin')throw Error('Run this check on macOS.');
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'saa-macos-check-')),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const driver=path.resolve(process.env.SAA_MAC_DRIVER||path.join(profile,'MacInputDriver'));
 if(!process.env.SAA_MAC_DRIVER){const result=spawnSync('xcrun',['clang','-fobjc-arc','-framework','Cocoa','-framework','ApplicationServices',path.join(__dirname,'MacInputDriver.m'),'-o',driver],{stdio:'inherit'});assert.equal(result.status,0);}
 const input=(...args)=>{const r=spawnSync(driver,args.map(String),{encoding:'utf8'});if(r.status!==0)throw Error(`Native fixture input failed: ${r.stderr}`);return r.stdout.trim();};
 const received=[];let app,browser;const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'){if(req.url==='/v1/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'mac-fixture-model'}]}));}else{res.setHeader('Content-Type','text/html');res.end('<title>SAA isolated fullscreen fixture</title><body style="background:#263b45;color:white"><button onclick="document.documentElement.requestFullscreen()">Enter fullscreen</button><input id="browser-input" value="untouched"><p>This browser must keep fullscreen and focus.</p></body>');}return;}
  let body='';for await(const chunk of req)body+=chunk;received.push({body:JSON.parse(body),key:req.headers.authorization});res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: {"choices":[{"delta":{"content":"Mac provider reply."}}]}\n\ndata: [DONE]\n\n');
 });server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  const fixture=path.join(profile,'browser.cjs');await fs.writeFile(fixture,`const{app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1300,height:900,title:'SAA isolated browser fixture'});w.loadURL(${JSON.stringify(origin)});});app.on('window-all-closed',()=>app.quit());`);
  browser=await _electron.launch({args:[fixture,`--user-data-dir=${path.join(profile,'browser')}`],env});const browserPage=await browser.firstWindow();
  app=await _electron.launch({executablePath:process.env.SAA_TEST_EXECUTABLE,args:process.env.SAA_TEST_EXECUTABLE?[`--user-data-dir=${profile}`]:[path.join(__dirname,'..'),`--user-data-dir=${profile}`],env});
  const page=await app.firstWindow();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>{window.saaMacPackets=[];window.saa.onPassiveInput(e=>{window.saaMacPackets.push({type:e.type,kind:e.kind,x:e.x,y:e.y});if(window.saaMacPackets.length>12)window.saaMacPackets.shift();});});
  const permissions=await page.evaluate(()=>window.saa.permissions('status'));console.log('Mac permission status:',permissions);
  assert.equal(permissions.platform,'darwin');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  for(const [id,key]of[['openai','open-key'],['openrouter','router-key'],['custom','custom-key'],['local','local-key']]){
   await page.evaluate(async({id,key,origin})=>window.saa.saveProvider(id,{endpoint:origin+'/v1',model:'mac-fixture-model',apiKey:key}),{id,key,origin});
   await page.evaluate(id=>window.saa.selectProvider(id),id);
   const validation=await page.evaluate(({id,origin})=>window.saa.validateProvider(id,{endpoint:origin+'/v1'}),{id,origin});assert.deepEqual(validation.models,['mac-fixture-model']);
  }
  await page.getByRole('button',{name:'Back to chat',exact:true}).click();
  for(const id of['openai','openrouter','custom','local']){
   await page.evaluate(id=>window.saa.selectProvider(id),id);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Test '+id);await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
  }
  assert.deepEqual(received.map(r=>r.key),['Bearer open-key','Bearer router-key','Bearer custom-key','Bearer local-key']);
  await page.getByRole('button',{name:'Copy answer',exact:true}).last().click();await expect.poll(()=>page.evaluate(async()=>(await window.saa.clipboard()).text)).toBe('Mac provider reply.');
  await page.evaluate(()=>window.saa.writeClipboard('Clipboard works on Mac'));await page.getByRole('button',{name:'Paste clipboard without taking focus',exact:true}).click();await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Clipboard works on Mac');
  await app.evaluate(async({ClipboardItem,clipboard,nativeImage})=>{const image=nativeImage.createFromBitmap(Buffer.from([0,0,255,255,0,0,255,255,0,0,255,255,0,0,255,255]),{width:2,height:2});await clipboard.write([new ClipboardItem({'image/png':new Blob([new Uint8Array(image.toPNG())],{type:'image/png'})})]);});
  await page.getByRole('button',{name:'Attach image',exact:true}).click();await page.getByRole('button',{name:'Remove Clipboard image',exact:true}).waitFor();await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByRole('button',{name:'Retry',exact:true}).waitFor();assert.equal(received.at(-1).body.messages.at(-1).content[1].type,'image_url');
  await page.getByRole('slider',{name:'Panel opacity'}).fill('65');await expect.poll(()=>page.evaluate(async()=>(await window.saa.load()).settings.opacity)).toBe(.65);
  await page.getByRole('button',{name:'Compact panel',exact:true}).click();await page.getByRole('button',{name:'Expand panel',exact:true}).click();
  await page.evaluate(()=>window.saa.savePrivacy({captureExclusion:false}));assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isContentProtected()),false);await page.evaluate(()=>window.saa.savePrivacy({captureExclusion:true}));
  await page.evaluate(()=>window.saa.windowAction('hide'));const browserPID=await browser.evaluate(()=>process.pid);input('focus',browserPID);await browserPage.getByRole('button',{name:'Enter fullscreen',exact:true}).click();await browserPage.waitForFunction(()=>!!document.fullscreenElement&&document.hasFocus());
  // Reopening must use the actual application path, which re-enables the router.
  await app.evaluate(({app})=>app.emit('second-instance'));await expect.poll(()=>browserPage.evaluate(()=>!!document.fullscreenElement&&document.hasFocus())).toBe(true);
  // Fail rather than treating a permissions-limited run as a successful input test.
  await expect.poll(()=>page.evaluate(async()=>(await window.saa.permissions('status')).passiveReady),{timeout:15000}).toBe(true);
  assert.equal(input('status'),'trusted');
  async function click(locator){await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();assert.ok(b);const p=await app.evaluate(({BrowserWindow},box)=>{const r=BrowserWindow.getAllWindows()[0].getContentBounds();return{x:r.x+box.x+box.width/2,y:r.y+box.y+box.height/2};},b);input('click',browserPID,p.x,p.y);}
  await page.evaluate(()=>{document.querySelector('textarea[aria-label="Message"]').value='';});
  await click(page.getByRole('textbox',{name:'Message',exact:true}));try{await expect.poll(()=>page.locator('.passive-editing').count()).toBe(1);}catch(e){console.log('Native click diagnosis',await page.evaluate(()=>({packets:window.saaMacPackets,footer:document.querySelector('.status-footer')?.textContent})),await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return{bounds:w.getBounds(),content:w.getContentBounds(),visible:w.isVisible(),focused:w.isFocused(),source:w.getMediaSourceId()};}));throw e;}
  input('key',browserPID,0,1048576); // Command+A
  input('text',browserPID,'Native Mac passive typing');await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Native Mac passive typing');
  assert.equal(input('foreground'),String(browserPID));assert.equal(await browserPage.evaluate(()=>!!document.fullscreenElement&&document.hasFocus()),true);
  input('key',browserPID,53);await expect.poll(()=>page.locator('.passive-editing').count()).toBe(0);await click(page.getByRole('textbox',{name:'Message',exact:true}));
  await click(page.getByRole('button',{name:'Send message',exact:true}));await page.getByRole('button',{name:'Retry',exact:true}).waitFor();assert.equal(received.at(-1).body.messages.at(-1).content,'Native Mac passive typing');
  assert.equal(await browserPage.locator('#browser-input').inputValue(),'untouched');assert.equal(input('foreground'),String(browserPID));assert.equal(await browserPage.evaluate(()=>!!document.fullscreenElement&&document.hasFocus()),true);
  await page.evaluate(()=>window.saa.windowAction('clickThrough'));assert.equal(await browserPage.evaluate(()=>!!document.fullscreenElement&&document.hasFocus()),true);await page.evaluate(()=>window.saa.windowAction('clickThrough'));
  input('key',browserPID,49,1179648);await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);input('key',browserPID,49,1179648);await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);assert.equal(await browserPage.evaluate(()=>!!document.fullscreenElement&&document.hasFocus()),true);
  const captured=await page.evaluate(()=>window.saa.capture());assert.match(captured,/^data:image\/png;base64,/);assert.equal(await browserPage.evaluate(()=>!!document.fullscreenElement&&document.hasFocus()),true);
  await page.evaluate(()=>window.saa.windowAction('mode'));assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocusable()),true);await page.evaluate(()=>window.saa.windowAction('mode'));
  assert.deepEqual(errors,[]);console.log('PASS Mac: four providers/auth/validation, SSE, clipboard text/image attachments, opacity, compact, privacy preference, native passive mouse/key/send over Chromium fullscreen with browser focus preserved, click-through, screen capture, and mode switching.');
 }finally{if(app)await app.close();if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));assert.equal(path.dirname(profile),os.tmpdir());assert.ok(path.basename(profile).startsWith('saa-macos-check-'));await fs.rm(profile,{recursive:true,force:true,maxRetries:3});}
})().catch(e=>{console.error(e);process.exitCode=1;});
