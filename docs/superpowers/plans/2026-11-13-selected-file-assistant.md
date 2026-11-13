# Selected-file Assistant Upgrade Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. The user has authorized execution in this session; native execution and focused verification will be used.

**Goal:** Analyze explicitly selected files and produce verified report PDFs, Markdown and ZIP bundles through a bounded assistant workflow.
**Architecture:** Native-owned file capabilities and task state; parsing/archive work in cancellable worker threads; a provider-neutral analysis request using the existing transport; isolated, noninteractive PDF rendering. The model cannot choose filesystem paths, invoke commands, change originals, or access other files.
**Tech Stack:** Electron, React/TypeScript, Node workers, PDF.js, pdf-lib verification, yauzl/yazl archives.
**Spec:** The user's selected-files-only assistant scope in this conversation.

## Global constraints
- Preserve existing chat storage format, keys, passive input, capture exclusion and provider transport.
- No directory scans, uploaded code execution, arbitrary tool calls or automatic external file opening.
- At most 12 selected files, 20 MB each, 40 MB total; 100 ZIP entries, 40 MB expanded; 200 PDF pages; 120,000 extracted characters per task. Reject excess rather than silently truncate.
- Parse tasks terminate after 30 seconds; provider/output task after 180 seconds. Cancellation terminates workers and discards incomplete outputs.
- Provider receives only the previewed selected-file extraction and the user's explicit task instruction. Local selection alone never sends data.
- Generated output IDs resolve only to app-owned task files. User export uses a native Save dialog; no renderer-supplied paths.
- Native dialogs are explicitly interactive; passive fullscreen chat remains usable without dialogs.

## Review focus
1. ZIP traversal, symlinks, duplicate entries and expansion bombs: reject before producing content.
2. Scanned/encrypted/malformed PDFs: explain limits, do not fabricate extracted text.
3. Prompt injection in file contents: untrusted context cannot grant tools or access credentials.
4. Cancel/quit/restart: no finished claim or accessible partial artifact, existing chats survive.
5. Unicode reports and output-path tampering: readable PDF output; no export outside a user-chosen path.

## Task 1: Safe local file tools
Files: desktop/file-tools.cjs, desktop/file-worker.cjs, desktop/file-tools.test.cjs.
Interfaces: extractFiles([{name,bytes}]) -> [{name,text,pages?,entries?}]; makeZip([{name,bytes}]) -> Buffer; validateOutputName(name) -> string.
- [x] Write failure tests for unsafe ZIP names, symlinks, expansion limits, unsupported formats, malformed PDFs and oversize input.
- [x] Implement bounded text/PDF/ZIP/DOCX extraction and ZIP generation with no extraction to disk.
- [x] Verify text, Unicode PDF page references, source-code-as-data, valid archives and cancellation/worker errors.

## Task 2: Native task controller and IPC
Files: desktop/assistant.cjs, desktop/main.cjs, desktop/preload.cjs.
Interfaces: assistantPick(), assistantState(), assistantRun({instruction,fileIds,formats}), assistantCancel(), assistantRemove(id), assistantExport(id), onAssistant(event).
- [x] Write tests for selected-ID enforcement, malformed model output, unknown paths and cancellation.
- [x] Implement local selection/preview; a single bounded read/analyze/generate/verify pipeline; private app-owned task outputs and atomic manifest persistence.
- [x] Generate PDFs in a protected hidden renderer with escaped content and no scripts/network; verify PDF and ZIP bytes before publishing output IDs.
- [x] Integrate authorized IPC and quit-time cancellation without changing ordinary chat behavior.

## Task 3: Files, task progress and outputs UI
Files: src/components/AssistantPanel.tsx, src/domain/types.ts, src/infrastructure/bridge.ts, src/App.tsx, src/assistant.css.
- [x] Show local files/extraction preview, selected provider destination, task instruction, format selection, start/cancel, progress/errors and export controls.
- [x] Persist completed reports/outputs in the native task workspace; make clear that local task files are not encrypted.
- [x] Keep workspace collapsible and chat accessible, with privacy curtain covering this view too.

## Task 4: Verification and delivery
Files: scripts/verify-assistant.cjs, .github/workflows/build-macos.yml, package.json, README.md, docs/QA.md.
- [x] Local fixture end-to-end: select/analyze text/PDF/ZIP, mock provider context, create/read PDF and ZIP, cancel, blocked IDs/paths, restart.
- [x] Existing tests: copying/refinements, provider credentials, history, desktop fullscreen/capture.
- [ ] Build Windows installer and both Mac versions; execute packaged checks before publishing. Record limits (OCR/legacy Office not included).
