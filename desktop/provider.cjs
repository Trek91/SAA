'use strict';

const DEFAULT_SETTINGS = Object.freeze({
  endpoint: 'https://api.openai.com/v1/chat/completions', model: '', apiKey: '',
  headers: '{}', systemPrompt: 'You are a helpful AI assistant. Give clear, accurate answers.',
  bodyTemplate: '', responsePath: 'choices[0].message.content',
  temperature: null, maxTokens: null, tokenParameter: 'max_tokens', modelsEndpoint: '',
    streamPath: 'choices[0].delta.content', stream: true, opacity: 0.86, alwaysOnTop: true, captureExclusion: true,
});
const MAX_REQUEST_BYTES = 24 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

function endpointURL(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('Enter a valid API endpoint URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('Use HTTPS, or HTTP on localhost for a local model.');
  }
  if (url.username || url.password || url.hash) throw new Error('Keep credentials in API key or headers, and remove the URL fragment.');
  return url;
}

function parseHeaders(value) {
  let headers;
  try { headers = JSON.parse(value || '{}'); } catch { throw new Error('Custom headers must be a JSON object.'); }
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Custom headers must be a JSON object.');
  for (const [key, val] of Object.entries(headers)) {
    if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(key) || typeof val !== 'string' || /[\r\n]/.test(val)) throw new Error('Headers must have valid names and single-line string values.');
    if (['host', 'content-length', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) throw new Error(`The ${key} header is managed automatically.`);
  }
  return headers;
}

function templateBody(template,values){
  const source=template.replace(/\{\{(model|messages|conversation|system)\}\}/g,(_,key)=>JSON.stringify(values[key]));
  let body;try{body=JSON.parse(source);}catch{throw new Error('Request template must be valid JSON; use placeholders as unquoted JSON values.');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Request template must produce a JSON object.');
  return body;
}
function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings.');
  const out = { ...DEFAULT_SETTINGS };
  for (const key of ['endpoint', 'model', 'apiKey', 'headers', 'systemPrompt', 'bodyTemplate', 'responsePath', 'streamPath', 'modelsEndpoint']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string' || input[key].length > (key === 'bodyTemplate' ? 100000 : 32000)) throw new Error(`Invalid ${key} setting.`);
      out[key] = input[key];
    }
  }
  endpointURL(out.endpoint);
  parseHeaders(out.headers);
  if(out.bodyTemplate.trim())templateBody(out.bodyTemplate,{model:'model',messages:[],conversation:[],system:''});
  if(out.modelsEndpoint){const models=endpointURL(out.modelsEndpoint);if(models.origin!==endpointURL(out.endpoint).origin)throw new Error('Models URL must use the same origin as the chat endpoint.');}
  if(input.temperature!=null&&(!Number.isFinite(input.temperature)||input.temperature<0||input.temperature>2))throw new Error('Temperature must be between 0 and 2, or unset.');
  if(input.maxTokens!=null&&(!Number.isSafeInteger(input.maxTokens)||input.maxTokens<1||input.maxTokens>10000000))throw new Error('Max tokens must be a positive whole number up to 10000000, or unset.');
  if(input.tokenParameter!==undefined&&!['max_tokens','max_completion_tokens'].includes(input.tokenParameter))throw new Error('Invalid token limit parameter.');
  out.temperature=input.temperature??null;out.maxTokens=input.maxTokens??null;out.tokenParameter=input.tokenParameter??'max_tokens';
  out.stream = input.stream === undefined ? true : Boolean(input.stream);
  out.alwaysOnTop = input.alwaysOnTop === undefined ? true : Boolean(input.alwaysOnTop);
  if(input.captureExclusion!==undefined&&typeof input.captureExclusion!=='boolean')throw new Error('Capture exclusion must be enabled or disabled.');
  out.captureExclusion=input.captureExclusion??true;
  if (input.opacity !== undefined && (!Number.isFinite(input.opacity) || input.opacity < 0.35 || input.opacity > 1)) throw new Error('Opacity must be between 35% and 100%.');
  out.opacity = input.opacity ?? DEFAULT_SETTINGS.opacity;
  return out;
}

function cleanMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 500) throw new Error('Provide between 1 and 500 messages.');
  const out = messages.map((message) => {
    if (!message || !['system', 'user', 'assistant'].includes(message.role)) throw new Error('Invalid message role.');
    let content = message.content;
    if (typeof content !== 'string') {
      if (!Array.isArray(content) || content.length > 12) throw new Error('Invalid message content.');
      content = content.map((part) => {
        if (part?.type === 'text' && typeof part.text === 'string') return { type: 'text', text: part.text };
        if (part?.type === 'image_url' && typeof part.image_url?.url === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(part.image_url.url)) return { type: 'image_url', image_url: { url: part.image_url.url } };
        throw new Error('Only text and PNG, JPEG or WebP image attachments are supported.');
      });
    }
    return { role: message.role, content };
  });
  if (Buffer.byteLength(JSON.stringify(out)) > MAX_REQUEST_BYTES) throw new Error('Conversation and images exceed the 24 MB request limit.');
  return out;
}

