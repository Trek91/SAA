# Desktop bridge

Electron runs `main.cjs` and exposes only `window.saa` through the sandboxed `preload.cjs`. In production it loads `../dist/index.html`. For local development set `SAA_DEV_URL` to an HTTP localhost origin with a port.

All bridge methods return promises except the two subscriptions:

| Method | Result |
| --- | --- |
| `load()` | `{settings, conversations, mode, clickThrough, compact, shortcutsFailed, storageWarning}` |
| `saveSettings(settings)` | Sanitized settings; `apiKey` is always empty, `hasKey` indicates a saved key. Empty API key preserves the saved key; `clearApiKey: true` deletes it. |
| `saveAppearance({opacity?,alwaysOnTop?})` | Sanitized settings; only these two appearance fields are accepted. Use this for slider/pin autosave instead of resending API settings. |
| `saveConversations(array)` | `true`; maximum 200 conversations and 24 MB |
| `startChat({id,messages})` | `{id}` immediately after validation. IDs must contain 1–128 letters, digits, `_` or `-`. Only one request can run at once. |
| `cancelChat(id)` | `true`; cancelled request emits `done` with `cancelled: true` |
| `clipboard()` | `{text,image?}`, image is a PNG/JPEG/WebP data URL, maximum 6 MB binary payload |
| `writeClipboard(text)` | `true`; writes up to 4 MB of text natively without focusing SAA |
| `capture()` | Screen image data URL, taken from the display under the cursor |
| `windowAction(action)` | `{mode,clickThrough,compact,alwaysOnTop}` |
| `onChat(callback)` | Returns unsubscribe function; events `{id,type:'delta',text}`, `{id,type:'done',cancelled?}`, `{id,type:'error',text}` |
| `onAction(callback)` | Returns unsubscribe function; events described below |

Window actions: `hide`, `mode`, `clickThrough`, `pin`, `compact`, `quit`. The `mode` action explicitly toggles between passive and interactive. Only interactive mode requests foreground focus. Showing a hidden window always returns to passive mode. Pin changes persist.

Action events:

- `{type:'clipboard',text,image?}`: global clipboard question shortcut. The renderer decides whether there is enough text to submit, never submits clipboard images automatically.
- `{type:'capture',image}`: attach for review; never send automatically.
- `{type:'mode',mode:'passive'|'interactive'}`
- `{type:'clickThrough',clickThrough:boolean}`
- `{type:'compact',compact:boolean}`
- `{type:'settings',settings}`
- `{type:'error',text}`

Messages use `{role:'system'|'user'|'assistant',content:string|ContentPart[]}`. A content part is `{type:'text',text}` or `{type:'image_url',image_url:{url:'data:image/png;base64,...'}}`; JPEG and WebP are also supported. The configured system prompt is prepended unless the request already contains a system message. Subscribe before invoking `startChat` and correlate every event with its ID.

Settings: `endpoint`, `model`, `apiKey`, `headers` (JSON object string), `systemPrompt`, `bodyTemplate`, `responsePath`, `streamPath`, `stream`, `opacity` (0.35–1), `alwaysOnTop`. Default request is OpenAI-compatible chat completions. Optional custom request templates contain **unquoted** JSON value placeholders `{{model}}`, `{{messages}}`, `{{conversation}}`, `{{system}}`. `{{messages}}` includes the system message as before; `{{conversation}}` contains only user/assistant history, for providers such as Anthropic that require a separate top-level system field. A template controls its own streaming field. Response paths accept dot notation and numeric bracket notation. SSE and complete JSON responses are supported, including JSON fallback when a streaming request returns `application/json`.

All settings, including custom header credentials, are encrypted on disk using Electron safeStorage. API keys are not returned to the renderer; header values remain visible in its editor. History is plaintext in the application user-data directory. Requests go through the native Node HTTP stack and do not depend on browser CORS. Remote endpoints require HTTPS; HTTP is allowed only for localhost, 127.0.0.1 and ::1. Redirects are refused before credentials can be replayed. No retry is automatic.

Settings changes are serialized as complete merge/validate/persist/commit transactions, including appearance-only changes and native pin toggles. Unreadable settings/history files are copied to timestamped `.recovery` files before replacement is allowed; if backup fails, writes to that file are blocked until restart. `storageWarning` explains what happened. Windows screenshots temporarily exclude SAA through the native screen-capture protection API and restore its prior protection state. Capture calls share a single pending operation and never change the overlay's visibility or foreground focus.

Runtime notes: Electron 45 clipboard reads/writes are asynchronous. Native code awaits `readText()`, reads image `ClipboardItem` MIME types with `read()`/`getType()` and converts a bounded Blob to a data URL. A copy operation resolves only after `writeText()` completes; failures reach the renderer. Do not replace these calls with removed synchronous `readImage()` methods. Windows shortcuts are Ctrl+Shift+Space (show/hide), Ctrl+Alt+I (interactive/passive), Ctrl+Shift+Q (ask clipboard), Ctrl+Shift+X (click-through), Ctrl+Alt+S (capture). Registration failures are exposed through `shortcutsFailed`; shortcut availability depends on other running apps.

Run checks with `node --test desktop/*.test.cjs`. Provider checks use real ephemeral loopback HTTP servers and require no API credentials. Storage checks verify concurrent settings updates, failed-write recovery and exact preservation of unreadable files. Clipboard checks verify the asynchronous Electron 45 contract, supported image Blob decoding, size rejection and write failure propagation.

## Passive input bridge (v0.1.1)
Windows builds compile desktop/native/SaaInput.cs with the installed .NET Framework compiler. The packaged helper is unpacked alongside app.asar and started hidden, with only the application's HWND and parent PID. A narrow stdin control channel enables/disables passive input and selected-field typing. The helper forwards bounded pointer/key events through local pipes. Mouse coordinates use native client geometry and renderer scaling; keys use the foreground keyboard layout. Main/preload validate normal app IPC, and the renderer edits only the selected SAA field. Escape/outside-click/hide/click-through/interactive/shutdown release capture. No keystroke files or network channel exist. Interactive mode remains available for OS-native dialogs and IME.

### v0.1.2 movement rule
WH_MOUSE_LL is allowed to observe/coalesce motion, but must always call CallNextHookEx for WM_MOUSEMOVE. Returning a nonzero value blocks the actual Windows cursor and cannot be used as renderer throttling. Coalescing applies only to the local event pipe. Real cursor entry, leave and hover are part of check:passive; SetCursorPos placement alone is insufficient to test them.
