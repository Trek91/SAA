# SAA source investigation

Reference: `../pluely-master`, package version 0.1.9. Source inspection only; reference execution was not necessary. The reverse-engineer-anything skill explicitly routes complete source repositories through ordinary source tools.

| Question | Source evidence | Outcome |
|---|---|---|
| Chat flow | `src/hooks/useCompletion.ts:55`, `src/hooks/useChatCompletion.ts:49`, `src/lib/functions/ai-response.function.ts:164` | Retained multi-turn conversation and streaming through a new native adapter. |
| Custom APIs | `src/hooks/useCustomProvider.ts:83`, `src/types/provider.type.ts:1`, `src/config/ai-providers.constants.ts:1` | Replaced cURL parsing with explicit endpoint, headers, JSON body template and response paths. |
| Images | `src/hooks/useChatCompletion.ts:409,497,538,581,605` | Retained image attach/paste and screen context; capture attaches for review. Region selection is deferred because a selection window may activate and disrupt fullscreen. |
| Transparency | `src/contexts/theme.context.tsx:92`, `src/global.css:125` | Retained background opacity and readable text. SAA exposes this without subscription checks. |
| Floating UI | `src/pages/app/index.tsx:40`, `src/pages/app/components/completion/Input.tsx:50,90` | Similar neutral dark rounded panel, compact toolbar, expanding chat and bottom composer. |
| History | `src/lib/database/chat-history.action.ts:150,204,255,344,407` | Replaced SQLite delete/reinsert flow with bounded atomic local file writes for the smaller app. |
| Focus | `src-tauri/src/window.rs:23-27`, `src-tauri/src/shortcuts.rs:188-213` | Reference Windows nonfocusable code is commented out; show shortcut explicitly focuses. SAA defaults nonfocusable and showInactive instead. |
| Meetings | `src/hooks/useSystemAudio.ts`, `src/pages/app/components/speech`, `src/pages/audio`, `src/pages/dev/components/stt-configs` | Excluded. |

Observed reference risks avoided: browser fetch/CORS selection at ai-response.function.ts:294; credentials in localStorage at app.context.tsx:491; array sort mutation in completion/Input.tsx:175; nontransactional history replacement at chat-history.action.ts:255-327; dropped final stream buffer.

## Evidence boundaries
Source establishes intended/reference implementation, not its runtime reliability. New SAA behavior is verified separately in QA.md. No REA Evidence IDs exist because no packaged binary analysis was run. The original source tree is untouched. SAA is a new implementation guided by observed behavior, not a copy of the full reference app.

## Window references
- Electron BrowserWindow: https://www.electronjs.org/docs/latest/api/browser-window — showInactive, focusability, click-through.
- Microsoft SetWindowPos: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos — activation and topmost are separate concerns.
- Microsoft fullscreen optimizations: https://devblogs.microsoft.com/directx/demystifying-full-screen-optimizations/ — explains the separate exclusive-game fullscreen case; user clarified that browser fullscreen is the actual target.
