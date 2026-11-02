#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#include <signal.h>
#include <unistd.h>

// A local, user-authorized event router. No event contents are written to disk.
// The event tap is used only for this parent's visible window and selected field.
static pid_t parentPID, foregroundPID;
static CGWindowID windowID;
static BOOL enabled, typing, held, dragging, insideBefore, exiting;
static BOOL consumed[256];
static CGPoint dragOrigin;
static CGRect dragBounds;
static uint64_t sequence;
static CFMachPortRef tap;
static CFRunLoopSourceRef tapSource;
static NSDictionary *pendingMotion;
static NSTimeInterval lastInput;

static void Emit(NSDictionary *value) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    if (data) { fwrite(data.bytes, 1, data.length, stdout); fputc('\n', stdout); fflush(stdout); }
}
static void Release(void) {
    if (typing) { typing=NO; Emit(@{@"type":@"typing",@"active":@NO}); }
}
static NSArray *Windows(CGWindowListOption options) {
    return CFBridgingRelease(CGWindowListCopyWindowInfo(options,windowID));
}
static BOOL Bounds(CGRect *rect) {
    for (NSDictionary *info in Windows(kCGWindowListOptionIncludingWindow)) {
        if ([info[(__bridge NSString *)kCGWindowOwnerPID] intValue] != parentPID) return NO;
        return CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)info[(__bridge NSString *)kCGWindowBounds],rect);
    }
    return NO;
}
static BOOL Inside(CGPoint point, CGRect *bounds) {
    if (!Bounds(bounds) || !CGRectContainsPoint(*bounds,point)) return NO;
    // Front-to-back hit testing excludes windows covering the SAA panel.
    for (NSDictionary *info in Windows(kCGWindowListOptionOnScreenOnly|kCGWindowListExcludeDesktopElements)) {
        CGRect rect;
        if ([info[(__bridge NSString *)kCGWindowAlpha] doubleValue] <= 0) continue;
        if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)info[(__bridge NSString *)kCGWindowBounds],&rect)) continue;
        if (CGRectContainsPoint(rect,point)) return [info[(__bridge NSString *)kCGWindowNumber] unsignedIntValue]==windowID;
    }
    return NO;
}
static pid_t Foreground(void) { return NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier; }
static CGEventRef Event(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *context) {
    if(type==kCGEventTapDisabledByTimeout||type==kCGEventTapDisabledByUserInput){
        Release(); held=NO; dragging=NO; if(tap)CGEventTapEnable(tap,true); return event;
    }
    if(type==kCGEventKeyUp){
        int code=(int)CGEventGetIntegerValueField(event,kCGKeyboardEventKeycode);
        if(code>=0&&code<256&&consumed[code]){consumed[code]=NO;return NULL;}
    }
    if(!enabled)return event;
    if(type==kCGEventKeyDown||type==kCGEventKeyUp||type==kCGEventFlagsChanged){
        if(!typing)return event;
        if(Foreground()!=foregroundPID||IsSecureEventInputEnabled()){Release();return event;}
        if(type!=kCGEventKeyDown)return event;
        int code=(int)CGEventGetIntegerValueField(event,kCGKeyboardEventKeycode);
        CGEventFlags flags=CGEventGetFlags(event);
        BOOL command=(flags&kCGEventFlagMaskCommand)!=0,control=(flags&kCGEventFlagMaskControl)!=0,shift=(flags&kCGEventFlagMaskShift)!=0;
        if(code==53){Release();if(code<256)consumed[code]=YES;return NULL;}
        if(control){Release();return event;}
        NSString *key=nil,*text=@"";
        switch(code){case 51:key=@"Backspace";break;case 117:key=@"Delete";break;case 48:key=@"Tab";break;case 36:case 76:key=@"Enter";break;case 123:key=@"ArrowLeft";break;case 124:key=@"ArrowRight";break;case 125:key=@"ArrowDown";break;case 126:key=@"ArrowUp";break;case 115:key=@"Home";break;case 119:key=@"End";break;}
        if(command){
            // Physical command keys remain valid across keyboard layouts.
            switch(code){case 0:key=@"a";break;case 8:key=@"c";break;case 7:key=@"x";break;case 9:key=@"v";break;case 6:key=shift?@"y":@"z";break;case 123:key=@"Home";break;case 124:key=@"End";break;default:Release();return event;}
        }
        if(!key){
            NSEvent *native=[NSEvent eventWithCGEvent:event];
            text=native.characters?:@"";
            if(!text.length)return event;
        }
        if(code>=0&&code<256)consumed[code]=YES;
        lastInput=NSProcessInfo.processInfo.systemUptime;
        Emit(@{@"type":@"key",@"key":key?:@"",@"text":text,@"ctrl":@(command),@"shift":@(shift)});
        return NULL;
    }
    CGPoint p=CGEventGetLocation(event);CGRect bounds=CGRectZero;
    BOOL inside=Inside(p,&bounds);
    BOOL motion=type==kCGEventMouseMoved||type==kCGEventLeftMouseDragged||type==kCGEventRightMouseDragged;
    if(!inside&&insideBefore){pendingMotion=nil;Emit(@{@"type":@"pointer",@"kind":@"leave",@"seq":@(++sequence)});}
    insideBefore=inside;
    BOOL down=type==kCGEventLeftMouseDown||type==kCGEventRightMouseDown;
    if(down)Release();
    if(!inside&&!held)return event;
    if(type==kCGEventLeftMouseDown){held=YES;foregroundPID=Foreground();}
    if(type==kCGEventLeftMouseUp)held=NO;
    NSString *kind=type==kCGEventLeftMouseDown?@"down":type==kCGEventLeftMouseUp?@"up":motion?@"move":type==kCGEventScrollWheel?@"wheel":nil;
    if(dragging&&motion){Emit(@{@"type":@"drag",@"x":@(dragBounds.origin.x+p.x-dragOrigin.x),@"y":@(dragBounds.origin.y+p.y-dragOrigin.y)});}
    if(type==kCGEventLeftMouseUp)dragging=NO;
    if(kind){
        double delta=CGEventGetIntegerValueField(event,kCGScrollWheelEventIsContinuous)?CGEventGetIntegerValueField(event,kCGScrollWheelEventPointDeltaAxis1):CGEventGetIntegerValueField(event,kCGScrollWheelEventDeltaAxis1)*24;
        NSDictionary *packet=@{@"type":@"pointer",@"kind":kind,@"seq":@(++sequence),@"x":@(p.x-bounds.origin.x),@"y":@(p.y-bounds.origin.y),@"width":@(bounds.size.width),@"height":@(bounds.size.height),@"delta":@(delta)};
        if(motion)pendingMotion=packet;else{pendingMotion=nil;Emit(packet);}
    }
    // Never obstruct pointer movement. Suppress only overlay clicks/scrolls.
    if(type==kCGEventLeftMouseDown||type==kCGEventLeftMouseUp||type==kCGEventRightMouseDown||type==kCGEventRightMouseUp||type==kCGEventScrollWheel)return NULL;
    return event;
}
static void InstallTap(void) {
    if(tap||!AXIsProcessTrusted())return;
    CGEventMask mask=CGEventMaskBit(kCGEventMouseMoved)|CGEventMaskBit(kCGEventLeftMouseDragged)|CGEventMaskBit(kCGEventRightMouseDragged)|CGEventMaskBit(kCGEventLeftMouseDown)|CGEventMaskBit(kCGEventLeftMouseUp)|CGEventMaskBit(kCGEventRightMouseDown)|CGEventMaskBit(kCGEventRightMouseUp)|CGEventMaskBit(kCGEventScrollWheel)|CGEventMaskBit(kCGEventKeyDown)|CGEventMaskBit(kCGEventKeyUp)|CGEventMaskBit(kCGEventFlagsChanged);
    tap=CGEventTapCreate(kCGSessionEventTap,kCGHeadInsertEventTap,kCGEventTapOptionDefault,mask,Event,NULL);
    if(!tap)return;
    tapSource=CFMachPortCreateRunLoopSource(kCFAllocatorDefault,tap,0);
    CFRunLoopAddSource(CFRunLoopGetMain(),tapSource,kCFRunLoopCommonModes);CGEventTapEnable(tap,true);
    Emit(@{@"type":@"permission",@"ready":@YES});
}
static void Command(NSDictionary *cmd) {
    NSString *action=cmd[@"action"];
    if([action isEqual:@"state"]){enabled=[cmd[@"enabled"] boolValue];if(!enabled){Release();held=NO;dragging=NO;insideBefore=NO;pendingMotion=nil;}}
    if([action isEqual:@"typing"]){if(enabled&&tap&&[cmd[@"active"] boolValue]){typing=YES;foregroundPID=Foreground();lastInput=NSProcessInfo.processInfo.systemUptime;Emit(@{@"type":@"typing",@"active":@YES});}else Release();}
    if([action isEqual:@"drag"]){CGEventRef e=CGEventCreate(NULL);dragOrigin=CGEventGetLocation(e);CFRelease(e);dragging=enabled&&held&&Bounds(&dragBounds);}
    if([action isEqual:@"retry"])InstallTap();
    if([action isEqual:@"quit"]){exiting=YES;Release();CFRunLoopStop(CFRunLoopGetMain());}
}
int main(int argc,const char **argv){@autoreleasepool{
    if(argc!=3)return 2;
    windowID=(CGWindowID)strtoul(argv[1],NULL,10);parentPID=(pid_t)atoi(argv[2]);
    if(parentPID!=getppid())return 3;
    // A newly created Electron window may not be on the WindowServer list yet.
    // Every hit test checks the window's actual owning PID before routing input.
    setbuf(stdout,NULL);
    [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
    InstallTap();Emit(@{@"type":@"ready"});Emit(@{@"type":@"permission",@"ready":@(tap!=NULL)});
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{
        char *line=NULL;size_t length=0;
        while(getline(&line,&length,stdin)>0){
            @autoreleasepool{NSData *data=[[NSString stringWithUTF8String:line] dataUsingEncoding:NSUTF8StringEncoding];NSDictionary *cmd=[NSJSONSerialization JSONObjectWithData:data options:0 error:nil];if([cmd isKindOfClass:NSDictionary.class])dispatch_async(dispatch_get_main_queue(),^{Command(cmd);});}
        }
        free(line);dispatch_async(dispatch_get_main_queue(),^{Command(@{@"action":@"quit"});});
    });
    NSTimer *motion=[NSTimer timerWithTimeInterval:0.016 repeats:YES block:^(NSTimer *t){if(pendingMotion&&enabled){NSDictionary *packet=pendingMotion;pendingMotion=nil;Emit(packet);}}];
    [NSRunLoop.mainRunLoop addTimer:motion forMode:NSRunLoopCommonModes];
    NSTimer *watchdog=[NSTimer timerWithTimeInterval:1 repeats:YES block:^(NSTimer *t){
        if(kill(parentPID,0)!=0||getppid()!=parentPID){exiting=YES;CFRunLoopStop(CFRunLoopGetMain());}
        if(typing&&(Foreground()!=foregroundPID||NSProcessInfo.processInfo.systemUptime-lastInput>120||IsSecureEventInputEnabled()))Release();
        InstallTap();
    }];[NSRunLoop.mainRunLoop addTimer:watchdog forMode:NSRunLoopCommonModes];
    CFRunLoopRun();[motion invalidate];[watchdog invalidate];if(tap){CGEventTapEnable(tap,false);CFRunLoopRemoveSource(CFRunLoopGetMain(),tapSource,kCFRunLoopCommonModes);CFRelease(tapSource);CFRelease(tap);}return 0;
}}
