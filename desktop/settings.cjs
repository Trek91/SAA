'use strict';
const {DEFAULT_SETTINGS,validateSettings,endpointURL}=require('./provider.cjs');
const PROVIDERS=['openai','openrouter','custom','local'];
const CONNECTION_KEYS=['endpoint','model','apiKey','headers','systemPrompt','bodyTemplate','responsePath','streamPath','stream','temperature','maxTokens','tokenParameter','modelsEndpoint'];
function assertProvider(id){if(!PROVIDERS.includes(id))throw new Error('Choose OpenAI, OpenRouter, Custom or Local.');return id;}
function connection(input){return Object.fromEntries(CONNECTION_KEYS.filter(key=>input[key]!==undefined).map(key=>[key,input[key]]));}
function providerDefaults(id){
  assertProvider(id);
  return connection({...DEFAULT_SETTINGS,endpoint:{openai:'https://api.openai.com/v1',openrouter:'https://openrouter.ai/api/v1',custom:'https://api.example.com/v1',local:'http://localhost:1234/v1'}[id],tokenParameter:id==='openai'?'max_completion_tokens':'max_tokens'});
}
function inferProvider(endpoint){const host=endpointURL(endpoint).hostname;return host==='api.openai.com'?'openai':host==='openrouter.ai'?'openrouter':['localhost','127.0.0.1','[::1]'].includes(host)?'local':'custom';}
function normalizeSettings(input){
  const globals=validateSettings(input),profiles={};
  const activeProvider=input.activeProvider===undefined?inferProvider(globals.endpoint):assertProvider(input.activeProvider);
  if(input.providers!==undefined&&(!input.providers||typeof input.providers!=='object'||Array.isArray(input.providers)))throw new Error('Invalid provider profiles.');
  for(const id of PROVIDERS){
    const saved=input.providers?.[id];
    if(saved!==undefined&&(!saved||typeof saved!=='object'||Array.isArray(saved)))throw new Error('Invalid provider profile.');
    profiles[id]=connection(validateSettings({...providerDefaults(id),...(input.providers?saved:id===activeProvider?connection(input):{})}));
  }
  return {...globals,...profiles[activeProvider],activeProvider,providers:profiles};
}
function publicSettings(settings){
  const clean=profile=>({...profile,apiKey:'',hasKey:Boolean(profile.apiKey)});
  return {...settings,apiKey:'',hasKey:Boolean(settings.apiKey),providers:Object.fromEntries(PROVIDERS.map(id=>[id,clean(settings.providers[id])]))};
}
function mergeProfile(current,patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Invalid provider settings.');
  if(patch.clearApiKey!==undefined&&typeof patch.clearApiKey!=='boolean')throw new Error('Invalid key removal setting.');
  return connection(validateSettings({...current,...connection(patch),apiKey:patch.clearApiKey?'':patch.apiKey||current.apiKey}));
}
function updateSettings(current,input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid settings.');
  const activeProvider=assertProvider(input.activeProvider??current.activeProvider),providers={...current.providers};
  if(input.providers!==undefined){
    if(!input.providers||typeof input.providers!=='object'||Array.isArray(input.providers))throw new Error('Invalid provider profiles.');
    for(const [id,patch]of Object.entries(input.providers)){assertProvider(id);providers[id]=mergeProfile(providers[id],patch);}
  }else providers[activeProvider]=mergeProfile(providers[activeProvider],input);
  return {...current,activeProvider,providers};
}
function patchProvider(current,id,patch){assertProvider(id);return {...current,providers:{...current.providers,[id]:mergeProfile(current.providers[id],patch)}};}
module.exports={PROVIDERS,providerDefaults,normalizeSettings,publicSettings,updateSettings,patchProvider,mergeProfile,assertProvider};
