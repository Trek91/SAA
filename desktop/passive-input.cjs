const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
function createPassiveInput(win, emit) {
  if(process.platform!=='win32')return {state(){},typing(){},drag(){},close(){}};
  const handle=win.getNativeWindowHandle();
  const hwnd=handle.length===8?handle.readBigUInt64LE().toString():String(handle.readUInt32LE());
  const executable=path.join(__dirname,'native','SaaInput.exe').replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
  const child=spawn(executable,[hwnd,String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  let closed=false,enabled=false,ready=false;
  function command(value){if(!closed&&child.stdin.writable)child.stdin.write(JSON.stringify(value)+'\n');}
  const lines=readline.createInterface({input:child.stdout});
  lines.on('line',line=>{try{const value=JSON.parse(line);if(value.type==='ready'){ready=true;command({action:'state',enabled});}else if(['pointer','key','typing'].includes(value.type))emit(value);}catch{}});
  child.stdin.on('error',()=>{});
  child.on('error',()=>emit({type:'error',text:'Passive input could not start. Use interactive mode to type.'}));
  child.on('exit',()=>{closed=true;lines.close();emit({type:'typing',active:false});if(enabled)emit({type:'error',text:'Passive input stopped. Restart SAA, or switch to interactive mode.'});});
  return {
    state(value){enabled=!!value;if(ready)command({action:'state',enabled});},
    typing(active){if(ready)command({action:'typing',active:enabled&&!!active});},
    drag(){if(ready)command({action:'drag'});},
    close(){enabled=false;command({action:'quit'});closed=true;child.stdin.end();},
  };
}
module.exports={createPassiveInput};
