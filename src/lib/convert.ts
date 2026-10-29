import "server-only";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// LibreOffice 轉檔：同時最多 2 個，避免小主機記憶體不足
const MAX_CONCURRENT = 2;
const TIMEOUT_MS = 120_000;
let running = 0;
const queue: (() => void)[] = [];

async function acquire() {
  if (running < MAX_CONCURRENT) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  running++;
}

function release() {
  running--;
  queue.shift()?.();
}

/** PPT/PPTX → PDF。每次使用獨立的 LibreOffice 設定檔目錄，才能同時轉換 */
export async function convertToPdf(input: Buffer, ext: string): Promise<Buffer> {
  await acquire();
  const dir = path.join(tmpdir(), `tllab-convert-${randomUUID()}`);
  try {
    await mkdir(dir, { recursive: true });
    const source = path.join(dir, `source.${ext}`);
    await writeFile(source, input);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        /*turbopackIgnore: true*/ process.env.SOFFICE_PATH || "soffice",
        [
          `-env:UserInstallation=file://${path.join(dir, "profile")}`,
          "--headless",
          "--norestore",
          "--convert-to",
          "pdf",
          "--outdir",
          dir,
          source,
        ],
        { stdio: "ignore" },
      );
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("conversion timed out"));
      }, TIMEOUT_MS);
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`soffice exited with ${code}`));
      });
    });
    return await readFile(path.join(dir, "source.pdf"));
  } finally {
    release();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
