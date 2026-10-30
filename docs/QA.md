# Verification — 22 October 2026

## Completed checks
- Production TypeScript/Vite build passes.
- 32 provider/settings/storage/history/clipboard checks pass. They cover history checkpoint coalescing, flush concurrency and recovery after write failures, compatible base URL routing and error details/redaction, profile migration/isolation, generation parameters and validation, capture privacy defaults, fragmented UTF-8 and multiline SSE, JSON fallback, final unterminated events, DONE, redirects, failures, timeout/cancel, safe custom templates, serialized settings, recovery copies, and Electron 45's asynchronous clipboard API.
- Browser UI workflow passes: prompts fill composer; opacity changes; settings validate/save; desktop-only API boundary is visible; history opens/starts new chats; no renderer exceptions.
- Actual Electron workflow passes with an ephemeral local mock provider: streaming answer, native copy and clipboard paste while nonfocusable, encrypted saved key (plaintext key not present in settings.enc), persisted history, compact-to-expanded restore, transparent root and adjustable translucent panel.
- Real Microsoft Edge DOM fullscreen stays active and document.hasFocus() remains true while SAA showInactive, passive clipboard paste, click-through toggles and screen capture execute. SAA isFocused() remains false. This is a controlled local test, not a universal browser/site guarantee.

## Visual fidelity
Built-in browser/IAB was attempted first and timed out attaching the webview; no usable tabs were available. Fallback was Playwright with installed Microsoft Edge. Captured primary UI at the concept's native 1505×1045 dimensions, mobile at390×844, and native desktop at Windows display scaling. Inspected ui-concept.png and latest ui-preview.png using view_image in the same final QA pass, plus native/mobile/settings screenshots.

| Comparison | Evidence / correction |
|---|---|
| Composition | Single outlined floating panel, slim toolbar, model row, open center and bottom composer preserved. Toolbar/model heights and composer placement adjusted to the concept. |
| Typography | Segoe UI,48px desktop heading,24px subtitle,23px suggestion rows; toolbar/control sizes increased after first screenshot comparison. |
| Palette / material | Neutral charcoal, white/gray text and subtle white borders match the reference direction. Desktop root is transparent; only panel background alpha changes. Concept raster texture intentionally omitted in favor of real desktop transparency. |
| Spacing / framing | 29px concept-viewport outer margin, rounded panel,750px suggestion span, open rows and outlined followup pills checked. Composer/utility heights corrected. |
| Icons / controls | Thin Lucide chat/history/settings/pin/grip/paperclip icons checked. Added paste/capture/click-through controls are required functional additions. Send uses the original reference's up-arrow. |
| Responsive / compact |390px layout has no horizontal document overflow. Height container rules prevent clipped empty content in the native760px-height window. Expand remains visible at compact480px width. |
| Copy | Above-fold copy compared against DESIGN.md allowed copy. Functional preview footer, connection state and notices are intentional dynamic copy; no meeting/dashboard copy. |

The implementation was faithfully verified against the chosen concept, with the functional differences recorded in DESIGN.md. No material unintended visual mismatch remains. It is an inspired reconstruction, not a pixel-identical copy of Pluely's screenshot.

## Bugs found and corrected during verification
Removed reference-style focus-on-show behavior; fixed native clipboard API compatibility and unfocused copying; serialized appearance/API key saves; preserved unreadable storage through recovery copies; handled a final SSE buffer; corrected compact restore and short-window clipping; prevented file-picker launch in passive mode; changed occupied shortcuts to Ctrl+Alt+I and Ctrl+Alt+S. Local testing corrected two test-harness timing assumptions rather than hiding application errors.

