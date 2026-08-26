/**
 * The worker build ships no types of its own — it is only ever handed back to
 * pdf.js as the main-thread message handler, never called directly.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
