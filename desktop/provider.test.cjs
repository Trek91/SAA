'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { DEFAULT_SETTINGS, endpointURL, buildRequest, runChat, validateSettings,validateConnection } = require('./provider.cjs');
const messages = () => [{ role: 'user', content: 'Explain this.' }];
const config = (extra = {}) => ({ ...DEFAULT_SETTINGS, model: 'test-model', ...extra });
test('capture privacy defaults on for existing settings and preserves an explicit opt-out',()=>{
  assert.equal(validateSettings({model:'existing-model'}).captureExclusion,true);
  assert.equal(validateSettings({captureExclusion:false}).captureExclusion,false);
  assert.throws(()=>validateSettings({captureExclusion:'false'}),/enabled or disabled/);
});
async function server(t, handler) {
  const host = http.createServer(handler);
  host.listen(0, '127.0.0.1'); await once(host, 'listening');
  t.after(() => new Promise((resolve) => { host.closeAllConnections(); host.close(resolve); }));
  return `http://127.0.0.1:${host.address().port}/v1/chat/completions`;
}

test('allows HTTPS and loopback HTTP, rejects cleartext remote and URL credentials', () => {
  assert.equal(endpointURL('https://provider.example/v1').protocol, 'https:');
  assert.equal(endpointURL('http://localhost:1234/v1').hostname, 'localhost');
  for (const url of ['http://provider.example/v1', 'file:///etc/passwd', 'https://key:secret@provider.example/v1']) assert.throws(() => endpointURL(url));
});

test('builds JSON-safe custom templates and preserves custom authorization', () => {
  const request = buildRequest(config({ model: 'a"b', apiKey: 'secret', headers: '{"Authorization":"Custom token"}', bodyTemplate: '{"model":{{model}},"messages":{{messages}},"system":{{system}}}' }), messages());
  assert.equal(JSON.parse(request.body).model, 'a"b');
  assert.equal(JSON.parse(request.body).messages[0].role, 'system');
  assert.equal(request.headers.get('Authorization'), 'Custom token');
  const customConversation = buildRequest(config({ bodyTemplate: '{"model":{{model}},"messages":{{conversation}},"system":{{system}}}' }), messages());
  assert.deepEqual(JSON.parse(customConversation.body).messages, messages());
  assert.throws(() => buildRequest(config({ bodyTemplate: '{"messages":"{{messages}}"}' }), messages()), /unquoted/);
});

test('streams fragmented UTF-8 SSE, multiline events, CRLF, and final event without newline', async (t) => {
  const endpoint = await server(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const bytes = Buffer.from(': heartbeat\r\ndata: {"choices":[\r\ndata: {"delta":{"content":"hé😀"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"llo"}}]}');
    for (let i = 0; i < bytes.length; i += 3) res.write(bytes.subarray(i, i + 3));
    res.end();
  });
  const parts = [];
  assert.equal(await runChat(config({ endpoint }), messages(), { onDelta: (part) => parts.push(part) }), 'hé😀llo');
  assert.deepEqual(parts, ['hé😀', 'llo']);
});

test('DONE ends the stream without waiting for a socket close', async (t) => {
  const endpoint = await server(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"done"}}]}\n\ndata: [DONE]\n\n');
  });
  assert.equal(await runChat(config({ endpoint }), messages()), 'done');
});

test('JSON fallback works when streaming was requested and carries history/auth', async (t) => {
  let received;
  const endpoint = await server(t, async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received = { body: JSON.parse(body), auth: req.headers.authorization };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"answer":"works"}');
  });
  assert.equal(await runChat(config({ endpoint, apiKey: 'test-key', responsePath: 'answer' }), messages()), 'works');
  assert.equal(received.auth, 'Bearer test-key');
  assert.deepEqual(received.body.messages.at(-1), messages()[0]);
});

test('redirects never replay credentials to a second endpoint', async (t) => {
  let redirected = 0;
  const target = await server(t, (_req, res) => { redirected++; res.end('{}'); });
  const endpoint = await server(t, (_req, res) => { res.writeHead(307, { Location: target }); res.end(); });
  await assert.rejects(runChat(config({ endpoint, apiKey: 'private' }), messages()), /redirects are blocked/);
  assert.equal(redirected, 0);
});

test('HTTP errors stay errors and never emit assistant text', async (t) => {
  const endpoint = await server(t, (_req, res) => { res.writeHead(401); res.end('secret details'); });
  const parts = [];
  await assert.rejects(runChat(config({ endpoint }), messages(), { onDelta: (part) => parts.push(part) }), /401/);
  assert.deepEqual(parts, []);
});

test('cancellation terminates an active stream deterministically', async (t) => {
  const endpoint = await server(t, (_req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write('data: {"text":"first"}\n\n'); });
  const controller = new AbortController();
  await assert.rejects(runChat(config({ endpoint }), messages(), { signal: controller.signal, onDelta: () => controller.abort() }), { name: 'AbortError' });
});

