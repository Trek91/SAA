using System;using System.Runtime.InteropServices;using System.Diagnostics;
// Regression driver targets only the explicitly supplied disposable SAA window.
class NativeInputDriver{
 [StructLayout(LayoutKind.Sequential)]struct Point{public int x,y;}
 [StructLayout(LayoutKind.Sequential)]struct Mouse{public int dx,dy;public uint data,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)]struct Key{public ushort vk,scan;public uint flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Explicit)]struct Union{[FieldOffset(0)]public Mouse mouse;[FieldOffset(0)]public Key key;}
 [StructLayout(LayoutKind.Sequential)]struct Input{public uint type;public Union u;}
 [DllImport("user32.dll")]static extern uint SendInput(uint count,Input[] input,int size);
 [DllImport("user32.dll")]static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]static extern bool GetCursorPos(out Point p);
 [DllImport("user32.dll")]static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")]static extern IntPtr GetAncestor(IntPtr h,uint f);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern short VkKeyScan(char ch);
 [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr p);
 [DllImport("user32.dll")]static extern int GetSystemMetrics(int index);
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out Rect r);
 [StructLayout(LayoutKind.Sequential)]struct Rect{public int left,top,right,bottom;}
 static Input K(int vk,bool up){return new Input{type=1,u=new Union{key=new Key{vk=(ushort)vk,flags=up?2u:0u}}};}
 static void Send(params Input[] values){if(SendInput((uint)values.Length,values,Marshal.SizeOf(typeof(Input)))!=values.Length)throw new Exception("Test input delivery failed.");}
 static int Main(string[] a){try{
  IntPtr target=new IntPtr(Int64.Parse(a[0]));uint expected=UInt32.Parse(a[1]),owner;GetWindowThreadProcessId(target,out owner);if(owner!=expected)throw new Exception("Test target owner "+owner+" does not match SAA test process "+expected+" (HWND "+target+").");
  SetProcessDpiAwarenessContext(new IntPtr(-4));Point original;GetCursorPos(out original);
  if(a[2]=="foreground"){GetWindowThreadProcessId(GetForegroundWindow(),out owner);Console.Write(owner);return 0;}
  if(a[2]=="move"||a[2]=="enter"||a[2]=="leave"){
   Point destination=new Point{x=Int32.Parse(a[3]),y=Int32.Parse(a[4])};
   if(a[2]!="leave"&&GetAncestor(WindowFromPoint(destination),2)!=target)throw new Exception("The hover target must be inside the disposable SAA window.");
   if(a[2]=="enter"){Rect bounds;GetWindowRect(target,out bounds);SetCursorPos(bounds.left-20,destination.y);GetCursorPos(out original);}
   int left=GetSystemMetrics(76),top=GetSystemMetrics(77),width=GetSystemMetrics(78),height=GetSystemMetrics(79);
   for(int step=1;step<=24;step++){
    int x=original.x+(destination.x-original.x)*step/24,y=original.y+(destination.y-original.y)*step/24;
    Send(new Input{type=0,u=new Union{mouse=new Mouse{dx=(int)Math.Round((x-left)*65535.0/(width-1)),dy=(int)Math.Round((y-top)*65535.0/(height-1)),flags=0xc001}}});
   }
   Point actual;GetCursorPos(out actual);if(Math.Abs(actual.x-destination.x)>2||Math.Abs(actual.y-destination.y)>2)throw new Exception("Mouse movement was blocked: expected "+destination.x+","+destination.y+"; got "+actual.x+","+actual.y+".");
  }else if(a[2]=="click"){
   Point point=new Point{x=Int32.Parse(a[3]),y=Int32.Parse(a[4])};SetCursorPos(point.x,point.y);
   if(GetAncestor(WindowFromPoint(point),2)!=target)throw new Exception("SAA test window is not above the test browser at click position.");
   Send(new Input{type=0,u=new Union{mouse=new Mouse{flags=2}}},new Input{type=0,u=new Union{mouse=new Mouse{flags=4}}});SetCursorPos(original.x,original.y);
  }else{
   IntPtr foreground=GetForegroundWindow();GetWindowThreadProcessId(foreground,out owner);
   string foregroundName=Process.GetProcessById((int)owner).ProcessName;
   if(!foregroundName.Equals("msedge",StringComparison.OrdinalIgnoreCase))throw new Exception("Keyboard regression input requires the disposable Edge test browser to be foreground; foreground is "+foregroundName+" (PID "+owner+").");
   if(a[2]=="text")foreach(char c in a[3]){if(GetForegroundWindow()!=foreground)throw new Exception("Test foreground changed; stopped sending input.");int code=VkKeyScan(c);if(code<0)throw new Exception("Unsupported test character.");bool shift=(code&256)!=0;if(shift)Send(K(16,false));Send(K(code&255,false),K(code&255,true));if(shift)Send(K(16,true));}
   if(a[2]=="key"){int vk=Int32.Parse(a[3]);Send(K(vk,false),K(vk,true));}
  }return 0;
 }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
}
