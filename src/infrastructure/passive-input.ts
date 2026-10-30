import { bridge, isDesktop } from './bridge';
import type { PassiveEvent } from '../domain/types';
type Field=HTMLInputElement|HTMLTextAreaElement;
export function installPassiveInput(){
 if(!isDesktop)return ()=>{};
 let selected:Field|null=null,pressed:Element|null=null,range:HTMLInputElement|null=null;
 let hovered:Element|null=null,lastPointerSequence=0;
 let queue=Promise.resolve();
 const history=new WeakMap<Field,{undo:string[];redo:string[]}>();
 function editable(el:Element|null):el is Field{return (el instanceof HTMLTextAreaElement||(el instanceof HTMLInputElement&&['text','password','url','search','tel'].includes(el.type)))&&!el.disabled&&!el.readOnly;}
 function release(){selected?.classList.remove('passive-editing');selected=null;void bridge.passiveControl('release');}
 function choose(el:Field){selected?.classList.remove('passive-editing');selected=el;el.classList.add('passive-editing');el.focus({preventScroll:true});if(el.type!=='number')el.setSelectionRange(el.value.length,el.value.length);void bridge.passiveControl('type');}
 function nativeValue(el:Field,value:string){const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
 function replace(el:Field,text:string,start=el.selectionStart??el.value.length,end=el.selectionEnd??start){const old=el.value;const states=history.get(el)??{undo:[],redo:[]};states.undo.push(old);if(states.undo.length>100)states.undo.shift();states.redo=[];history.set(el,states);nativeValue(el,old.slice(0,start)+text+old.slice(end));if(el.type!=='number')el.setSelectionRange(start+text.length,start+text.length);}
 function setRange(el:HTMLInputElement,x:number){const rect=el.getBoundingClientRect(),min=Number(el.min||0),max=Number(el.max||100),step=Number(el.step||1);const value=Math.min(max,Math.max(min,Math.round((min+(max-min)*(x-rect.left)/rect.width)/step)*step));nativeValue(el,String(value));}
 function point(e:PassiveEvent){return {x:(e.x??0)*innerWidth/(e.width||innerWidth),y:(e.y??0)*innerHeight/(e.height||innerHeight)};}
 function hover(el:Element|null){const target=el?.closest('button,summary,input,textarea')??null;if(target!==hovered){hovered?.classList.remove('passive-hover');hovered=target;hovered?.classList.add('passive-hover');}}
 function pointer(e:PassiveEvent){
  if(e.seq!==undefined){if(e.seq<=lastPointerSequence)return;lastPointerSequence=e.seq;}
  if(e.kind==='leave'){hover(null);return;}
  const p=point(e),el=document.elementFromPoint(p.x,p.y);
  hover(el);
  if(e.kind==='wheel'){let scroll=el;while(scroll&&scroll.scrollHeight<=scroll.clientHeight)scroll=scroll.parentElement;scroll?.scrollBy({top:-(e.delta??0),behavior:'auto'});return;}
  if(e.kind==='down'){
   pressed=el;release();
   if(editable(el))choose(el);
   else if(el instanceof HTMLInputElement&&el.type==='range'){range=el;setRange(el,p.x);}
   else if(el?.closest('.toolbar')&&!el.closest('button,nav'))void bridge.passiveControl('drag');
  }
  if(e.kind==='move'&&range)setRange(range,p.x);
  if(e.kind==='up'){
   if(range){setRange(range,p.x);range=null;}
   else if(el&&pressed){const target=el.closest('button,summary,a,input[type=checkbox],label');if(target&&target.contains(pressed)&&target instanceof HTMLElement)target.click();}
   pressed=null;
  }
 }
 async function key(e:PassiveEvent){
  const el=selected;if(!el||!el.isConnected||el.disabled)return release();
  let start=el.selectionStart??el.value.length,end=el.selectionEnd??start;
  if(e.ctrl){
   if(e.key==='a'){el.select();return;}
   if(e.key==='c'||e.key==='x'){if(el.type==='password')return;await bridge.writeClipboard(el.value.slice(start,end));if(e.key==='x'&&selected===el)replace(el,'',start,end);return;}
   if(e.key==='v'){const data=await bridge.clipboard();if(selected!==el)return;if(data.image&&el.getAttribute('aria-label')==='Message')window.dispatchEvent(new CustomEvent('saa-paste-image',{detail:data.image}));if(data.text)replace(el,data.text,start,end);return;}
   if(e.key==='z'||e.key==='y'){const states=history.get(el);if(!states)return;const from=e.key==='z'?states.undo:states.redo,to=e.key==='z'?states.redo:states.undo;const value=from.pop();if(value!==undefined){to.push(el.value);nativeValue(el,value);el.setSelectionRange(value.length,value.length);}return;}
  }
  if(e.key==='Enter'){
   if(el instanceof HTMLTextAreaElement&&(e.shift||el.getAttribute('aria-label')!=='Message'))replace(el,'\n');
   else if(el.getAttribute('aria-label')==='Message'){el.form?.requestSubmit();release();}
   return;
  }
  if(e.key==='Tab'){const fields=[...document.querySelectorAll('input,textarea')].filter(editable);const i=fields.indexOf(el);const next=fields[(i+(e.shift?-1:1)+fields.length)%fields.length];if(next)choose(next);return;}
  if(e.key==='Backspace'){if(start===end&&start>0)start=e.ctrl?el.value.slice(0,start).search(/\S+\s*$/u):start-(el.value.codePointAt(start-2)!>0xffff?2:1);replace(el,'',Math.max(0,start),end);return;}
  if(e.key==='Delete'){if(start===end)end=Math.min(el.value.length,end+1);replace(el,'',start,end);return;}
  if(e.key?.startsWith('Arrow')||e.key==='Home'||e.key==='End'){
   let next=e.key==='Home'?0:e.key==='End'?el.value.length:e.key==='ArrowLeft'||e.key==='ArrowUp'?Math.max(0,start-1):Math.min(el.value.length,end+1);
   if(e.ctrl&&e.key==='ArrowLeft')next=Math.max(0,el.value.slice(0,start).search(/\S+\s*$/u));
   if(e.ctrl&&e.key==='ArrowRight'){const boundary=el.value.slice(end).search(/\s\S/u);next=boundary<0?el.value.length:end+boundary+1;}
   el.setSelectionRange(e.shift?Math.min(start,next):next,e.shift?Math.max(end,next):next);return;
  }
  if(e.text)replace(el,e.text);
 }
 const unsubscribe=bridge.onPassiveInput(e=>{if(e.type==='pointer')pointer(e);else queue=queue.then(()=>key(e)).catch(()=>release());});
 const action=bridge.onAction(e=>{if(e.type==='mode'||e.type==='clickThrough')hover(null);if((e.type==='typing'&&!e.active)||(e.type==='mode'&&e.mode!=='passive')||(e.type==='clickThrough'&&e.clickThrough)){selected?.classList.remove('passive-editing');selected=null;}});
 return ()=>{unsubscribe();action();hover(null);release();};
}
