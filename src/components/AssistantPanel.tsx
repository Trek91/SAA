import { useEffect, useState } from "react";
import {
  FileText,
  FolderOpen,
  Download,
  Square,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import { bridge } from "../infrastructure/bridge";
import type { AssistantState, Settings } from "../domain/types";
import ReactMarkdown from "react-markdown";
const initial: AssistantState = {
  status: "idle",
  stage: "Ready",
  files: [],
  outputs: [],
  report: "",
  error: "",
  destination: "",
};
export function AssistantPanel({
  settings,
  onClose,
}: {
  settings: Settings;
  onClose: () => void;
}) {
  const [state, setState] = useState(initial),
    [instruction, setInstruction] = useState(""),
    [error, setError] = useState(""),
    [pdf, setPdf] = useState(true),
    [zip, setZip] = useState(true),
    [originals, setOriginals] = useState(false),
    [working, setWorking] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void bridge
      .assistantState()
      .then((s) => {
        if (alive) setState(s);
      })
      .catch((e) => setError(String(e)));
    const off = bridge.onAssistant((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  const busy =
    working || state.status === "running" || state.status === "reading";
  async function act(work: () => Promise<unknown>) {
    setWorking(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }
  async function start() {
    await act(async () => {
      await bridge.assistantRun({
        instruction,
        fileIds: state.files.map((f) => f.id),
        formats: [...(pdf ? ["pdf"] : []), ...(zip ? ["zip"] : [])],
        includeOriginals: originals,
      });
    });
  }
  return (
    <section className="assistant-panel">
      <div className="assistant-heading">
        <button
          type="button"
          className="icon-button"
          aria-label="Back to chat"
          onClick={onClose}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1>Files & assistant</h1>
          <p>Selected files in. Verified outputs out.</p>
        </div>
      </div>
      <div className="assistant-grid">
        <div className="assistant-context">
          <div className="assistant-section-title">
            <h2>Selected files</h2>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  setState(await bridge.assistantPick());
                })
              }
            >
              <FolderOpen size={15} /> Choose files
            </button>
          </div>
          <p className="assistant-help">
            Files are read locally first. Start task sends their extracted text
            to the model below. Choosing or saving a file opens an interactive
            system dialog.
          </p>
          {!state.files.length && (
            <div className="assistant-empty">
              <FileText size={24} />
              <p>
                Add PDF, DOCX, ZIP, text or code files, or create a document
                from your instructions.
              </p>
            </div>
          )}
          {state.files.map((f) => (
            <details className="assistant-file" key={f.id}>
              <summary>
                <FileText size={15} />
                <span>
                  {f.name}
                  <small>
                    {Math.ceil(f.size / 1024)} KB ·{" "}
                    {f.characters.toLocaleString()} characters
                    {f.pages ? ` · ${f.pages} pages` : ""}
                  </small>
                </span>
              </summary>
              <p className="assistant-help">
                Preview of extracted text (first 4,000 characters). All
                extracted text is included when you start.
              </p>
              <pre>{previews[f.id] ?? f.preview}</pre>
              {f.characters > 4000 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    void act(async () => {
                      const text = await bridge.assistantPreview(f.id);
                      setPreviews((old) => ({ ...old, [f.id]: text }));
                    })
                  }
                >
                  Show full extracted text
                </button>
              )}
              <button
                type="button"
                className="text-button danger"
                disabled={busy}
                onClick={() =>
                  void act(async () =>
                    setState(await bridge.assistantRemove(f.id)),
                  )
                }
              >
                <Trash2 size={13} /> Remove file
              </button>
            </details>
          ))}
          <p className="assistant-help">
            Up to 12 files · 20 MB each · 40 MB total · 120,000 text characters.
            Scanned PDFs need OCR, which is not included yet. ZIPs are inspected
            without extracting files onto your computer.
          </p>
        </div>
        <div className="assistant-task">
          <h2>Task</h2>
          <textarea
            aria-label="Assistant task"
            rows={5}
            placeholder="Compare these PDFs, create a summary report and package the results into a ZIP…"
            value={instruction}
            disabled={busy}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <div className="assistant-destination">
            <strong>
              {state.status === "running"
                ? state.taskModel
                : settings.model || "Configure a model in Settings"}
            </strong>
            <span>
              {state.status === "running"
                ? state.destination
                : new URL(settings.endpoint).host}
            </span>
          </div>
          <div className="assistant-formats">
            <label>
              <input
                type="checkbox"
                checked={pdf}
                disabled={busy}
                onChange={(e) => setPdf(e.target.checked)}
              />{" "}
              PDF report
            </label>
            <label>
              <input
                type="checkbox"
                checked={zip}
                disabled={busy}
                onChange={(e) => setZip(e.target.checked)}
              />{" "}
              ZIP bundle
            </label>
            <label>
              <input
                type="checkbox"
                checked={originals}
                disabled={busy || !zip}
                onChange={(e) => setOriginals(e.target.checked)}
              />{" "}
              Include originals in ZIP
            </label>
          </div>
          <p className="assistant-help">
            Markdown report included. The assistant can also generate text/code
            files; uploaded and generated code is never executed.
          </p>
          <ol className="assistant-plan">
            <li>Prepare only your selected files</li>
            <li>Analyze with your selected provider</li>
            <li>Generate report and requested files locally</li>
            <li>Validate outputs before making them available</li>
          </ol>
          <button
            type="button"
            className="primary-button"
            disabled={busy || !instruction.trim() || !settings.model.trim()}
            onClick={() => void start()}
          >
            Start task
          </button>
          {busy && (
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                void bridge.assistantCancel().catch((e) => setError(String(e)))
              }
            >
              <Square size={13} /> Cancel task
            </button>
          )}
          <p role="status" className="assistant-stage">
            {state.stage}
            {state.destination && state.status === "running"
              ? ` · ${state.destination}`
              : ""}
          </p>
          {(error || state.error) && (
            <p role="alert" className="error">
              {error || state.error}
            </p>
          )}
        </div>
      </div>
      {!!state.outputs.length && (
        <div className="assistant-results">
          <h2>Verified outputs</h2>
          <p className="assistant-help">
            Generated with {state.taskModel} · {state.destination}. These are
            the outputs of the selected completed task.
          </p>
          <div className="assistant-outputs">
            {state.outputs.map((o) => (
              <button
                type="button"
                key={o.id}
                className="secondary-button"
                disabled={working}
                onClick={() =>
                  void act(async () => {
                    await bridge.assistantExport(o.id);
                  })
                }
              >
                <Download size={15} />
                {o.name}
                <small>{Math.ceil(o.size / 1024)} KB</small>
              </button>
            ))}
          </div>
          <details>
            <summary>Report preview</summary>
            <div className="markdown">
              <ReactMarkdown
                components={{
                  img: ({ alt }) => <span>[Image: {alt || "blocked"}]</span>,
                  a: ({ children }) => <span>{children}</span>,
                }}
              >
                {state.report}
              </ReactMarkdown>
            </div>
          </details>
        </div>
      )}
      <p className="assistant-help">
        Selected originals remain unchanged. Completed reports and outputs are
        saved locally in SAA’s task workspace; this workspace is not encrypted.
        Your provider receives the selected text when you start. Tasks stop
        after three minutes. Use Hide content for visual privacy.
      </p>
      {!!state.tasks?.length && (
        <details className="assistant-history">
          <summary>Completed tasks ({state.tasks.length})</summary>
          {state.tasks.map((t) => (
            <div className="assistant-history-row" key={t.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(async () =>
                    setState(await bridge.assistantOpenTask(t.id)),
                  )
                }
              >
                {t.title}
                <small>
                  {new Date(t.createdAt).toLocaleString()} · {t.outputCount}{" "}
                  outputs
                </small>
              </button>
              <button
                type="button"
                className="text-button danger"
                disabled={busy}
                onClick={() => {
                  if (deleting === t.id)
                    void act(async () => {
                      setState(await bridge.assistantDeleteTask(t.id));
                      setDeleting(null);
                    });
                  else setDeleting(t.id);
                }}
              >
                {deleting === t.id ? "Confirm delete" : "Delete task"}
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