## Limits
- No real paid-provider credentials were used. The native request protocol and UI were tested against local HTTP/SSE fixtures; specific providers/models need user configuration.
- Browser fullscreen was tested in Edge on this machine. Chrome, other browsers, F11 mode, particular websites, and elevated/protected applications are not individually certified.
- Passive mode routes mouse and keyboard input while a SAA field is selected, preserving browser focus in the tested Edge workflow. IME composition and advanced native editing use interactive mode. Interactive mode and OS dialogs can exit browser fullscreen.
- Capture is a bounded1920×1080 screen image for review, excluding SAA on supported Windows capture paths. Region selection is deferred. Capture/vision depends on platform/model support.
- Persistent capture exclusion defaults on. It was verified with an independent Electron desktop capture process on this Windows installation; other recorders, sharing applications and capture methods require their own check. Display affinity is not a universal security boundary or protection against a camera photographing the display.
- Text-only custom JSON/SSE formats use templates and text paths. Native non-OpenAI image schemas and NDJSON require additional adapters. No cURL shell execution is used.
- Chat history is plaintext and bounded to200 conversations/24MB; attachments are stored with chats. API settings and header credentials are encrypted. No telemetry or automatic remote update service is included.


## Packaged build
The Windows packaged app was tested from the final build output with the same native end-to-end workflow, including actual ClipboardItem image paste and a verified image_url request payload. The portable executable is release/SAA-0.1.0-portable.exe (138,208,467 bytes), with a sibling SHA-256 file. A copy of failed OneDrive build intermediates is preserved under .build-intermediates; release contains only the finished executable and checksum. The build used the standard Electron icon and is a local unsigned build.

## v0.1.1 passive input correction
The original direct-page tests did not verify physical Windows mouse/keyboard routing. A real user report exposed that gap. A local Windows helper now forwards mouse actions within SAA and keyboard input only while a SAA text field is selected, without activating SAA. Esc, outside click, hidden/click-through/interactive state and shutdown release the keyboard. It does not inject code into the browser, record keys to disk, or send keys over the network. Sensitive settings fields follow the same explicit selection rule.

The new `check:passive` regression uses actual Windows SendInput events in a disposable SAA/Edge test session. It verifies Settings/Chat/History clicks, model/chat typing, Shift punctuation, Backspace and Esc while Edge retains both focus and its fullscreen element. This supersedes the earlier statement that all passive typing requires interactive mode. IME composition remains an interactive-mode capability.

Packaged v0.1.1 was verified with both the new real Windows input regression and the existing native chat/clipboard/image/capture checks. API requests used a local fixture only. The installed portable launch target is now SAA-0.1.1-portable.exe; v0.1.0 is retained as a rollback copy. Source/build scripts and package lock are updated. User app-data files are not replaced by this update.

## v0.1.2 pointer movement and hover regression
Reproduced the reported mouse barrier before changing application code: the real Windows movement regression attempted to move from outside the panel to a Settings control, but the OS cursor stopped at (253,110) rather than reaching (1349,110). The low-level hook swallowed WM_MOUSEMOVE, including its throttled path. Earlier tests used SetCursorPos placement and therefore bypassed this failure.

Fixed by passing every mouse-movement event through the Windows hook chain. Only the existing button/wheel actions are intercepted. Renderer motion updates are coalesced at16ms while preserving the final position, tagged with monotonic sequence numbers to reject stale packets. A leave event clears passive hover feedback; mode/click-through changes clear it as well. No chat/provider/storage behavior was changed.

The regression now sends actual Windows movement events in multiple steps across the boundary, checks GetCursorPos reaches the intended position, verifies visible hover feedback and its removal on exit, then moves across controls before clicking. It continues to verify settings/chat typing, editing, opacity, and retained Edge fullscreen/focus. Native chat tests additionally cover streaming, copy/paste, image request contents, encrypted key storage, saved history, compact restore, click-through, and capture.

Packaged v0.1.2 passed both expanded real-pointer/input and native chat/fullscreen regression suites before being installed. All17 provider/storage/clipboard checks passed. The launcher now targets release/SAA-0.1.2-portable.exe. Existing API settings and conversation storage were preserved; no user app-data files were replaced. Older portable versions are retained only as rollback artifacts.

## v0.1.3 persistent capture exclusion

Capture exclusion now defaults on before SAA's window first appears, including when older saved settings have no privacy preference. The Settings switch saves immediately through the serialized encrypted settings transaction without requiring an API configuration. It preserves other settings, applies on show/mode transitions, and keeps SAA visible. SAA's own screenshot action temporarily enables exclusion even if the preference is off, then restores the latest saved preference.

