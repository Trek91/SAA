const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  extractFiles,
  readZip,
  makeZip,
  outputName,
  LIMITS,
} = require("./file-tools.cjs");
const { parseResponse, fileWorker } = require("./assistant.cjs");
const { PDFDocument, StandardFonts } = require("pdf-lib");
test("text and source code are read as data; invalid encoding and binary are rejected", async () => {
  assert.equal(
    (
      await extractFiles([
        {
          name: "source.js",
          bytes: Buffer.from('throw Error("must never run")'),
        },
      ])
    )[0].text,
    'throw Error("must never run")',
  );
  await assert.rejects(
    extractFiles([{ name: "bad.txt", bytes: Buffer.from([255]) }]),
    /UTF-8/,
  );
  await assert.rejects(
    extractFiles([{ name: "bad.txt", bytes: Buffer.from("a\0b") }]),
    /Binary/,
  );
  await assert.rejects(
    extractFiles([{ name: "run.exe", bytes: Buffer.from("MZ") }]),
    /Unsupported/,
  );
});
test("selection count, per-file bytes, and context length are enforced", async () => {
  await assert.rejects(extractFiles([]), /1–12/);
  await assert.rejects(
    extractFiles(Array(13).fill({ name: "a.txt", bytes: Buffer.alloc(0) })),
    /1–12/,
  );
  await assert.rejects(
    extractFiles([
      { name: "a.txt", bytes: Buffer.alloc(LIMITS.fileBytes + 1) },
    ]),
    /20 MB/,
  );
  await assert.rejects(
    extractFiles([{ name: "a.txt", bytes: Buffer.from("x".repeat(120001)) }]),
    /120,000/,
  );
});
test("archive reader preserves names and bytes and expands text only as selected context", async () => {
  const zip = await makeZip([
    { name: "docs/a.txt", bytes: Buffer.from("ZIP context") },
    { name: "nested.zip", bytes: Buffer.from("not expanded") },
  ]);
  const entries = await readZip(zip);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].bytes.toString(), "ZIP context");
  const result = (await extractFiles([{ name: "bundle.zip", bytes: zip }]))[0];
  assert.match(result.text, /ZIP context/);
  assert.match(result.text, /content not read/);
});
test("rejects ZIP traversal, symlinks, duplicate case names, entry count and expansion bombs", async () => {
  const zip = await makeZip([{ name: "abcd", bytes: Buffer.from("x") }]);
  const corrupted = Buffer.from(zip);
  for (let i = 0; i < corrupted.length - 4; i++)
    if (corrupted.subarray(i, i + 4).toString() === "abcd")
      corrupted.write("../x", i);
  await assert.rejects(readZip(corrupted), /invalid|Unsafe/i);
  const yazl = require("yazl");
  async function custom(files) {
    const z = new yazl.ZipFile(),
      chunks = [];
    const p = new Promise((resolve, reject) => {
      z.outputStream.on("data", (c) => chunks.push(c));
      z.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
      z.outputStream.on("error", reject);
    });
    for (const f of files) z.addBuffer(f.bytes, f.name, f.options);
    z.end();
    return p;
  }
  await assert.rejects(
    readZip(
      await custom([
        {
          name: "link",
          bytes: Buffer.from("target"),
          options: { mode: 0o120777 },
        },
      ]),
    ),
    /symbolic/,
  );
  await assert.rejects(
    readZip(
      await custom([
        { name: "A.txt", bytes: Buffer.from("a") },
        { name: "a.txt", bytes: Buffer.from("b") },
      ]),
    ),
    /Duplicate/,
  );
  await assert.rejects(
    readZip(
      await custom(
        Array.from({ length: 101 }, (_, i) => ({
          name: `f${i}`,
          bytes: Buffer.alloc(0),
        })),
      ),
    ),
    /100/,
  );
  await assert.rejects(
    readZip(
      await custom([
        { name: "bomb.txt", bytes: Buffer.alloc(LIMITS.fileBytes + 1) },
      ]),
    ),
    /expansion/,
  );
});
test("output names and generated model files cannot select paths or reserved files", () => {
  for (const n of ["../a", "C:\\a", "/a", "a/b", "CON.txt", "a.", "a\0b"])
    assert.throws(() => outputName(n));
  for (const n of ["../x.py", "report.pdf", "manifest.json", "run.exe"])
    assert.throws(() =>
      parseResponse(
        JSON.stringify({
          report: "summary",
          files: [{ name: n, content: "bad" }],
        }),
      ),
    );
  assert.deepEqual(parseResponse("A normal Markdown reply"), {
    report: "A normal Markdown reply",
    files: [],
  });
  assert.equal(
    parseResponse(
      JSON.stringify({
        report: "ok",
        files: [{ name: "analysis.py", content: "print(1)" }],
      }),
    ).files.length,
    1,
  );
});
test("PDF extraction includes source/page markers and rejects scanned/malformed documents", async () => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Page one source text", { font });
  pdf.addPage().drawText("Page two source text", { font });
  const bytes = await pdf.save();
  const result = await fileWorker("extractFiles", [
    { name: "source.pdf", bytes },
  ]);
  assert.equal(result[0].pages, 2);
  assert.match(result[0].text, /source.pdf · page 2/);
  assert.match(result[0].text, /Page two source text/);
  const blank = await PDFDocument.create();
  blank.addPage();
  await assert.rejects(
    fileWorker("extractFiles", [
      { name: "scan.pdf", bytes: await blank.save() },
    ]),
    /OCR/,
  );
  await assert.rejects(
    fileWorker("extractFiles", [
      { name: "bad.pdf", bytes: Buffer.from("bad") },
    ]),
    /PDF/,
  );
});
test("worker rejects unknown tools and handles immediate cancellation", async () => {
  await assert.rejects(fileWorker("exec", []), /Unknown/);
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    fileWorker("extractFiles", [], { signal: c.signal }),
    /cancelled/,
  );
});
