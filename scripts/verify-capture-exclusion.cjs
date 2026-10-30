const {_electron}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'saa-capture-check-'));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app,probe;
 try{
  app=await _electron.launch(process.env.SAA_TEST_EXECUTABLE?{executablePath:process.env.SAA_TEST_EXECUTABLE,args:[`--user-data-dir=${profile}`],env}:{args:[path.join(__dirname,'..'),`--user-data-dir=${profile}`],env});
  const page=await app.firstWindow();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
  async function state(){return app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return{protected:w.isContentProtected(),visible:w.isVisible()};});}
  assert.deepEqual(await state(),{protected:true,visible:true});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const toggle=page.getByRole('button',{name:'Exclude SAA from screen capture',exact:true});
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  // Privacy applies immediately, even before a model or API key is configured.
  await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','false');
  assert.deepEqual(await state(),{protected:false,visible:true});
  await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','true');
  const geometry=await app.evaluate(async({BrowserWindow,screen})=>{
   const w=BrowserWindow.getAllWindows()[0],bounds=w.getBounds(),display=screen.getDisplayMatching(bounds);
   globalThis.saaCaptureBackdrop=new BrowserWindow({frame:false,show:false,focusable:false,skipTaskbar:true,backgroundColor:'#07518e',...display.bounds,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
   await globalThis.saaCaptureBackdrop.loadURL('data:text/html,<body style="margin:0;background:rgb(7,81,142)"></body>');
   globalThis.saaCaptureBackdrop.setAlwaysOnTop(true,'screen-saver');globalThis.saaCaptureBackdrop.showInactive();
   w.setAlwaysOnTop(false);w.setAlwaysOnTop(true,'screen-saver');w.showInactive();w.moveTop();
   return{id:String(display.id),bounds:display.bounds,width:Math.round(display.size.width*display.scaleFactor),height:Math.round(display.size.height*display.scaleFactor),x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
  });
  await page.evaluate(()=>{const shell=document.querySelector('.app-shell');shell.style.backgroundColor='rgb(245,0,176)';for(const child of shell.children)child.style.visibility='hidden';});
  probe=await _electron.launch({args:[path.join(__dirname,'capture-probe.cjs'),`--user-data-dir=${path.join(profile,'probe')}`],env});
  async function sample(){return probe.evaluate(async({desktopCapturer},g)=>{
   const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:g.width,height:g.height},fetchWindowIcons:false});
   const source=sources.find(s=>s.display_id===g.id);if(!source)throw new Error('Test display could not be captured.');
   const image=source.thumbnail,size=image.getSize(),bitmap=image.toBitmap();
   const x=Math.floor((g.x-g.bounds.x)/g.bounds.width*size.width),y=Math.floor((g.y-g.bounds.y)/g.bounds.height*size.height),offset=(y*size.width+x)*4;
   return [bitmap[offset+2],bitmap[offset+1],bitmap[offset]];
  },geometry);}
  await page.evaluate(()=>window.saa.savePrivacy({captureExclusion:false}));
  await expect.poll(sample,{timeout:15000}).toEqual([245,0,176]);
  await page.evaluate(()=>window.saa.savePrivacy({captureExclusion:true}));
  await expect.poll(sample,{timeout:15000}).toEqual([7,81,142]);
  await page.evaluate(()=>window.saa.savePrivacy({captureExclusion:false}));
  const capture=await page.evaluate(()=>window.saa.capture());assert.match(capture,/^data:image\/png;base64,/);
  assert.equal((await state()).protected,false);
  await page.evaluate(()=>window.saa.savePrivacy({captureExclusion:true}));
  await expect.poll(sample,{timeout:15000}).toEqual([7,81,142]);
  assert.equal((await state()).visible,true);
  const encrypted=await fs.readFile(path.join(profile,'settings.enc'));
  const saved=await app.evaluate(({safeStorage},data)=>JSON.parse(safeStorage.decryptString(Buffer.from(data))).captureExclusion,[...encrypted]);
  assert.equal(saved,true);
  console.log('PASS: SAA stays visible, exclusion defaults on, the Settings switch works without API setup, and an independent desktop capture sees the background when enabled and SAA when disabled. Persistence and own-capture restoration pass.');
 }finally{
  if(probe)await probe.close();
  if(app){await app.evaluate(()=>{globalThis.saaCaptureBackdrop?.destroy();}).catch(()=>{});await app.close();}
  assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()));assert.ok(path.basename(profile).startsWith('saa-capture-check-'));await fs.rm(profile,{recursive:true,force:true,maxRetries:3});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
