const {_electron,chromium}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {spawnSync}=require('node:child_process');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'saa-input-regression-'));
 const driver=path.join(profile,'NativeInputDriver.exe');
 const result=spawnSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/platform:x64',`/out:${driver}`,path.join(__dirname,'NativeInputDriver.cs')],{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw new Error(result.stdout+result.stderr);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app,browser;
 try{
  app=await _electron.launch(process.env.SAA_TEST_EXECUTABLE?{executablePath:process.env.SAA_TEST_EXECUTABLE,args:[`--user-data-dir=${profile}`],env}:{args:[path.join(__dirname,'..'),`--user-data-dir=${profile}`],env});
  const page=await app.firstWindow();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
  browser=await chromium.launch({channel:'msedge',headless:false});const fullscreen=await browser.newPage({viewport:null});
  await fullscreen.setContent('<title>SAA input regression browser</title><button onclick="document.documentElement.requestFullscreen()">Fullscreen</button>');
  await fullscreen.getByRole('button',{name:'Fullscreen',exact:true}).click();await fullscreen.waitForFunction(()=>!!document.fullscreenElement&&document.hasFocus());
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.showInactive();w.moveTop();});
  const hwnd=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString());
  const nativePid=await app.evaluate(()=>process.pid);
  function input(...args){const r=spawnSync(driver,[hwnd,String(nativePid),...args],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error(r.stderr||r.stdout);}
  async function position(locator){await locator.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest'}));const box=await locator.boundingBox();assert.ok(box);return app.evaluate(({BrowserWindow,screen},p)=>{const b=BrowserWindow.getAllWindows()[0].getContentBounds();return screen.dipToScreenPoint({x:Math.round(b.x+p.x),y:Math.round(b.y+p.y)});},{x:box.x+box.width/2,y:box.y+box.height/2});}
  async function click(locator){const point=await position(locator);input('move',String(point.x),String(point.y));input('click',String(point.x),String(point.y));}
  async function intact(){input('focus');assert.equal(await fullscreen.evaluate(()=>!!document.fullscreenElement&&document.hasFocus()),true);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused()),false);}
  const settingsButton=page.getByRole('button',{name:'Settings',exact:true});
  const hoverPoint=await position(settingsButton);
  // The native helper starts independently of the renderer. Generate real movement
  // while waiting for its first delivered hover; never assume a warm CLR startup.
  await expect.poll(async()=>{input('enter',String(hoverPoint.x),String(hoverPoint.y));return settingsButton.evaluate(el=>el.matches(':hover,.passive-hover'));},{timeout:15000}).toBe(true);
  await expect.poll(()=>settingsButton.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');await intact();
  const bounds=await app.evaluate(({BrowserWindow,screen})=>screen.dipToScreenRect(BrowserWindow.getAllWindows()[0],BrowserWindow.getAllWindows()[0].getBounds()));
  input('leave',String(bounds.x-20),String(hoverPoint.y));
  await expect.poll(()=>settingsButton.evaluate(el=>el.matches(':hover,.passive-hover'))).toBe(false);await intact();
  await click(page.getByRole('button',{name:'Active provider',exact:true}));await click(page.getByRole('menuitemradio',{name:'OpenRouter',exact:true}));
  await expect(page.getByRole('button',{name:'Active provider',exact:true})).toHaveText('OpenRouter');await intact();
  await click(page.getByRole('button',{name:'Active provider',exact:true}));await click(page.getByRole('menuitemradio',{name:'OpenAI',exact:true}));
  await expect(page.getByRole('button',{name:'Active provider',exact:true})).toHaveText('OpenAI');await intact();
  await click(page.getByRole('button',{name:'Settings',exact:true}));await page.getByRole('heading',{name:'Make it your own.'}).waitFor();await intact();
  const privacy=page.getByRole('button',{name:'Exclude SAA from screen capture',exact:true});
  await expect(privacy).toHaveAttribute('aria-pressed','true');
  await click(privacy);await expect(privacy).toHaveAttribute('aria-pressed','false');await intact();
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isContentProtected()),false);
  await click(privacy);await expect(privacy).toHaveAttribute('aria-pressed','true');await intact();
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isContentProtected()),true);
  await click(page.getByLabel('Model ID',{exact:true}));await expect(page.locator('.status-footer')).toContainText('Typing in SAA');
  input('text','passive-model');await expect(page.getByLabel('Model ID',{exact:true})).toHaveValue('passive-model');await intact();
  input('key','27');await expect(page.locator('.status-footer')).not.toContainText('Typing in SAA');await intact();
  await expect(page.getByLabel('Model ID',{exact:true})).toHaveValue('passive-model');
  await click(page.getByRole('button',{name:'Back to chat',exact:true}));await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
  await click(page.getByRole('textbox',{name:'Message',exact:true}));await expect(page.locator('.status-footer')).toContainText('Typing in SAA');
  input('text','Hello in fullscreen');await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Hello in fullscreen');
  input('key','8');input('text','!');await expect(page.getByRole('textbox',{name:'Message',exact:true})).toHaveValue('Hello in fullscree!');await intact();
  await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeEnabled();
  input('key','27');await expect(page.locator('.status-footer')).not.toContainText('Typing in SAA');await intact();
  await click(page.getByRole('slider',{name:'Panel opacity'}));await expect(page.getByRole('slider',{name:'Panel opacity'})).not.toHaveValue('86');
  const opacity=Number(await page.getByRole('slider',{name:'Panel opacity'}).inputValue())/100;
  await expect.poll(()=>page.evaluate(async()=> (await window.saa.load()).settings.opacity)).toBe(opacity);await intact();
  await click(page.getByRole('button',{name:'History',exact:true}));await page.getByRole('heading',{name:'Your conversations.'}).waitFor();await intact();
  console.log('PASS: real Windows cursor entry/exit/hover and movement across controls, mouse clicks, settings/chat typing, reactive draft state, opacity, Shift punctuation, Backspace and Esc; Edge remains focused and fullscreen throughout.');
 }finally{if(browser)await browser.close();if(app)await app.close();assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()));assert.ok(path.basename(profile).startsWith('saa-input-regression-'));await fs.rm(profile,{recursive:true,force:true,maxRetries:3});}
})().catch(e=>{console.error(e);process.exitCode=1;});
