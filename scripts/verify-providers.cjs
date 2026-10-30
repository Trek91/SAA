const {_electron}=require('playwright');const{expect}=require('playwright/test');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');const{once}=require('node:events');
const{spawnSync}=require('node:child_process');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'saa-provider-check-'));const received=[];
 const driver=path.join(profile,'NativeInputDriver.exe');
 const compiled=spawnSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/platform:x64',`/out:${driver}`,path.join(__dirname,'NativeInputDriver.cs')],{encoding:'utf8',windowsHide:true});if(compiled.status!==0)throw new Error(compiled.stdout+compiled.stderr);
 const server=http.createServer(async(req,res)=>{
  const provider=req.url.split('/')[1];const auth=req.headers.authorization;
  if(auth!==`Bearer ${provider}-key`){res.writeHead(401);res.end('{}');return;}
  if(req.method==='GET'&&req.url.endsWith('/models')){received.push({provider,kind:'models',url:req.url});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:`${provider}-model`}]}));return;}
  if(!req.url.endsWith('/chat/completions')){res.writeHead(404);res.end('{}');return;}
  let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);
  if(body.messages.at(-1).content==='Show provider error'){received.push({provider,kind:'error'});res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Unsupported option in this request. Credential open-key'}}));return;}
  received.push({provider,kind:'chat',body,url:req.url});res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(`data: ${JSON.stringify({choices:[{delta:{content:`Answer from ${provider}`}}]})}\n\ndata: [DONE]\n\n`);
 });server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app;
 async function launch(){return _electron.launch(process.env.SAA_TEST_EXECUTABLE?{executablePath:process.env.SAA_TEST_EXECUTABLE,args:[`--user-data-dir=${profile}`],env}:{args:[path.join(__dirname,'..'),`--user-data-dir=${profile}`],env});}
 try{
  app=await launch();let page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const native=await app.evaluate(({BrowserWindow})=>({hwnd:BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString(),pid:process.pid}));
  function input(...args){const result=spawnSync(driver,[native.hwnd,String(native.pid),...args],{encoding:'utf8',windowsHide:true});if(result.status!==0)throw new Error(result.stderr||result.stdout);return result.stdout.trim();}
  async function nativeClick(locator){await locator.evaluate(el=>el.scrollIntoView({block:'center'}));const box=await locator.boundingBox();assert.ok(box);const point=await app.evaluate(({BrowserWindow,screen},box)=>{const bounds=BrowserWindow.getAllWindows()[0].getContentBounds();return screen.dipToScreenPoint({x:Math.round(bounds.x+box.x+box.width/2),y:Math.round(bounds.y+box.y+box.height/2)});},box);input('move',String(point.x),String(point.y));input('click',String(point.x),String(point.y));}
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('API endpoint',{exact:true}).fill(origin+'/open/v1beta/openai/');await page.getByLabel('Model ID',{exact:true}).fill('open-model');await page.getByLabel('API key',{exact:true}).fill('open-key');
  await page.getByRole('button',{name:'Save key',exact:true}).click();await expect(page.getByLabel('API key',{exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Remove key',exact:true})).toBeEnabled();
  await page.getByLabel('Temperature',{exact:true}).fill('0.4');await page.getByLabel('Max tokens',{exact:true}).fill('256');
  await page.getByRole('button',{name:'Validate connection',exact:true}).click();await expect(page.getByText(/Connection reached/)).toBeVisible();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Show provider error');await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('400');await expect(page.getByRole('alert')).toContainText('Unsupported option');await expect(page.getByRole('alert')).not.toContainText('open-key');
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('First provider');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByText('Answer from open',{exact:true}).waitFor();
  const foregroundBefore=input('foreground');
  await nativeClick(page.getByRole('button',{name:'Active provider',exact:true}));await nativeClick(page.getByRole('menuitemradio',{name:'OpenRouter',exact:true}));
  await expect(page.getByRole('button',{name:'Active provider',exact:true})).toHaveText('OpenRouter');
  assert.equal(input('foreground'),foregroundBefore);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused()),false);
  await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByLabel('Model ID',{exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Remove key',exact:true})).toBeDisabled();
  await page.getByLabel('API endpoint',{exact:true}).fill(origin+'/router/v1');await page.getByLabel('Model ID',{exact:true}).fill('router-model');await page.getByLabel('API key',{exact:true}).fill('router-key');await page.getByLabel('Max tokens',{exact:true}).fill('512');
  await page.getByRole('button',{name:'Validate connection',exact:true}).click();await expect(page.getByText(/Connection reached/)).toBeVisible();await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Second provider');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByText('Answer from router',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Active provider',exact:true}).click();await page.getByRole('menuitemradio',{name:'OpenAI',exact:true}).click();
  let state=await page.evaluate(()=>window.saa.load());assert.equal(state.settings.model,'open-model');assert.equal(state.settings.hasKey,true);assert.equal(state.settings.temperature,.4);assert.equal(state.settings.maxTokens,256);
  assert.equal(state.settings.providers.openrouter.model,'router-model');for(const p of Object.values(state.settings.providers))assert.equal(p.apiKey,'');
  // Save/Remove credentials for an inactive profile without touching the active one.
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Active provider',exact:true}).click();await page.getByRole('menuitemradio',{name:'OpenRouter',exact:true}).click();
  await page.getByRole('button',{name:'Remove key',exact:true}).click();await expect(page.getByRole('button',{name:'Remove key',exact:true})).toBeDisabled();
  state=await page.evaluate(()=>window.saa.load());assert.equal(state.settings.activeProvider,'openai');assert.equal(state.settings.hasKey,true);assert.equal(state.settings.providers.openrouter.hasKey,false);
  await page.getByRole('button',{name:'Back to chat',exact:true}).click();
  const encrypted=await fs.readFile(path.join(profile,'settings.enc'));assert.equal(encrypted.includes(Buffer.from('open-key')),false);assert.equal(encrypted.includes(Buffer.from('router-key')),false);
  assert.deepEqual(received.filter(r=>r.kind==='models').map(r=>r.provider),['open','router']);
  const chats=received.filter(r=>r.kind==='chat');assert.equal(chats[0].url,'/open/v1beta/openai/chat/completions');assert.equal(received.find(r=>r.kind==='models').url,'/open/v1beta/openai/models');assert.equal(chats[0].body.max_completion_tokens,256);assert.equal(chats[0].body.temperature,.4);assert.equal(chats[1].body.max_tokens,512);assert.equal('temperature'in chats[1].body,false);assert.deepEqual(errors,[]);
  await app.close();app=await launch();page=await app.firstWindow();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
  state=await page.evaluate(()=>window.saa.load());assert.equal(state.settings.activeProvider,'openai');assert.equal(state.settings.hasKey,true);assert.equal(state.settings.providers.openrouter.hasKey,false);assert.equal(state.settings.providers.openrouter.model,'router-model');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isContentProtected()),true);
  console.log('PASS: provider UI selection with real Windows mouse input and unchanged foreground, isolated settings/keys, native validation with saved or entered credentials, per-provider chat routing and generation parameters, key removal isolation, encrypted persistence/restart and capture protection.');
 }finally{if(app)await app.close();await new Promise(resolve=>server.close(resolve));assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()));assert.ok(path.basename(profile).startsWith('saa-provider-check-'));await fs.rm(profile,{recursive:true,force:true,maxRetries:3});}
})().catch(e=>{console.error(e);process.exitCode=1;});
