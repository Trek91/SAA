"use strict";
const path = require("node:path");
const { crc32 } = require("node:zlib");
const { TextDecoder } = require("node:util");
const yauzl = require("yauzl"),
  yazl = require("yazl");
const LIMITS = {
  files: 12,
  fileBytes: 20 * 1024 * 1024,
  totalBytes: 40 * 1024 * 1024,
  entries: 100,
  expandedBytes: 40 * 1024 * 1024,
  chars: 120000,
  pages: 200,
};
const TEXT = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".jsonl",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".html",
  ".css",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
  ".sql",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".sh",
  ".toml",
  ".ini",
]);
function safeEntry(name) {
  if (
    typeof name !== "string" ||
    !name ||
    name.length > 240 ||
    /[\\\x00-\x1f:]/.test(name) ||
    name.startsWith("/") ||
    name
      .split("/")
      .some(
        (p) => p === ".." || p === "." || (!p && p !== name.split("/").at(-1)),
      )
  )
    throw Error("Unsafe archive filename.");
  return name;
}
function outputName(name) {
  safeEntry(name);
  if (
    name.includes("/") ||
    /[<>"|?*]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)
  )
    throw Error("Unsafe output filename.");
  return name;
}
function readZip(bytes) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      Buffer.from(bytes),
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error) return reject(error);
        let count = 0,
          total = 0,
          finished = false;
        const entries = [],
          names = new Set();
        const fail = (e) => {
          if (finished) return;
          finished = true;
          zip.close();
          reject(e);
        };
        zip.on("error", fail);
        zip.on("end", () => {
          if (!finished) {
            finished = true;
            resolve(entries);
          }
        });
        zip.on("entry", (entry) => {
          try {
            safeEntry(entry.fileName);
            const key = entry.fileName.toLowerCase();
            if (names.has(key)) throw Error("Duplicate archive filename.");
            names.add(key);
            if (++count > LIMITS.entries)
              throw Error("ZIP contains more than 100 entries.");
            if (entry.generalPurposeBitFlag & 1)
              throw Error("Encrypted ZIP files are not supported.");
            const mode = entry.externalFileAttributes >>> 16;
            if ((mode & 0xf000) === 0xa000)
              throw Error("ZIP symbolic links are not allowed.");
            total += entry.uncompressedSize;
            if (
              total > LIMITS.expandedBytes ||
              entry.uncompressedSize > LIMITS.fileBytes
            )
              throw Error("ZIP expansion limit exceeded.");
            if (entry.fileName.endsWith("/")) return zip.readEntry();
            zip.openReadStream(entry, (err, stream) => {
              if (err) return fail(err);
              let size = 0;
              const chunks = [];
              stream.on("data", (chunk) => {
                size += chunk.length;
                if (size > entry.uncompressedSize || size > LIMITS.fileBytes) {
                  stream.destroy();
                  fail(Error("ZIP expansion limit exceeded."));
                } else chunks.push(chunk);
              });
              stream.on("error", fail);
              stream.on("end", () => {
                if (finished) return;
                const bytes = Buffer.concat(chunks);
                if (crc32(bytes) !== entry.crc32)
                  return fail(Error("ZIP checksum verification failed."));
                entries.push({ name: entry.fileName, bytes });
                zip.readEntry();
              });
            });
          } catch (e) {
            fail(e);
          }
        });
        zip.readEntry();
      },
    );
  });
}
async function parse(name, bytes) {
  const ext = path.extname(name).toLowerCase();
  if (TEXT.has(ext)) {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw Error("Text must use UTF-8 encoding.");
    }
    if (text.includes("\0"))
      throw Error("Binary content is not supported as text.");
    return { name, text };
  }
  if (ext === ".pdf") {
    if (!Buffer.from(bytes).subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw Error("Invalid PDF header.");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    let doc, loading;
    try {
      loading = getDocument({
        data: Uint8Array.from(bytes),
        isEvalSupported: false,
        disableFontFace: true,
        useSystemFonts: false,
        stopAtErrors: true,
        maxImageSize: 0,
        standardFontDataUrl:
          path
            .join(
              path.dirname(require.resolve("pdfjs-dist/package.json")),
              "standard_fonts",
            )
            .replaceAll("\\", "/") + "/",
      });
      try {
        doc = await loading.promise;
      } catch (error) {
        if (error.name === "PasswordException")
          throw Error(
            "Password-protected PDFs are not supported. Select an unencrypted copy.",
          );
        throw error;
      }
      if (doc.numPages > LIMITS.pages) throw Error("PDF exceeds 200 pages.");
      const pages = [];
      let size = 0;
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n),
          content = await page.getTextContent();
        const text = content.items
          .map((i) => i.str + (i.hasEOL ? "\n" : " "))
          .join("");
        size += text.length;
        if (size > LIMITS.chars)
          throw Error("PDF text exceeds the task context limit.");
        pages.push({ page: n, text });
        page.cleanup();
      }
      if (!pages.some((p) => p.text.trim()))
        throw Error(
          "No readable PDF text. Scanned PDFs need OCR, which is not included yet.",
        );
      return {
        name,
        pages: doc.numPages,
        text: pages
          .map(
            (p) =>
              `[${name} · page ${p.page}]\n${p.text.trim() ? p.text : "[No readable text on this page; OCR may be needed.]"}`,
          )
          .join("\n\n"),
      };
    } finally {
      await loading?.destroy();
    }
  }
  if (ext === ".docx") {
    await readZip(bytes);
    const result = await require("mammoth").extractRawText({
      buffer: Buffer.from(bytes),
    });
    return { name, text: result.value };
  }
  if (ext === ".zip") {
    const entries = await readZip(bytes);
    const sections = [];
    for (const e of entries) {
      const suffix = path.extname(e.name).toLowerCase();
      if (TEXT.has(suffix) || suffix === ".pdf") {
        const parsed = await parse(e.name, e.bytes);
        sections.push(`[Archive entry: ${e.name}]\n${parsed.text}`);
      } else
        sections.push(
          `[Archive entry: ${e.name} · content not read (${e.bytes.length} bytes)]`,
        );
      if (sections.join("\n").length > LIMITS.chars)
        throw Error("ZIP text exceeds the task context limit.");
    }
    return {
      name,
      entries: entries.map((e) => ({ name: e.name, size: e.bytes.length })),
      text: sections.join("\n\n"),
    };
  }
  throw Error(
    "Unsupported file type. Choose PDF, DOCX, ZIP or UTF-8 text/code files.",
  );
}
async function extractFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > LIMITS.files)
    throw Error("Select 1–12 files.");
  let total = 0,
    chars = 0;
  const result = [];
  for (const f of files) {
    outputName(f.name);
    const bytes = Buffer.from(f.bytes);
    total += bytes.length;
    if (bytes.length > LIMITS.fileBytes || total > LIMITS.totalBytes)
      throw Error("Files exceed the 20 MB each / 40 MB total limit.");
    const parsed = await parse(f.name, bytes);
    chars += parsed.text.length;
    if (chars > LIMITS.chars)
      throw Error(
        "Selected text exceeds 120,000 characters. Select fewer or smaller files.",
      );
    result.push(parsed);
  }
  return result;
}
async function makeZip(files) {
  const zip = new yazl.ZipFile(),
    chunks = [];
  let size = 0,
    total = 0;
  const names = new Set();
  for (const f of files) {
    safeEntry(f.name);
    if (names.has(f.name.toLowerCase()))
      throw Error("Duplicate output filename.");
    names.add(f.name.toLowerCase());
    total += f.bytes.length;
    if (total > LIMITS.expandedBytes)
      throw Error("Output bundle exceeds 40 MB.");
    zip.addBuffer(Buffer.from(f.bytes), f.name);
  }
  const result = new Promise((resolve, reject) => {
    zip.outputStream.on("error", reject);
    zip.outputStream.on("data", (c) => {
      size += c.length;
      if (size > LIMITS.totalBytes) {
        zip.outputStream.destroy(Error("Output ZIP is too large."));
      } else chunks.push(c);
    });
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
  zip.end();
  return result;
}
module.exports = { LIMITS, extractFiles, readZip, makeZip, outputName };
