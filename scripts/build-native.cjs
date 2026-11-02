const {spawnSync}=require('node:child_process');
const path=require('node:path');
if(process.platform==='win32'){
 const source=path.join(__dirname,'../desktop/native/SaaInput.cs');
 const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const result=spawnSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/reference:System.Web.Extensions.dll',`/out:${path.join(__dirname,'../desktop/native/SaaInput.exe')}`,source],{stdio:'inherit',windowsHide:true});
 if(result.error)throw result.error;process.exitCode=result.status||0;
}
if(process.platform==='darwin'){
 const result=spawnSync('xcrun',['clang','-fobjc-arc','-O2','-mmacosx-version-min=12.0','-framework','Cocoa','-framework','ApplicationServices','-framework','Carbon',path.join(__dirname,'../desktop/native/SaaInputMac.m'),'-o',path.join(__dirname,'../desktop/native/SaaInputMac')],{stdio:'inherit'});
 if(result.error)throw result.error;process.exitCode=result.status||0;
}