The new `check:capture` uses a separate Electron process to capture the desktop, with a controlled solid background behind a solid test-only SAA panel. With exclusion disabled, the sampled pixel is SAA's magenta; with exclusion enabled, it is the blue background. Both the source app and packaged v0.1.3 passed this test, the Settings toggle, visible-window checks, encrypted preference persistence, and own-capture preference restoration. No captured personal desktop image is saved by this test. The test backdrop is destroyed before shutdown.

All 18 unit checks, production build and browser UI checks pass. The source real Windows input regression passed cursor entry/exit/hover, Settings privacy toggling, typing/editing, opacity and retained Edge fullscreen/focus. Packaged chat/clipboard/image/history/transparency and Edge DOM fullscreen checks also pass. A later packaged physical-input run stopped at its foreground guard because another application, Freebuff (PID 32032), had become foreground; it did not deliver test typing to that application. This is an external focus interruption, so a complete packaged physical-input rerun is not claimed for v0.1.3. The native input implementation is unchanged from v0.1.2. The regression now verifies the actual Windows foreground process alongside browser focus and waits for observable native hover delivery during helper startup.

The launcher targets `release/SAA-0.1.3-portable.exe`, with its SHA-256 checksum beside it. Existing user settings and conversation files are preserved. Windows display affinity was verified for the tested capture path; other capture tools require their own validation.

After restarting the user's portable app, verified the actual running window is visible with `WDA_EXCLUDEFROMCAPTURE (0x11)`. Its app.asar hash matches the tested v0.1.3 build, and its native passive-input helper is running.

## v0.1.4 active provider profiles

Added OpenAI, OpenRouter, Custom and Local profiles, an in-panel provider picker in Settings and the chat header, per-profile credential Save/Remove actions, system prompt, optional temperature/max tokens, models-endpoint validation and model suggestions. Existing flat configuration migrates into the matching profile without replacing request customizations, keys or appearance. Saved keys are redacted in every profile sent to the renderer. Global privacy/appearance updates and profile mutations share the existing serialized encrypted transaction. Oversized encrypted settings are rejected before replacing the readable file.

All 24 unit/provider/storage/clipboard checks pass. New checks cover migration, key/profile isolation, redaction, blank-key preservation, explicit removal, generation parameter omission/mapping, base URL expansion, authenticated GET models, redirect protection, same-origin models overrides, invalid models responses and validation timeout. The production build and browser UI workflow pass; the settings screenshot was inspected against the supplied row-based reference and existing SAA material.

Both source and packaged v0.1.4 passed `check:providers`: actual Settings edits, key-only save, validation using saved and newly entered credentials, two independent local provider routes, correct outgoing temperature/token fields, model/key restoration when switching, inactive-key removal isolation, encrypted persistence across restart and content protection. The chat-header provider selection uses real Windows mouse movement/click events, verifies the OS foreground process remains unchanged and SAA remains unfocused. This exercises the new menu without a native select popup. No real provider keys or paid requests were used.

Packaged v0.1.4 also passed independent capture-exclusion pixel checks and the existing native chat/clipboard/image/history/transparency/compact and Edge DOM fullscreen checks. The broader physical-keyboard/fullscreen regression again stopped at the foreground guard because Freebuff (PID 32032) was foreground before typing. No complete physical-keyboard/fullscreen rerun is claimed for this version; the native input implementation is unchanged. The new provider menu's real mouse/no-activation test passed separately.

Validation is an explicit GET models check, not proof of chat authorization, available credits or model compatibility. Custom APIs without the standard models route require their own same-origin Models URL. Chat still uses the existing JSON/SSE transport and custom format controls; custom templates own generation fields. Temperature is omitted by default for model compatibility. The OpenAI preset uses max_completion_tokens; other presets default to max_tokens with an override in advanced settings.

The verified portable build is `release/SAA-0.1.4-portable.exe`; the launcher points to this version and the SHA-256 checksum is stored beside it.

Restarted the user's portable app and verified the running app.asar matches the tested v0.1.4 build. Its window is visible with capture exclusion enabled and its native input helper is running. The pre-existing settings.enc and conversations.json hashes are unchanged across restart; no saved user files were replaced.

## v0.1.5 compatible API base URL correction

