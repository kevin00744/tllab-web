// 建置前把 pdf.js 的 worker、字型對照表（CJK 需要）與標準字型複製到 public/pdfjs
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "node_modules", "pdfjs-dist");
const out = path.join(root, "public", "pdfjs");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(src, "build", "pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm"]) cpSync(path.join(src, dir), path.join(out, dir), { recursive: true });
console.log("pdf.js assets copied to public/pdfjs");
