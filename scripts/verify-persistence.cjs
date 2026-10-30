const{_electron}=require('playwright');const{expect}=require('playwright/test');const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');const{once}=require('node:events');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'saa-history-check-'));const historyFile=path.join(profile,'conversations.json');let response,requested;const requestSeen=new Promise(r=>requested=r);let requestCount=0;
 const server=http.createServer(async(req,res)=>{
  try{let body='';for await(const chunk of req)body+=chunk;JSON.parse(body);requestCount++;
   const saved=JSON.parse(await fs.readFile(historyFile,'utf8'));assert.equal(saved[0].messages[0].content,'Persist this conversation');
   response=res;res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: {"choices":[{"delta":{"content":"First saved chunk. "}}]}\n\n');requested();
  }catch(error){requested(error);res.writeHead(500);res.end('{}');}
 });server.listen(0,'127.0.0.1');await once(server,'listening');const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app;
 async function launch(){return _electron.launch(process.env.SAA_TEST_EXECUTABLE?{executablePath:process.env.SAA_TEST_EXECUTABLE,args:[`--user-data-dir=${profile}`],env}:{args:[path.join(__dirname,'..'),`--user-data-dir=${profile}`],env});}
 async function quit(page){const closed=app.waitForEvent('close');try{await page.evaluate(()=>window.saa.windowAction('quit'));}catch(error){if(!/closed/i.test(error.message))throw error;}await closed;app=null;}
 try{
  app=await launch();let page=await app.firstWindow();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
  await page.evaluate(endpoint=>window.saa.saveSettings({endpoint,model:'history-model',apiKey:'history-fixture-key'}),`http://127.0.0.1:${server.address().port}/v1/chat/completions`);
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Persist this conversation');await page.getByRole('button',{name:'Send message',exact:true}).click();const requestError=await requestSeen;if(requestError)throw requestError;
  await expect.poll(async()=>JSON.parse(await fs.readFile(historyFile,'utf8'))[0].messages.at(-1).content).toBe('First saved chunk. ');
  // Quit immediately after a new visible delta, before its scheduled checkpoint.
  response.write('data: {"choices":[{"delta":{"content":"Last chunk before quit."}}]}\n\n');await page.getByText('First saved chunk. Last chunk before quit.',{exact:true}).waitFor();await quit(page);
  let saved=JSON.parse(await fs.readFile(historyFile,'utf8'));assert.equal(saved.length,1);assert.equal(saved[0].messages.at(-1).content,'First saved chunk. Last chunk before quit.');
  app=await launch();page=await app.firstWindow();await page.getByText('First saved chunk. Last chunk before quit.',{exact:true}).waitFor();
  let state=await page.evaluate(()=>window.saa.load());assert.equal(state.conversations.length,1);assert.equal(state.settings.hasKey,true);assert.equal(requestCount,1);
  await page.getByRole('button',{name:'History',exact:true}).click();assert.equal(await page.locator('.history-row').count(),1);await page.getByRole('button',{name:'Delete Persist this conversation',exact:true}).click();
  await expect.poll(async()=>JSON.parse(await fs.readFile(historyFile,'utf8')).length).toBe(0);await quit(page);
  app=await launch();page=await app.firstWindow();await page.getByRole('heading',{name:'A little clarity, on demand.'}).waitFor();state=await page.evaluate(()=>window.saa.load());assert.deepEqual(state.conversations,[]);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isContentProtected()),true);
  console.log('PASS: prompt saved before HTTP request; live streaming checkpoints; immediate quit drains latest delta; restart restores the saved conversation/key without re-sending; deletion survives another restart; capture protection retained.');
 }finally{if(app)await app.close();response?.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()));assert.ok(path.basename(profile).startsWith('saa-history-check-'));await fs.rm(profile,{recursive:true,force:true,maxRetries:3});}
})().catch(e=>{console.error(e);process.exitCode=1;});
