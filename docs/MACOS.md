# Run SAA on your Mac

This repository contains the source, not your Windows installation or personal data. The Mac target is an initial port and has not been built or tested on a Mac yet.

## Download and run

1. Install Node.js 22 LTS (including npm) and Git on your Mac. If Git requests Apple's Command Line Tools, install them.
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

- Chat, provider profiles, history and transparency use the shared Electron application. History is stored in `~/Library/Application Support/SAA/conversations.json`.
- Mac windows open in interactive mode so you can type. Windows passive typing depends on `SaaInput.cs`, which has no Mac implementation. The passive toggle still exists for experimentation, but does not support typing on macOS. A native Mac input implementation is needed before promising typing over browser fullscreen without changing its focus/state.
- Always-on-top/fullscreen workspace visibility is requested through Electron. Verify behavior in your actual browser on the Mac.
- Capture exclusion is best-effort on macOS: ScreenCaptureKit-based recorders can capture protected windows. Do not assume Windows exclusion behavior carries over.
- Shortcuts use Command in place of Ctrl. Screen attachments may require permission in System Settings > Privacy & Security > Screen & System Audio Recording, followed by restarting SAA. Desktop permissions/dialogs can take focus.
- The Windows-specific desktop/input/capture test scripts are not Mac acceptance tests. `npm test` checks the shared provider/storage logic.

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
