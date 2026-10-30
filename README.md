# SAA

A floating AI chatbot inspired by Pluely, built in this folder. The reference folder is unchanged.

## GitHub and macOS

Private source repository: https://github.com/Trek91/SAA. See [Mac setup and packaging](docs/MACOS.md) for cloning, running and creating a DMG on your Mac. The Mac target is an untested initial port; Windows passive fullscreen typing is not implemented for macOS. Dependencies, generated executables, API credentials and conversation history are excluded from Git.

Install with `release/SAA-0.1.6-Setup.exe`. The installer adds **SAA** to your Start menu and desktop for your Windows account. Press the Windows key, type **SAA**, and open it; right-click the result and choose **Pin to Start** for a pinned Start icon. Installation does not require administrator access. **Launch SAA.cmd** prefers the installed Start menu shortcut, then the v0.1.6 portable executable if available.

Open **Settings**, choose an active provider, enter its endpoint/model/key, then save. Passive mode supports typing without activating the window. API configuration is encrypted locally using Windows protection. Local chat history is plaintext in the app data directory.

## Chat persistence

Installed and portable versions share `%APPDATA%\SAA` on this Windows account, outside the application folder. Existing settings and history are reused. On launch, SAA opens the latest saved conversation; **History** lists the others and **New chat** starts a fresh conversation.

The desktop process saves the question before sending an API request. It checkpoints streamed replies on a bounded schedule and flushes the latest reply before completing a request or quitting normally. If saving fails during Quit, SAA stays open and reports the problem. Keep the app-data folder when moving or updating the application; API settings also require its `Local State` encryption metadata on the same Windows account. Uninstall is configured to retain app data.

Normal Quit is available in the tray menu. An abrupt process kill, power failure or Windows shutdown may interrupt the newest checkpoint; completed saves remain in the app-data folder. Your API requests are not automatically re-sent on startup.

## Screen capture privacy

**Exclude SAA from screen capture** is enabled by default, including when upgrading an existing configuration. SAA stays visible and usable on your screen, while supported Windows screenshots and screen-sharing paths omit its window. Change the switch in **Settings** at any time; it saves immediately without requiring API setup and persists across restarts. SAA's own screenshot attachment temporarily excludes the overlay even when this switch is off.

