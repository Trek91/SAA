# SAA — implementation plan

## Product
A Windows floating AI chatbot inspired by Pluely's compact dark transparent interface. The reference remains untouched. SAA contains chat features only.

## Included
- Multi-turn chat with streamed responses, Markdown/code, stop, retry, copy, new chat and local history.
- Custom API endpoint, model ID, API key, JSON headers, system prompt, optional JSON request template and configurable response paths. OpenAI-compatible chat completion format by default; custom JSON and SSE adapters via templates/paths.
- PNG/JPEG/WebP attachments, paste-image, and a screen-context capture command. Vision depends on the selected model and API format.
- Adjustable panel background opacity (35–100%), compact view, drag/resize, always-on-top, hide/show, click-through, and passive/interactive modes.
- Passive mode shows without activation. Clipboard question shortcut submits selected/copied context while the fullscreen application keeps focus. Explicit interactive shortcut allows typing.
- API credentials encrypted by Electron safeStorage on Windows. Chat history stays locally on this computer. Requests go directly to the configured endpoint.

## Excluded
Meeting recording, transcription, microphone, system audio, meeting summaries, usage dashboards, Pluely subscriptions/licensing, analytics and remote update service.

## Architecture
React + TypeScript + Vite renderer. An Electron desktop host handles native window behavior, global shortcuts, screen capture, encrypted configuration, history persistence and HTTP/SSE. Isolated sandboxed renderer, narrow validated IPC, no Node access in UI. Markdown never renders raw HTML. New implementation rather than copying the full meeting application.

Electron is an intentional change from Tauri: a single JavaScript host makes Windows non-activating overlay behavior and a native HTTP adapter straightforward to inspect and test here. It costs more disk/RAM than the reference's Rust host.

## Stages
1. Trace reference chat/provider/window/transparency source and record evidence.
2. Design a complete primary chat screen and derive visual tokens.
3. Implement chat UI, history, settings, image input and transparency.
4. Implement native API streaming, encrypted settings, shortcuts and passive overlay.
5. Verify builds, mock-provider streaming/error/cancel behavior, UI workflow and desktop launch. Record fullscreen checks separately from source-based expectations.

## Fullscreen behavior and limits
Default passive mode does not request focus, does not change another application's window mode, and can pass mouse input through. Normal typing requires interactive mode and therefore changes focus. Use Ctrl+Shift+Q to send clipboard text without focusing SAA. True exclusive fullscreen, protected surfaces, elevated applications and applications that suppress overlays may not display a desktop overlay. No process injection or graphics hooking is planned. Actual target-app fullscreen preservation must be tested; no universal guarantee.

Shortcuts: Ctrl+Shift+Space show/hide; Ctrl+Alt+I interactive/passive; Ctrl+Shift+Q ask clipboard; Ctrl+Shift+X click-through; Ctrl+Alt+S capture screen as an attachment. Capture is user-triggered and attached for review, never sent automatically.

## Validation boundary
No real provider key is required for development. Verify protocol behavior against a local mock endpoint; paid-provider and target-app fullscreen validation remain dependent on the user's setup.

## Clarified target: browser fullscreen
The user's target is a browser in fullscreen that exits when another application activates. SAA must use showInactive and focusable:false in passive mode, including show/hide and clipboard operations. Mouse actions may paste clipboard and send without requesting OS focus. Direct keyboard typing is explicitly opt-in because it may cause the browser to exit fullscreen. Browser fullscreen runtime verification is still required on the user's browser; don't conflate this with exclusive game fullscreen.

## Delivered follow-ups
Passive field typing and physical pointer/hover handling were added in v0.1.1–0.1.2 with a local Windows input helper; see QA.md for measured focus/fullscreen behavior and limits. Persistent screen-capture exclusion defaults on from v0.1.3.

v0.1.4 adds independently configured OpenAI/OpenRouter/Custom/Local profiles. The active profile determines new requests, while existing chats remain available. Settings and the chat header share a passive-compatible provider picker. Provider configuration, credentials and optional generation parameters are stored through the serialized encrypted settings boundary. Native models validation uses the chosen endpoint/key without issuing a chat request. Existing single-provider configuration migrates on load; paid-provider compatibility still depends on the user's server/model.

v0.1.5 corrects Gemini-compatible base URL expansion and reports credential-redacted provider errors. v0.1.6 adds a per-user Windows installer, SAA icon and Start menu/desktop shortcuts. Installed and portable versions share the existing app-data folder. Chat persistence moves to the desktop host, with durable prompt creation, streaming checkpoints, final/quit flush and automatic restoration of the latest saved conversation. Existing user data is preserved and backed up before installation; source, packaged and installed persistence checks pass.

