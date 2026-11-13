# Run SAA on your Mac

This repository contains the source, not your Windows installation or personal data. Apple Silicon and Intel bundles pass `codesign` verification, packaged history/restart checks, and native mouse/key/send tests over a fullscreen Chromium fixture on GitHub Mac runners. The test asserts that the browser stays foreground and fullscreen. Check your specific browser, physical Mac, keyboard layout/IME and recording application as well.

## Download the app directly

Open [Mac downloads](https://github.com/Trek91/SAA/releases/tag/mac-v0.2.1) while signed into an account with access to this private repository.

- Apple Silicon (M-series): choose `SAA-0.2.1-mac-arm64.zip` or `.dmg`.
- Intel: choose `SAA-0.2.1-mac-x64.zip` or `.dmg`.

Extract the ZIP to get `SAA.app`, move it to Applications, then double-click it. Alternatively, open the DMG and drag SAA to Applications. Node.js and Git are not required for these downloads. If macOS blocks the first launch, use System Settings > Privacy & Security > Open Anyway for the downloaded SAA application. These builds are ad-hoc signed, not Apple-notarized.

Enter your API settings again on the Mac. Windows credentials and chat history are not included in the download.

## One-time permissions for fullscreen typing

Do this setup before entering browser fullscreen:

1. Move SAA to Applications, then open it from there.
2. Click **Enable fullscreen typing** in SAA. In System Settings > Privacy & Security > Accessibility, enable SAA. If absent, use the `+` control to add SAA from Applications.
3. Return to SAA and click **Check again**. The setup banner disappears when the input router is ready. If macOS requests Input Monitoring for SAA, allow it too. Restart SAA if requested by macOS, or if enabling Accessibility has not taken effect.
4. For screen attachments, use **Settings > Mac permissions > Screen Recording settings** and enable SAA under Screen & System Audio Recording. Restart if requested.

SAA opens as a passive panel. Click a field to type without activating SAA; the browser keeps focus. Escape, an outside click, switching modes, hiding, click-through, a foreground-app change or two minutes without input releases selected-field typing. The native helper sends events only over a local pipe and does not save keyboard logs. It checks the actual application under the pointer before routing clicks. Secure Input and complex IME/dead-key composition may require interactive mode; use Command+Option+I.

## Run from source instead

1. Install Node.js 22 LTS (including npm), Git, and Apple's Xcode Command Line Tools on your Mac. The tools compile the native input helper during `npm run build`.
2. Sign in to GitHub as Trek91 or an account invited to this private repository. Clone with GitHub Desktop, or run:

```sh
git clone https://github.com/Trek91/SAA.git
cd SAA
npm ci
npm test
npm start
```

For a private repository, the command-line clone needs GitHub authentication. Use GitHub Desktop if you prefer signing in through a window. Do not use your GitHub account password as a Git password.

Enter the provider endpoint, model and API key in SAA Settings on the Mac. The Windows encrypted settings cannot be decrypted on macOS. SAA uses the Mac's OS credential encryption for newly saved settings.

## Create an installable Mac application

Run this on the Mac, inside the cloned SAA folder:

```sh
npm run package:mac
```

The build targets the Mac's current architecture. Explicit targets are:

```sh
# Apple Silicon: M1, M2, M3, M4, etc.
npm run package:mac -- --arm64
# Intel Mac
npm run package:mac -- --x64
```

The DMG and ZIP are created in `release/`, named with the architecture. Open the DMG and drag SAA into Applications, then launch it from Applications or Spotlight. These are local ad-hoc signed builds, not Apple Developer ID signed/notarized releases. Downloaded builds may require approval in System Settings > Privacy & Security. Public distribution needs a separate signing/notarization setup.

## Platform differences to test

- Chat, provider profiles, history and transparency use the shared Electron application. History is stored in `~/Library/Application Support/SAA/conversations.json`; per-chat text drafts and layout use `workspace.json` in the same folder. Both are plaintext. Unsent image drafts are memory-only.
- Mac passive typing uses `SaaInputMac.m` and requires Accessibility permission. Windows continues using `SaaInput.cs`. The common renderer handles fields, buttons, copy/paste and editing. macOS supports Command editing shortcuts; Option+Arrow/Backspace moves/deletes by word. Advanced IME composition should use interactive mode.
- Always-on-top/fullscreen workspace visibility is requested through Electron. Verify behavior in your actual browser on the Mac.
- Capture exclusion is best-effort on macOS: ScreenCaptureKit-based recorders can capture protected windows. There is no supported universal guarantee of invisibility to other Mac recording applications. SAA temporarily hides its own panel during its screen capture and shows it again without requesting focus.
- Shortcuts use Command in place of Ctrl. Screen attachments may require permission in System Settings > Privacy & Security > Screen & System Audio Recording, followed by restarting SAA. Desktop permissions/dialogs can take focus.
- `node scripts/verify-macos.cjs` checks packaged providers, validation/authentication, clipboard text/images, transparency, compact mode, capture settings, native typing/clicks over a fullscreen Chromium fixture, Escape, global hide/show, click-through, screen attachments and mode switching. `npm run check:persistence` checks streaming saves, normal Quit, restarts and history deletion. The tests use disposable profiles and local mock providers, with no real API keys or paid requests. The Mac input driver requires Accessibility; GitHub's test-only permission fixture is restricted to ephemeral GitHub-hosted runners and is not shipped with the application.

Electron platform behavior: https://www.electronjs.org/docs/latest/api/browser-window/
Mac packaging: https://www.electron.build/v26/docs/mac/

## Optional: transfer existing conversations

Quit SAA normally on both devices first. Back up the Mac data folder. Copy only `%APPDATA%\SAA\conversations.json` from Windows to `~/Library/Application Support/SAA/conversations.json` on the Mac. Create the folder by launching/quitting SAA once if needed. This replaces the Mac history; it does not merge histories. Do not commit this file or encrypted settings to GitHub. Configure API credentials again on the Mac.

## Get later updates

Quit SAA, then run inside your clone:

```sh
git pull
npm ci
npm start
```

Re-run `npm run package:mac` to update an installed application. Your data lives outside the application folder.