This uses Windows display affinity through Electron content protection. Capture methods can differ; test your particular sharing or recording app before relying on it. It does not prevent someone photographing the physical screen. See [Microsoft's API documentation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity).

## Browser fullscreen

SAA defaults to **Passive overlay**. Showing the panel does not request focus. Click buttons normally. Click a chat/settings text field to route typing to it while the browser keeps focus and fullscreen. **Esc**, clicking outside SAA, hiding the panel, enabling click-through or switching modes releases typing. The footer shows when SAA is receiving typing. No keystrokes are logged; input is forwarded only while a SAA field is selected. Clipboard paste and capture shortcuts remain available. In passive mode the paperclip attaches a clipboard image; interactive mode allows file browsing. Interactive mode and system dialogs can take focus. IME composition and advanced native text editing can use interactive mode.

| Shortcut | Action |
|---|---|
| Ctrl+Shift+Space | Show/hide; showing returns to passive mode |
| Ctrl+Alt+I | Toggle interactive/passive mode |
| Ctrl+Shift+Q | Send clipboard text as a question; clipboard images attach for review |
| Ctrl+Shift+X | Toggle click-through; use again to restore mouse interaction |
| Ctrl+Alt+S | Capture screen under cursor and attach for review |

If a shortcut is occupied by another app, SAA displays the registration failure. The corresponding toolbar controls still work. Hide uses a tray process; Quit SAA is available from its tray menu.

## Custom API

Choose **OpenAI**, **OpenRouter**, **Custom**, or **Local**. Each profile separately saves its endpoint, model ID, key, system prompt, streaming switch, optional temperature/token limit, headers and custom format. In Settings, select a provider and press **Save settings** to activate it and save field edits. **Save key** and **Remove key** immediately update only that profile's credential. A blank key keeps the saved one. The chat header switches between saved profiles for new messages. Existing messages remain in the conversation and are sent as context when you submit another message.

Enter a **base API URL or full chat endpoint**, a **model ID**, and optionally a key. Versioned base URLs such as `/v1`, `/v2`, or `/v1beta`, and compatibility bases ending in `/openai`, expand to `/chat/completions`; full chat/custom routes stay as entered. Query parameters are preserved. Defaults are `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, and `http://localhost:1234/v1` for Local. Run your local server separately and set its actual port/model. Default format is OpenAI-compatible chat completions with Bearer authentication. HTTPS is required for remote endpoints; localhost HTTP is supported. Redirects are refused. Your provider receives the messages and attached images you submit.

For Gemini's OpenAI-compatible API, `https://generativelanguage.googleapis.com/v1beta/openai/` is a valid base. SAA appends `chat/completions` and uses your Gemini key with the model ID you enter. See [Google's compatibility documentation](https://ai.google.dev/gemini-api/docs/openai/). Provider errors now include bounded, credential-redacted JSON error details; non-JSON errors use status-specific guidance instead of always blaming the endpoint.

Temperature and max tokens are omitted when unset. The OpenAI preset uses `max_completion_tokens`; the other presets use `max_tokens`. Change the field under **Custom API format** if your model requires a different one. Custom request templates control their own temperature, token and streaming fields. See [OpenAI's Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) and [OpenRouter's request schema](https://openrouter.ai/docs/api_reference/overview).

**Validate connection** uses the draft endpoint and an entered or saved key to read `/models`, without submitting a chat. It reports returned model IDs and lets you choose one. This checks endpoint reachability; public model lists cannot prove chat authorization, model compatibility or available credits. Custom endpoints may need an explicit **Models URL** on the same origin. Validation blocks redirects and times out after 15 seconds. Local model discovery follows the [OpenAI-compatible models endpoint](https://lmstudio.ai/docs/developer/openai-compat/models).

Older single-provider settings automatically migrate into the matching profile while preserving the existing endpoint, key and request customization. Profile credentials stay encrypted; saved API keys are never returned to the renderer.

Advanced settings accept JSON headers, an optional JSON request body template, a JSON response path and an SSE text path. Placeholders are unquoted full JSON values. A custom template controls its own streaming field. JSON and SSE are supported; NDJSON and arbitrary executable transforms are not. Image requests use standard image_url content parts, so native APIs with different image schemas need an appropriate adapter; text-only custom formats work via templates. The selected model must support vision for image context.

## Development

- `npm install` (if the Electron binary was skipped by your npm script policy, run `node node_modules/electron/install.js`).
- `npm start` builds and opens the desktop app; `npm run desktop` opens the existing build.
- `npm run dev` starts a local UI preview. Browser preview does not save credentials or call providers.
- `npm test` runs local provider/storage checks.
- `npm run check:ui` uses installed Microsoft Edge and the running local preview.
- `npm run check:passive` checks real Windows mouse and keyboard input against a disposable fullscreen Edge session.
- `npm run check:desktop` tests the actual desktop app with a local mock provider and a disposable Edge fullscreen session; no paid API required.
- `npm run check:capture` verifies exclusion with a separate capture process and controlled background pixels, plus the privacy switch and saved preference.
- `npm run check:providers` verifies provider switching, real Windows mouse selection without activation, isolated keys/settings, validation, request routing/parameters, removal, encrypted storage and restart against local fixtures.
- `npm run check:persistence` verifies saving before the HTTP request, checkpoints during an unfinished stream, immediate Quit after a new chunk, restoration across restart and persistent deletion.
- `npm run package` builds the Windows installer and portable app. If OneDrive locks intermediate files, use electron-builder's output directory option to build outside OneDrive, then copy the finished executables back.

Plan: docs/PLAN.md. Source findings: docs/ANALYSIS.md. UI specification: docs/DESIGN.md. Verification and remaining limits: docs/QA.md.

The app excludes meeting recording, microphone/system audio, transcription, subscriptions, telemetry and the reference update service.

For custom bodies, {{messages}} includes the system prompt; {{conversation}} contains user/assistant messages only. Use {{conversation}} plus {{system}} for providers that require a separate system field. Request placeholders do not run code.

## Reference provenance

The supplied Pluely source (package metadata GPL-3.0, author Srikanth Nani) and bundled UI screenshot were inspected as references. Source observations and behavioral differences are recorded in docs/ANALYSIS.md. The original reference folder was not modified. SAA's renderer and desktop host were newly implemented for this request; meeting/audio code was not copied into SAA.


