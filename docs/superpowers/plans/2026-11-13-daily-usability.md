# Daily usability implementation plan

Goal: add searchable/organized chats, durable text drafts and window/layout preferences, a collapsible sidebar and jump-to-latest without changing provider or assistant capabilities.

1. Create a validated native workspace store (1 MB, 201 bounded text drafts, selected chat/sidebar/latest/normal+compact bounds). Reuse fixed-deadline checkpoints and flush on Quit. Clamp restored windows onto a connected display. Preserve the existing conversation JSON format, with optional boolean pinned/archived fields.
2. Extend chat history with full-text search, inline rename, pin/unpin, archive/unarchive and one-deletion undo. Disable destructive metadata edits during streaming. The sidebar floats on narrower windows so chat never gets squeezed into an unusable column.
3. Persist text drafts per conversation and a separate new-chat draft. Preserve unsent images across chat switches in memory only. Restore the selected chat and text on launch; deletion removes its saved draft and Undo restores it.
4. Add a visible Jump to latest control and preserve reading position when switching between chats/panels. Remember sidebar, latest/all, window geometry and compact layout.
5. Verify validation/recovery, off-screen bounds, exact draft restoration, archive/pin/rename persistence, undo, search, sidebar sizing and streaming scroll. Run existing provider, assistant, fullscreen, clipboard, history and capture tests; build/test personal Windows and Mac updates.

No licensing, payments, accounts, cloud sync or new background networking. Drafts remain plaintext like current chat history. Abrupt kills may interrupt the latest 200 ms checkpoint; normal Quit flushes writes.