test('malformed streaming events and missing response paths are visible failures', async (t) => {
  const malformed = await server(t, (_req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: broken JSON\n\n'); });
  await assert.rejects(runChat(config({ endpoint: malformed }), messages()), /malformed/);
  const empty = await server(t, (_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"usage":123}'); });
  await assert.rejects(runChat(config({ endpoint: empty }), messages()), /No answer text/);
});

test('timeout aborts the transport and reports a useful error', async () => {
  const fakeFetch = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
  await assert.rejects(runChat(config(), messages(), { fetch: fakeFetch, timeoutMs: 0 }), /timed out/);
});
test('base URLs resolve chat paths and optional generation limits are omitted unless configured',()=>{
 const base=config({endpoint:'https://api.openai.com/v1/'}),request=buildRequest(base,messages()),body=JSON.parse(request.body);
 assert.equal(request.url,'https://api.openai.com/v1/chat/completions');assert.equal('temperature'in body,false);assert.equal('max_tokens'in body,false);assert.equal('max_completion_tokens'in body,false);
 const limits=JSON.parse(buildRequest(config({temperature:0,maxTokens:32,tokenParameter:'max_completion_tokens'}),messages()).body);assert.equal(limits.temperature,0);assert.equal(limits.max_completion_tokens,32);assert.equal('max_tokens'in limits,false);
 for(const patch of[{temperature:3},{maxTokens:-1},{maxTokens:1.5},{tokenParameter:'wrong'}])assert.throws(()=>validateSettings(patch));
});
test('connection validation uses GET models, saved auth and no chat request',async t=>{
 let received;const endpoint=await server(t,(req,res)=>{received={method:req.method,url:req.url,auth:req.headers.authorization};res.setHeader('Content-Type','application/json');res.end('{"data":[{"id":"local/model"},{"id":"local/model"},{"id":null}]}');});
 const result=await validateConnection(config({endpoint,apiKey:'private-key'}));assert.deepEqual(received,{method:'GET',url:'/v1/models',auth:'Bearer private-key'});assert.deepEqual(result.models,['local/model']);
});
test('validation blocks redirected credentials, cross-origin overrides, malformed responses and times out',async t=>{
 let redirected=0;const target=await server(t,(_req,res)=>{redirected++;res.end('{}');});
 const redirect=await server(t,(_req,res)=>{res.writeHead(302,{Location:target});res.end();});await assert.rejects(validateConnection(config({endpoint:redirect,apiKey:'secret'})),/redirects/);assert.equal(redirected,0);
 assert.throws(()=>validateSettings({endpoint:'https://one.example/v1',modelsEndpoint:'https://two.example/models'}),/same origin/);
 const malformed=await server(t,(_req,res)=>res.end('{"answer":"ok"}'));await assert.rejects(validateConnection(config({endpoint:malformed})),/data array/);
 const fakeFetch=(_url,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}));await assert.rejects(validateConnection(config(),{fetch:fakeFetch,timeoutMs:0}),/timed out/);
});
test('Gemini-compatible and versioned bases expand once while full custom routes and queries stay intact',()=>{
 for(const base of ['https://generativelanguage.googleapis.com/v1beta/openai','https://generativelanguage.googleapis.com/v1beta/openai/'])assert.equal(buildRequest(config({endpoint:base}),messages()).url,'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
 for(const base of ['https://compatible.example/v2','https://compatible.example/api/v1beta/'])assert.equal(buildRequest(config({endpoint:base}),messages()).url,base.replace(/\/$/,'')+'/chat/completions');
 for(const full of ['https://vendor.example/generate?mode=custom','https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'])assert.equal(buildRequest(config({endpoint:full}),messages()).url,full);
 assert.equal(buildRequest(config({endpoint:'https://vendor.example/openai/?region=us'}),messages()).url,'https://vendor.example/openai/chat/completions?region=us');
});
test('Gemini-style base reaches the actual chat and models routes over HTTP',async t=>{
 const routes=[];const endpoint=await server(t,(req,res)=>{routes.push(req.url);res.setHeader('Content-Type','application/json');if(req.url==='/v1beta/openai/chat/completions')res.end('{"choices":[{"message":{"content":"OK"}}]}');else if(req.url==='/v1beta/openai/models')res.end('{"data":[{"id":"gemini-test"}]}');else{res.writeHead(404);res.end('{}');}});
 const settings=config({endpoint:new URL('/v1beta/openai/',endpoint).href});assert.equal(await runChat(settings,messages()),'OK');assert.deepEqual((await validateConnection(settings)).models,['gemini-test']);assert.deepEqual(routes,['/v1beta/openai/chat/completions','/v1beta/openai/models']);
});
test('provider HTTP errors show useful reasons without reflecting saved credentials',async t=>{
 const endpoint=await server(t,(_req,res)=>{res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Unsupported parameter: temperature. Bearer private-key X-Token=header-secret token=query-secret'}}));});
 await assert.rejects(runChat(config({endpoint:endpoint+'?api_key=query-secret',apiKey:'private-key',headers:'{"X-Token":"header-secret"}'}),messages()),error=>{assert.match(error.message,/400.*Unsupported parameter: temperature/);for(const secret of ['private-key','header-secret','query-secret'])assert.equal(error.message.includes(secret),false);return true;});
});
test('streamed provider errors retain their reason and HTML failures use status-specific guidance',async t=>{
 const streamed=await server(t,(_req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: {"error":{"message":"Model access denied"}}\n\n');});await assert.rejects(runChat(config({endpoint:streamed}),messages()),/Model access denied/);
 const html=await server(t,(_req,res)=>{res.writeHead(429,{'Content-Type':'text/html'});res.end('<html>private server dump</html>');});await assert.rejects(runChat(config({endpoint:html}),messages()),error=>{assert.match(error.message,/429.*rate or quota/);assert.equal(error.message.includes('server dump'),false);return true;});
});
