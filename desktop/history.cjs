'use strict';
// Memory changes immediately; disk checkpoints coalesce without a streaming
// debounce that can postpone saving forever. flush() waits for its target version.
function createHistoryStore({initial=[],write,onError=()=>{},delayMs=200,schedule=setTimeout,cancel=clearTimeout}){
 let value=initial,version=0,persisted=0,timer=null,inflight=null;
 function checkpoint(){if(timer!==null)return;timer=schedule(()=>{timer=null;void flush().catch(onError);},delayMs);}
 async function flush(){
  const target=version;if(timer!==null){cancel(timer);timer=null;}
  while(persisted<target){
   if(inflight){await inflight;continue;}
   const snapshot=value,snapshotVersion=version;
   const pending=Promise.resolve().then(()=>write(snapshot)).then(()=>{persisted=snapshotVersion;});inflight=pending;
   let succeeded=false;
   try{await pending;succeeded=true;}finally{if(inflight===pending)inflight=null;if(succeeded&&version>persisted)checkpoint();}
  }
 }
 return {get:()=>value,replace(next,{defer=false}={}){value=next;version++;if(defer){checkpoint();return;}return flush();},flush};
}
module.exports={createHistoryStore};
