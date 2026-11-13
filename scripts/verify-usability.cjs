const {_electron}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {once}=require('node:events');

(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'saa-usability-check-'));
 const historyFile=path.join(profile,'conversations.json'),workspaceFile=path.join(profile,'workspace.json');
 const longAnswer=Array.from({length:55},(_,i)=>`Paragraph ${i+1}. Readable answers stay accessible when another response arrives.`).join('\n\n');
 await fs.writeFile(historyFile,JSON.stringify([
  {id:'chat-a',title:'Research',updatedAt:2,messages:[{id:'a1',role:'user',content:'Find the sapphire needle.'},{id:'a2',role:'assistant',content:longAnswer}]},
  {id:'chat-b',title:'Shopping',updatedAt:1,messages:[{id:'b1',role:'user',content:'A grocery list'},{id:'b2',role:'assistant',content:'Apples and tea.'}]}
 ]));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app,response,page;
 const server=http.createServer(async(req,res)=>{for await(const chunk of req){}response=res;res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(`data: ${JSON.stringify({choices:[{delta:{content:longAnswer}}]})}\n\n`);});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 async function launch(){app=await _electron.launch(process.env.SAA_TEST_EXECUTABLE?{executablePath:process.env.SAA_TEST_EXECUTABLE,args:[`--user-data-dir=${profile}`],env}:{args:[path.join(__dirname,'..'),`--user-data-dir=${profile}`],env});page=await app.firstWindow();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();}
 async function quit(){const closed=app.waitForEvent('close');try{await page.evaluate(()=>window.saa.windowAction('quit'));}catch(e){if(!/closed/i.test(e.message))throw e;}await closed;app=null;}
 const message=()=>page.getByRole('textbox',{name:'Message',exact:true});
 const sidebar=()=>page.getByRole('complementary',{name:'Chat sidebar'});
 const open=async(title)=>sidebar().locator('.history-open').filter({has:page.locator('strong',{hasText:new RegExp(`^${title}$`)})}).click();
 try{
  await launch();await message().fill('Draft A stays local');
  await page.getByRole('button',{name:'Toggle chat sidebar',exact:true}).click();
  await open('Shopping');await expect(message()).toHaveValue('');await message().fill('Draft B');
  await open('Research');await expect(message()).toHaveValue('Draft A stays local');
  await sidebar().getByRole('button',{name:'New',exact:true}).click();await message().fill('Separate new-chat draft');
  await open('Shopping');await expect(message()).toHaveValue('Draft B');
  await sidebar().getByRole('button',{name:'New',exact:true}).click();await expect(message()).toHaveValue('Separate new-chat draft');
  await sidebar().getByRole('searchbox',{name:'Search conversations'}).fill('sapphire');
  assert.equal(await sidebar().locator('.history-row').count(),1);await open('Research');
  await sidebar().getByRole('searchbox',{name:'Search conversations'}).fill('');
  await sidebar().getByRole('button',{name:'Rename Research',exact:true}).click();
  await sidebar().getByLabel('Conversation title',{exact:true}).fill('Research notes');
  await sidebar().getByRole('button',{name:'Save conversation title',exact:true}).click();
  await sidebar().getByRole('button',{name:'Pin Shopping',exact:true}).click();
  await expect(sidebar().locator('.history-open strong').first()).toHaveText('Shopping');
  await sidebar().getByRole('button',{name:'Archive Shopping',exact:true}).click();
  assert.equal(await sidebar().locator('.history-row').count(),1);
  await sidebar().getByRole('button',{name:'Archived',exact:true}).click();
  await sidebar().getByRole('button',{name:'Unarchive Shopping',exact:true}).click();
  await sidebar().getByRole('button',{name:'Active',exact:true}).click();
  await sidebar().getByRole('button',{name:'Delete Research notes',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=>(await window.saa.load()).workspace.drafts['chat-a'])).toBeUndefined();
  await page.getByRole('button',{name:'Undo deletion',exact:true}).click();
  await open('Research notes');await expect(message()).toHaveValue('Draft A stays local');
  // Preserve unsent image attachments on switches without persisting them as drafts.
  await page.locator('input[type=file]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3xQAAAAASUVORK5CYII=','base64')});
  await page.getByRole('button',{name:'Remove fixture.png',exact:true}).waitFor();
  await open('Shopping');assert.equal(await page.locator('.attachments img').count(),0);
  await open('Research notes');await page.getByRole('button',{name:'Remove fixture.png',exact:true}).click();
  // Narrow mode overlays the sidebar instead of shrinking the message column.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(760,650));
  const narrow=await page.locator('.conversation-main').boundingBox();assert.ok(narrow.width>=650);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'Hide content',exact:true}).click();assert.equal(await sidebar().isVisible(),false);
  await page.getByRole('button',{name:'Show content',exact:true}).click();
  await sidebar().getByRole('button',{name:'Close chat sidebar',exact:true}).click();
  await page.getByRole('button',{name:'All messages',exact:true}).click();
  await page.evaluate(()=>{const el=document.querySelector('.chat-scroll');el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
  await page.getByRole('button',{name:'Jump to latest',exact:true}).waitFor();
  await page.getByRole('button',{name:'History',exact:true}).click();
  await page.getByRole('button',{name:'Back to chat',exact:true}).click();
  assert.equal(await page.locator('.chat-scroll').evaluate(el=>el.scrollTop),0);
  await page.getByRole('button',{name:'Jump to latest',exact:true}).click();
  await expect.poll(()=>page.locator('.chat-scroll').evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)).toBeLessThan(80);
  await page.evaluate(endpoint=>window.saa.saveSettings({endpoint,model:'usability-fixture',apiKey:'fixture-key'}),`http://127.0.0.1:${server.address().port}/v1`);
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect.poll(()=>page.locator('.markdown').last().innerText()).toContain('Paragraph 55.');
  await page.locator('.chat-scroll').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
  await page.getByRole('button',{name:'Jump to latest',exact:true}).waitFor();
  response.write(`data: ${JSON.stringify({choices:[{delta:{content:'\n\nA later streamed chunk.'}}]})}\n\n`);
  await expect(page.locator('.markdown').last()).toContainText('A later streamed chunk.');
  assert.equal(await page.locator('.chat-scroll').evaluate(el=>el.scrollTop),0);
  response.end('data: [DONE]\n\n');await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
  await message().fill('Final draft after streaming');
  await page.getByRole('button',{name:'Toggle chat sidebar',exact:true}).click();
  const normal=await app.evaluate(({BrowserWindow,screen})=>{const area=screen.getPrimaryDisplay().workArea;const w=BrowserWindow.getAllWindows()[0];w.setBounds({x:area.x+20,y:area.y+20,width:Math.min(1100,area.width-40),height:Math.min(760,area.height-40)});return w.getBounds();});
  await page.screenshot({path:path.join(__dirname,'../docs/daily-usability.png')});
  await page.getByRole('button',{name:'Compact panel',exact:true}).click();await page.getByRole('button',{name:'Expand panel',exact:true}).waitFor();
  const compact=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
  await quit();
  const disk=JSON.parse(await fs.readFile(workspaceFile,'utf8'));
  assert.equal(disk.drafts['chat-a'],'Final draft after streaming');assert.equal(disk.drafts['chat-b'],'Draft B');assert.equal(disk.drafts.new,'Separate new-chat draft');
  assert.equal(disk.latest,false);assert.equal(disk.sidebarOpen,true);assert.equal(disk.compact,true);assert.equal(disk.currentId,'chat-a');assert.deepEqual(disk.normalBounds,normal);
  assert.equal(JSON.stringify(disk).includes('data:image'),false);
  const saved=JSON.parse(await fs.readFile(historyFile,'utf8'));assert.equal(saved.find(c=>c.id==='chat-a').title,'Research notes');assert.equal(saved.find(c=>c.id==='chat-b').pinned,true);assert.equal(saved.find(c=>c.id==='chat-b').archived,false);
  await launch();await expect(message()).toHaveValue('Final draft after streaming');await expect(sidebar()).toBeVisible();
  assert.deepEqual(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds()),compact);
  await page.getByRole('button',{name:'Expand panel',exact:true}).click();
  assert.deepEqual(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds()),normal);
  assert.equal(await page.locator('.message-toggle button.selected').innerText(),'All messages');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isContentProtected()),true);
  await open('Shopping');await expect(message()).toHaveValue('Draft B');
  await quit();
  // Corrupted layout/drafts recover independently, without damaging chat or keys.
  const damaged='{broken workspace';await fs.writeFile(workspaceFile,damaged);
  await launch();const recovered=await page.evaluate(()=>window.saa.load());
  assert.equal(recovered.conversations.length,2);assert.equal(recovered.settings.hasKey,true);
  assert.match(recovered.storageWarning,/Saved workspace could not be opened/);
  const backup=(await fs.readdir(profile)).find(name=>name.startsWith('workspace.json.')&&name.endsWith('.recovery'));
  assert.ok(backup);assert.equal(await fs.readFile(path.join(profile,backup),'utf8'),damaged);
  assert.deepEqual(recovered.workspace.drafts,{});await message().fill('Recovered workspace draft');await quit();
  assert.equal(JSON.parse(await fs.readFile(workspaceFile,'utf8')).drafts['chat-a'],'Recovered workspace draft');
  console.log('PASS: full-text search, rename, pin ordering, archive/unarchive, deletion undo and draft removal; per-chat/new-chat drafts; memory-only image drafts; readable narrow sidebar; privacy; scroll restoration and streaming jump; selected chat, drafts, organization and normal/compact bounds survive Quit/restart.');
 }finally{
  if(app)await app.close();response?.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));
  assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()));assert.ok(path.basename(profile).startsWith('saa-usability-check-'));await fs.rm(profile,{recursive:true,force:true,maxRetries:3});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
