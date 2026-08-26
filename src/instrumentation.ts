/**
 * Runs once when the server starts, before any route module is loaded.
 *
 * pdf.js constructs a `DOMMatrix` while its own module is evaluating, and it
 * only obtains one from the optional `@napi-rs/canvas` native package. That
 * package is an optional dependency, so it is present in a local install and
 * absent from the deployment — which is why lab extraction worked in
 * development and failed on every PDF in production with "DOMMatrix is not
 * defined". Putting the class in place at boot removes the ordering question
 * entirely: it is there before anything can look for it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installDomMatrix } = await import("@/lib/import/dom-matrix");
  installDomMatrix();
}