function getPath(value, path) {
  if (!path) return undefined;
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  for (const key of keys) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || value == null || !Object.hasOwn(Object(value), key)) return undefined;
    value = value[key];
  }
  return value;
}

function extractText(value, path, streaming) {
  const paths = [path, ...(streaming ? ['choices[0].delta.content', 'delta.text', 'candidates[0].content.parts[0].text', 'text'] : ['choices[0].message.content', 'content[0].text', 'candidates[0].content.parts[0].text', 'response', 'text'])];
  for (const candidate of paths) {
    const text = getPath(value, candidate);
    if (typeof text === 'string') return text;
  }
  return '';
}

function buildRequest(settings, messages) {
  settings = validateSettings(settings);
  const history = cleanMessages(messages);
  if (settings.systemPrompt && !history.some((m) => m.role === 'system')) history.unshift({ role: 'system', content: settings.systemPrompt });
  if (!settings.model.trim() && !settings.bodyTemplate.trim()) throw new Error('Set your model ID in API settings.');
  let body;
  if (settings.bodyTemplate.trim()) {
    const values = { model: settings.model, messages: history, conversation: history.filter((message) => message.role !== 'system'), system: settings.systemPrompt };
    body=templateBody(settings.bodyTemplate,values);
  } else {
    body = { model: settings.model.trim(), messages: history, stream: settings.stream };
    if(settings.temperature!==null)body.temperature=settings.temperature;
    if(settings.maxTokens!==null)body[settings.tokenParameter]=settings.maxTokens;
  }
  const headers = new Headers(parseHeaders(settings.headers));
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', settings.stream ? 'text/event-stream, application/json' : 'application/json');
  if (settings.apiKey && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${settings.apiKey}`);
  const encoded = JSON.stringify(body);
  if (Buffer.byteLength(encoded) > MAX_REQUEST_BYTES) throw new Error('Request exceeds the 24 MB size limit.');
  return { url: chatURL(settings.endpoint).href, headers, body: encoded };
}

function chatURL(endpoint){
  const url=endpointURL(endpoint);
  // Compatible services also use versioned or /openai bases (e.g. Gemini).
  // Preserve full/custom routes and query parameters; never probe or redirect.
  if(url.pathname==='/'||/\/(?:v\d+(?:(?:alpha|beta)\d*)?|openai)\/?$/i.test(url.pathname))url.pathname=url.pathname.replace(/\/$/,'')+'/chat/completions';
  return url;
}
function providerDetail(value,settings){
  const error=value?.error;
  let message=typeof error==='string'?error:typeof error?.message==='string'?error.message:typeof value?.message==='string'?value.message:typeof value?.detail==='string'?value.detail:'';
  if(!message)return '';
  const secrets=[settings.apiKey,...Object.values(parseHeaders(settings.headers))];
  for(const endpoint of [settings.endpoint,settings.modelsEndpoint])if(endpoint){for(const[key,val]of endpointURL(endpoint).searchParams)if(/key|token|secret|password|authorization/i.test(key))secrets.push(val);}
  for(const secret of secrets.filter(s=>typeof s==='string'&&s.length).sort((a,b)=>b.length-a.length)){
    for(const encoded of new Set([secret,encodeURIComponent(secret),JSON.stringify(secret).slice(1,-1)]))message=message.split(encoded).join('[redacted]');
  }
  return message.replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,800);
}
async function httpFailure(response,settings,prefix='API request failed'){
  let value;
  try{value=JSON.parse(await boundedText(response,64*1024));}catch(error){if(error.name==='AbortError')throw error;}
  const detail=providerDetail(value,settings);
  const hint=response.status===401?'The provider rejected authentication. Check the key for this provider.':response.status===403?'The provider denied access. Check API permissions and model access.':response.status===404?'The provider could not find this API route or model.':response.status===429?'The provider reports a rate or quota limit.':response.status>=500?'The provider reported a server error. Try again later.':'The provider rejected this request. Check its supported parameters.';
  return new Error(`${prefix} (${response.status}): ${detail||hint}`);
}
async function validateConnection(settings,options={}){
  settings=validateSettings(settings);
  const url=settings.modelsEndpoint?endpointURL(settings.modelsEndpoint):chatURL(settings.endpoint);
  if(!settings.modelsEndpoint){
    if(!/\/chat\/completions\/?$/.test(url.pathname))throw new Error('Set a Models URL under Custom API format to validate this endpoint.');
    url.pathname=url.pathname.replace(/\/chat\/completions\/?$/,'/models');
  }
  const headers=new Headers(parseHeaders(settings.headers));headers.set('Accept','application/json');
  if(settings.apiKey&&!headers.has('Authorization'))headers.set('Authorization',`Bearer ${settings.apiKey}`);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),options.timeoutMs??15000);
  try{
    const response=await(options.fetch||fetch)(url.href,{method:'GET',headers,redirect:'manual',signal:controller.signal});
    if(response.status>=300&&response.status<400){await response.body?.cancel();throw new Error('Validation redirects are blocked. Use the final URL.');}
    if(!response.ok)throw await httpFailure(response,settings,'Connection check failed');
    let value;try{value=JSON.parse(await boundedText(response,1024*1024));}catch(error){if(error.name==='AbortError')throw error;throw new Error('Models endpoint returned invalid or oversized JSON.');}
    if(!value||!Array.isArray(value.data))throw new Error('Models endpoint must return a data array of model IDs. Chat endpoints with a different API format may still work.');
    const models=[...new Set(value.data.filter(m=>m&&typeof m.id==='string'&&m.id.length<=256).map(m=>m.id))].slice(0,2000);
    return {models,message:`Connection reached · ${models.length} models reported. This checks the models endpoint; chat access is checked when you send a message.`};
  }catch(error){if(controller.signal.aborted)throw new Error('Connection check timed out.');if(error instanceof TypeError)throw new Error('Could not reach the models endpoint. Check that your server is running.');throw error;}finally{clearTimeout(timer);}
}

async function boundedText(response, limit = MAX_RESPONSE_BYTES) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '', bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error('API response exceeds the size limit.');
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function runChat(settings, messages, options = {}) {
  settings = validateSettings(settings);
  const request = buildRequest(settings, messages);
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 180000);
  const onDelta = options.onDelta || (() => {});
  let output = '';
  const emit = (text) => { if (text) { output += text; onDelta(text); } };
  try {
    const response = await (options.fetch || fetch)(request.url, { method: 'POST', headers: request.headers, body: request.body, redirect: 'manual', signal: controller.signal });
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error('API redirects are blocked to protect your credentials. Use the final endpoint URL.'); }
    if (!response.ok) throw await httpFailure(response,settings);
    const contentType = response.headers.get('content-type') || '';
    if (!settings.stream || /application\/json/i.test(contentType)) {
      let value;
      try { value = JSON.parse(await boundedText(response)); } catch (error) { if (error.name === 'AbortError') throw error; throw new Error('The API returned invalid JSON or an oversized response.'); }
      if (value?.error) throw new Error(`Provider API error: ${providerDetail(value,settings)||'The provider rejected this request.'}`);
      emit(extractText(value, settings.responsePath, false));
    } else {
      if (!response.body) throw new Error('The API returned an empty response.');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = '', data = [], bytes = 0, finished = false;
      const dispatch = () => {
        if (!data.length) return;
        const raw = data.join('\n'); data = [];
        if (raw.trim() === '[DONE]') { finished = true; return; }
        let value;
        try { value = JSON.parse(raw); } catch { throw new Error('The API returned a malformed streaming event.'); }
        if (value?.error || value?.type === 'error') throw new Error(`Provider streaming error: ${providerDetail(value,settings)||'The provider rejected this request.'}`);
        emit(extractText(value, settings.streamPath, true));
      };
      const line = (text) => {
        if (!text) dispatch();
        else if (text.startsWith('data:')) data.push(text.slice(5).replace(/^ /, ''));
      };
      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) { buffer += decoder.decode(); break; }
          bytes += value.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) throw new Error('API response exceeds the 16 MB size limit.');
          buffer += decoder.decode(value, { stream: true });
          let index;
          while (!finished && (index = buffer.indexOf('\n')) >= 0) {
            line(buffer.slice(0, index).replace(/\r$/, '')); buffer = buffer.slice(index + 1);
          }
        }
        if (!finished) { if (buffer) line(buffer.replace(/\r$/, '')); dispatch(); }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
    if (controller.signal.aborted) throw Object.assign(new Error('Request cancelled.'), { name: 'AbortError' });
    if (!output) throw new Error('No answer text was found. Check the response/stream content path and API format.');
    return output;
  } catch (error) {
    if (timedOut) throw new Error('The API request timed out after waiting for a response.');
    if (controller.signal.aborted) throw Object.assign(new Error('Request cancelled.'), { name: 'AbortError' });
    if (error instanceof TypeError) throw new Error('Could not connect to the API. Check the endpoint and your connection.');
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

module.exports = { DEFAULT_SETTINGS, validateSettings, endpointURL, buildRequest, cleanMessages, runChat, getPath, validateConnection, chatURL };
