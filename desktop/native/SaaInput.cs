using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Local input router. Keys are read only while the user has selected a SAA field.
// No key logs, files, network access, browser injection or elevated privileges.
class SaaInput {
  delegate IntPtr Hook(int code, IntPtr w, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] struct Point { public int x,y; }
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int left,top,right,bottom; }
  [StructLayout(LayoutKind.Sequential)] struct Mouse { public Point pt; public uint data,flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct Key { public uint vk,scan,flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct Msg { public IntPtr hwnd; public uint message; public UIntPtr w; public IntPtr l; public uint time; public Point pt; public uint priv; }
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id,Hook cb,IntPtr mod,uint tid);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h,int n,IntPtr w,IntPtr l);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern int GetMessage(out Msg m,IntPtr h,uint lo,uint hi);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref Msg m);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Msg m);
  [DllImport("user32.dll")] static extern bool PostThreadMessage(uint t,uint m,UIntPtr w,IntPtr l);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out Rect r);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h,ref Point p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern short GetKeyState(int key);
  [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint thread);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int ToUnicodeEx(uint key,uint scan,byte[] state,StringBuilder text,int size,uint flags,IntPtr layout);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
  static IntPtr window,mouseHook,keyHook,captureForeground;
  static volatile bool enabled,typing,dragging,exiting;
  static uint thread;
  static Hook mouseCallback=MouseEvent,keyCallback=KeyEvent;
  static bool leftHeld,pointerInside;
  static bool[] consumed=new bool[256];
  static long lastInput,pointerSequence;
  static object pendingPointer;
  static Point dragOrigin; static Rect dragBounds;
  static BlockingCollection<object> output=new BlockingCollection<object>(512);
  static JavaScriptSerializer json=new JavaScriptSerializer();
  static void Emit(object value) { if(exiting)return;try{if(!output.TryAdd(value)){typing=false;enabled=false;}}catch(InvalidOperationException){} }
  static void Release() { if(typing) { typing=false; Emit(new { type="typing",active=false }); } }
  static void Quit() { enabled=false;typing=false;exiting=true;PostThreadMessage(thread,0x12,UIntPtr.Zero,IntPtr.Zero); }
  static bool Active() { return enabled && IsWindowVisible(window); }
  static bool Inside(Point p,out Rect r,out Point origin) {
    origin=new Point(); GetClientRect(window,out r);ClientToScreen(window,ref origin);
    return p.x>=origin.x&&p.y>=origin.y&&p.x<origin.x+r.right&&p.y<origin.y+r.bottom&&GetAncestor(WindowFromPoint(p),2)==window;
  }
  static IntPtr MouseEvent(int code,IntPtr w,IntPtr l) {
    if(code<0||!Active()) return CallNextHookEx(mouseHook,code,w,l);
    Mouse m=(Mouse)Marshal.PtrToStructure(l,typeof(Mouse)); int message=w.ToInt32();
    Rect r;Point origin;bool inside=Inside(m.pt,out r,out origin);
    if(message==0x200&&!inside&&pointerInside){
      Interlocked.Exchange(ref pendingPointer,null);
      Emit(new {type="pointer",kind="leave",seq=Interlocked.Increment(ref pointerSequence)});
    }
    pointerInside=inside;
    bool down=message==0x201||message==0x204;
    if(down) Release();
    if(!inside&&!leftHeld) return CallNextHookEx(mouseHook,code,w,l);
    if(message==0x201) { leftHeld=true;captureForeground=GetForegroundWindow(); }
    if(message==0x202) leftHeld=false;
    if(message==0x200&&dragging) { SetWindowPos(window,IntPtr.Zero,dragBounds.left+m.pt.x-dragOrigin.x,dragBounds.top+m.pt.y-dragOrigin.y,0,0,0x15); }
    if(message==0x202)dragging=false;
    string kind=message==0x201?"down":message==0x202?"up":message==0x200?"move":message==0x20a?"wheel":null;
    if(kind!=null){
      object packet=new { type="pointer",kind=kind,seq=Interlocked.Increment(ref pointerSequence),x=m.pt.x-origin.x,y=m.pt.y-origin.y,width=r.right,height=r.bottom,delta=kind=="wheel"?(short)(m.data>>16):0 };
      // Coalesce motion for the renderer, preserving the final position. This
      // limits pipe traffic without discarding any movement at the OS boundary.
      if(kind=="move")Interlocked.Exchange(ref pendingPointer,packet);
      else{Interlocked.Exchange(ref pendingPointer,null);Emit(packet);}
    }
    // Movement must reach Windows: swallowing WM_MOUSEMOVE prevents the physical
    // pointer entering the panel and suppresses Chromium's hover/cursor updates.
    // Only overlay button/wheel actions are intercepted to avoid activation.
    if(message==0x201||message==0x202||message==0x20a||message==0x204||message==0x205) return new IntPtr(1);
    return CallNextHookEx(mouseHook,code,w,l);
  }
  static bool Held(int vk) { return (GetAsyncKeyState(vk)&0x8000)!=0; }
  static IntPtr KeyEvent(int code,IntPtr w,IntPtr l) {
    if(code<0)return CallNextHookEx(keyHook,code,w,l);
    Key k=(Key)Marshal.PtrToStructure(l,typeof(Key));int vk=(int)k.vk;bool down=w.ToInt32()==0x100||w.ToInt32()==0x104;
    if(!down&&vk<256&&consumed[vk]) { consumed[vk]=false;return new IntPtr(1); }
    if(!typing||!Active())return CallNextHookEx(keyHook,code,w,l);
    if(GetForegroundWindow()!=captureForeground) { Release();return CallNextHookEx(keyHook,code,w,l); }
    bool ctrl=Held(0x11),shift=Held(0x10),alt=Held(0x12);
    if(vk==0x5b||vk==0x5c||vk==0x12||alt) { Release();return CallNextHookEx(keyHook,code,w,l); }
    if(!down)return CallNextHookEx(keyHook,code,w,l);
    if(vk==0x10||vk==0x11||vk==0x14||vk==0xa0||vk==0xa1||vk==0xa2||vk==0xa3)return CallNextHookEx(keyHook,code,w,l);
    if(vk==27) { Release();consumed[vk]=true;return new IntPtr(1); }
    if(ctrl&&vk!=65&&vk!=67&&vk!=88&&vk!=86&&vk!=90&&vk!=89&&vk!=8&&vk!=37&&vk!=39&&vk!=36&&vk!=35) { Release();return CallNextHookEx(keyHook,code,w,l); }
    string key=null,text="";
    switch(vk) {case 8:key="Backspace";break;case 9:key="Tab";break;case 13:key="Enter";break;case 35:key="End";break;case 36:key="Home";break;case 37:key="ArrowLeft";break;case 38:key="ArrowUp";break;case 39:key="ArrowRight";break;case 40:key="ArrowDown";break;case 46:key="Delete";break;}
    if(ctrl&&key==null)key=((char)vk).ToString().ToLowerInvariant();
    if(key==null) {
      byte[] state=new byte[256];for(int i=0;i<256;i++)if(Held(i))state[i]=0x80;
      state[vk]=0x80;state[0x10]=(byte)(shift?0x80:0);state[0x11]=(byte)(ctrl?0x80:0);state[0x14]=(byte)(GetKeyState(0x14)&1);
      uint pid;uint tid=GetWindowThreadProcessId(captureForeground,out pid);StringBuilder result=new StringBuilder(16);
      int count=ToUnicodeEx(k.vk,k.scan,state,result,16,4,GetKeyboardLayout(tid));
      if(count>0)text=result.ToString(0,count);
      else if(count<0)text=result.ToString();
      else return CallNextHookEx(keyHook,code,w,l);
    }
    lastInput=Environment.TickCount&Int32.MaxValue;consumed[vk]=true;
    Emit(new {type="key",key=key,text=text,ctrl=ctrl,shift=shift});return new IntPtr(1);
  }
  static void Commands() {
    try { string line;while((line=Console.ReadLine())!=null) {
      Dictionary<string,object> cmd=json.Deserialize<Dictionary<string,object>>(line);
      string action=Convert.ToString(cmd["action"]);
      if(action=="state") { enabled=Convert.ToBoolean(cmd["enabled"]); if(!enabled) { Release();leftHeld=false;dragging=false;pointerInside=false;Interlocked.Exchange(ref pendingPointer,null); } }
      if(action=="typing") { bool requested=enabled&&Convert.ToBoolean(cmd["active"]);if(!requested)Release();else{typing=true;captureForeground=GetForegroundWindow();lastInput=Environment.TickCount&Int32.MaxValue;Emit(new {type="typing",active=true});} }
      if(action=="drag") {GetCursorPos(out dragOrigin);GetWindowRect(window,out dragBounds);dragging=enabled&&leftHeld;}
      if(action=="quit")break;
    }} catch {} finally { Quit(); }
  }
  [STAThread] static int Main(string[] args) {
    if(args.Length!=2)return 2;
    window=new IntPtr(Int64.Parse(args[0]));int parent=Int32.Parse(args[1]);uint owner;GetWindowThreadProcessId(window,out owner);if(owner!=parent)return 3;
    SetProcessDpiAwarenessContext(new IntPtr(-4));thread=GetCurrentThreadId();
    var writer=new Thread(()=>{try{foreach(object value in output.GetConsumingEnumerable()){Console.WriteLine(new JavaScriptSerializer().Serialize(value));Console.Out.Flush();}}catch{Quit();}});writer.IsBackground=true;writer.Start();
    mouseHook=SetWindowsHookEx(14,mouseCallback,GetModuleHandle(null),0);keyHook=SetWindowsHookEx(13,keyCallback,GetModuleHandle(null),0);
    if(mouseHook==IntPtr.Zero||keyHook==IntPtr.Zero)return 4;
    new Thread(Commands){IsBackground=true}.Start();
    var motion=new Timer(_=>{object packet=Interlocked.Exchange(ref pendingPointer,null);if(packet!=null&&Active())Emit(packet);},null,16,16);
    var watchdog=new Timer(_=>{try{using(var parentProcess=Process.GetProcessById(parent)){if(parentProcess.HasExited)Quit();}if(typing&&((Environment.TickCount&Int32.MaxValue)-lastInput)>120000)Release();}catch{Quit();}},null,1000,1000);
    Emit(new {type="ready"});Msg msg;while(!exiting&&GetMessage(out msg,IntPtr.Zero,0,0)>0){TranslateMessage(ref msg);DispatchMessage(ref msg);}
    UnhookWindowsHookEx(mouseHook);UnhookWindowsHookEx(keyHook);motion.Dispose();watchdog.Dispose();output.CompleteAdding();return 0;
  }
}
