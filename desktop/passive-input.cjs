const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
function createPassiveInput(win, emit) {
  if(!['win32','darwin'].includes(process.platform))return {state(){},typing(){},drag(){},close(){}};
  const mac=process.platform==='darwin';
  const handle=win.getNativeWindowHandle();
  const hwnd=handle.length===8?handle.readBigUInt64LE().toString():String(handle.readUInt32LE());
  const executable=path.join(__dirname,'native',mac?'SaaInputMac':'SaaInput.exe').replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
  const target=mac?win.getMediaSourceId().split(':')[1]:hwnd;
  const child=spawn(executable,[target,String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  let closed=false,enabled=false,ready=false;
  function command(value){if(!closed&&child.stdin.writable)child.stdin.write(JSON.stringify(value)+'\n');}
  function geometry(){if(mac&&ready&&!win.isDestroyed())command({action:'geometry',bounds:win.getContentBounds()});}
  if(mac){win.on('move',geometry);win.on('resize',geometry);}
  const lines=readline.createInterface({input:child.stdout});
  lines.on('line',line=>{try{const value=JSON.parse(line);if(value.type==='ready'){ready=true;geometry();command({action:'state',enabled});}else if(value.type==='drag'&&mac&&enabled&&Number.isFinite(value.x)&&Number.isFinite(value.y)){win.setPosition(Math.round(value.x),Math.round(value.y),false);}else if(['pointer','key','typing','permission'].includes(value.type))emit(value);}catch{}});
  child.stdin.on('error',()=>{});
  child.on('error',()=>emit({type:'error',text:'Passive input could not start. Use interactive mode to type.'}));
  child.on('exit',()=>{closed=true;lines.close();emit({type:'typing',active:false});if(enabled)emit({type:'error',text:'Passive input stopped. Restart SAA, or switch to interactive mode.'});});
  return {
    state(value){enabled=!!value;geometry();if(ready)command({action:'state',enabled});},
    typing(active){if(ready)command({action:'typing',active:enabled&&!!active});},
    drag(){if(ready)command({action:'drag'});},
    retry(){if(ready)command({action:'retry'});},
    close(){enabled=false;if(mac){win.removeListener('move',geometry);win.removeListener('resize',geometry);}command({action:'quit'});closed=true;child.stdin.end();},
  };
}
module.exports={createPassiveInput};
