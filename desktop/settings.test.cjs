const test=require('node:test');const assert=require('node:assert/strict');
const {normalizeSettings,publicSettings,updateSettings,patchProvider}=require('./settings.cjs');
test('legacy settings migrate to the matching provider without losing request customization or appearance',()=>{
 const old={endpoint:'https://vendor.example/generate',model:'kept-model',apiKey:'old-key',headers:'{"X-Client":"saa"}',bodyTemplate:'{"question":{{messages}}}',responsePath:'answer',opacity:.55,captureExclusion:false};
 const next=normalizeSettings(old);assert.equal(next.activeProvider,'custom');for(const[key,value]of Object.entries(old))assert.equal(next[key],value);
 assert.equal(next.providers.custom.apiKey,'old-key');assert.equal(next.providers.openai.apiKey,'');assert.equal(next.providers.local.endpoint,'http://localhost:1234/v1');
 assert.equal(normalizeSettings({endpoint:'http://127.0.0.1:11434/v1',model:'local'}).activeProvider,'local');
});
test('provider switching retains isolated keys, models and parameters and redacts every returned key',()=>{
 assert.equal(normalizeSettings({}).tokenParameter,'max_completion_tokens');
 let settings=normalizeSettings({model:'open-model',apiKey:'open-key'});
 settings=normalizeSettings(patchProvider(settings,'openrouter',{model:'router/model',apiKey:'router-key',temperature:.4,maxTokens:4096}));
 settings=normalizeSettings({...settings,activeProvider:'openrouter'});
 assert.equal(settings.apiKey,'router-key');assert.equal(settings.model,'router/model');assert.equal(settings.maxTokens,4096);
 const safe=publicSettings(settings);assert.equal(safe.apiKey,'');assert.equal(safe.hasKey,true);for(const profile of Object.values(safe.providers))assert.equal(profile.apiKey,'');
 assert.ok(!JSON.stringify(safe).includes('open-key'));assert.ok(!JSON.stringify(safe).includes('router-key'));
 settings=normalizeSettings({...settings,activeProvider:'openai'});assert.equal(settings.apiKey,'open-key');assert.equal(settings.model,'open-model');assert.equal(settings.maxTokens,null);
});
test('full settings saves preserve blank keys and appearance; explicit key removal touches only its provider',()=>{
 let settings=normalizeSettings({model:'first',apiKey:'key-a',opacity:.6,captureExclusion:false});
 settings=normalizeSettings(patchProvider(settings,'local',{model:'local-model',apiKey:'key-b'}));
 const safe=publicSettings(settings);safe.activeProvider='local';safe.providers.local.model='new-local';
 settings=normalizeSettings(updateSettings(settings,safe));assert.equal(settings.apiKey,'key-b');assert.equal(settings.providers.openai.apiKey,'key-a');assert.equal(settings.opacity,.6);assert.equal(settings.captureExclusion,false);
 settings=normalizeSettings(patchProvider(settings,'local',{clearApiKey:true}));assert.equal(settings.apiKey,'');assert.equal(settings.providers.openai.apiKey,'key-a');
 assert.throws(()=>patchProvider(settings,'other',{}),/Choose/);assert.throws(()=>updateSettings(settings,{providers:[]}),/Invalid provider/);
});
