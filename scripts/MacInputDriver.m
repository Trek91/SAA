#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
int main(int argc,const char **argv){@autoreleasepool{
    if(argc<2)return 2;NSString *action=@(argv[1]);
    if([action isEqual:@"foreground"]){printf("%d\n",NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier);return 0;}
    if([action isEqual:@"status"]){printf("%s\n",AXIsProcessTrusted()?"trusted":"denied");return 0;}
    if(argc<3)return 2;pid_t expected=atoi(argv[2]);
    if([action isEqual:@"focus"]){NSRunningApplication *app=[NSRunningApplication runningApplicationWithProcessIdentifier:expected];return [app activateWithOptions:NSApplicationActivateIgnoringOtherApps]?0:3;}
    if(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier!=expected){fprintf(stderr,"Fixture lost foreground; refusing synthetic input\n");return 4;}
    if(!AXIsProcessTrusted()){fprintf(stderr,"Accessibility permission is required in this test runner\n");return 5;}
    CGEventSourceRef source=CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
    if([action isEqual:@"click"]||[action isEqual:@"move"]){
        if(argc!=5)return 2;CGPoint p=CGPointMake(atof(argv[3]),atof(argv[4]));
        CGEventRef move=CGEventCreateMouseEvent(source,kCGEventMouseMoved,p,kCGMouseButtonLeft);CGEventPost(kCGHIDEventTap,move);CFRelease(move);usleep(60000);
        if([action isEqual:@"click"]){for(int i=0;i<2;i++){CGEventRef e=CGEventCreateMouseEvent(source,i?kCGEventLeftMouseUp:kCGEventLeftMouseDown,p,kCGMouseButtonLeft);CGEventPost(kCGHIDEventTap,e);CFRelease(e);usleep(60000);}}
    }else if([action isEqual:@"text"]){
        if(argc!=4)return 2;NSString *text=@(argv[3]);
        for(NSUInteger i=0;i<text.length;i++){UniChar ch=[text characterAtIndex:i];for(int down=1;down>=0;down--){CGEventRef e=CGEventCreateKeyboardEvent(source,0,down);CGEventKeyboardSetUnicodeString(e,1,&ch);CGEventPost(kCGHIDEventTap,e);CFRelease(e);usleep(12000);}}
    }else if([action isEqual:@"key"]){
        if(argc<4)return 2;int code=atoi(argv[3]);CGEventFlags flags=argc>4?strtoull(argv[4],NULL,10):0;
        for(int down=1;down>=0;down--){CGEventRef e=CGEventCreateKeyboardEvent(source,code,down);CGEventSetFlags(e,flags);CGEventPost(kCGHIDEventTap,e);CFRelease(e);usleep(30000);}
    }else return 2;
    CFRelease(source);return 0;
}}