The reported request failure came from SAA's route resolution: the saved Gemini OpenAI-compatible base ends in `/v1beta/openai/`, while v0.1.4 expanded only root or `/v1` URLs. The configured base was consequently used as the POST route without `chat/completions`. Google's documented compatible base is valid. Fixed expansion for `/openai` and versioned bases, preserving full custom/chat routes and query parameters. Models validation uses the same corrected resolver.

HTTP, JSON and streamed provider failures now report bounded useful provider messages, with saved API keys, header values and sensitive URL-query values redacted. Non-JSON failures use status-specific guidance. Redirects remain blocked and responses remain bounded. Added regressions for the exact Gemini base format, HTTP chat/models routes, provider error redaction, streamed error messages and non-JSON quota guidance. All 28 checks and the production build pass.

A single minimal live request through Electron succeeded using the user's saved Gemini model/key and the corrected resolver, with a nonempty streamed answer. The key was kept in the native diagnostic process; existing conversation history was not submitted and no credentials or answer text were printed. The user's configuration was not modified to work around the bug.

Packaged v0.1.5 passed the provider end-to-end suite with a Gemini-shaped compatibility base, exact chat/models route assertions, visible HTTP error reason and key redaction, plus the native chat/clipboard/history/Edge fullscreen workflow. The launcher now targets the v0.1.5 portable executable with its checksum. After restart, the actual window is visible with capture exclusion enabled, the input helper is running, and its app.asar matches the tested build. Saved settings and conversation file hashes are unchanged across restart.

## v0.1.6 installation and history persistence

Diagnosed two persistence problems: launch always selected no conversation despite existing saved history, and renderer saves used a 450 ms debounce that could be postponed by streaming updates or interrupted at quit. The existing user file still contained four valid conversations. The renderer now opens the latest saved conversation. Chat creation and streamed answer persistence are owned by the desktop process: a prompt is durably saved before HTTP starts, snapshots checkpoint on a bounded schedule without resetting on every token, and the final state flushes before reporting completion or quitting normally. Stale renderer snapshots are ignored while a native chat is active. Failed history writes remain retryable; Quit keeps SAA open if a final save fails.

User data is explicitly located in the existing `%APPDATA%\SAA` directory for installed and portable builds, including Chromium encryption metadata. Explicit test/development user-data directories remain respected. Atomic history file format stays compatible with existing saved conversation arrays. Settings and conversation data are backed up before installation; the installer is configured to retain app data on uninstall.

The Windows build now produces a per-user NSIS installer plus the portable executable. NSIS adds Start menu and desktop shortcuts named SAA; the application and shortcuts use a generated seven-size SAA chat-bubble icon. Executable name/version/icon resources are applied without code signing. The source launcher prefers the installed Start menu shortcut. Pin to Start remains a normal user action in Windows.

All 32 checks and the production build pass. Source and packaged v0.1.6 pass the provider and existing native chat/clipboard/history/Edge fullscreen workflows. The new `check:persistence` verifies the user message exists on disk before the mock HTTP handler runs, a partial answer is checkpointed during an unfinished stream, immediate Quit after a new visible delta saves that delta, restart automatically displays the saved chat and retains its key without resending the API request, and deletion survives another restart. Content protection remains enabled. Windows shutdown, abrupt termination and power loss can interrupt the newest checkpoint; they do not provide the same drain opportunity as normal Quit.

Installed `SAA-0.1.6-Setup.exe` silently for the current Windows account with exit code 0. The installed executable is `%LOCALAPPDATA%\Programs\saa-assistant\SAA.exe`; the Start menu shortcut points to it and uses its SAA icon. Windows uninstall registration reports SAA 0.1.6. Both installer and portable artifacts and their SHA-256 files are in release/.

Verified the installed application using the actual existing user profile: four conversations loaded, the latest chat opened automatically, the saved API key/model were present, and no storage warning occurred. Settings and history file hashes stayed unchanged through launch and graceful Quit. A recovery copy of conversations.json, settings.enc and Local State was saved under `%APPDATA%\SAA\backups\before-0.1.6-20261022-103325` before installation. The installed executable also independently passed the full persistence regression with disposable local data. Finally launched SAA from its actual Start menu shortcut and verified it is visible, uses the tested app.asar, retains capture exclusion, and runs its native input helper.
