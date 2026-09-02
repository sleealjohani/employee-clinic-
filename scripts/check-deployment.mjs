// Check the files Vercel packages, rather than relying on the development node_modules tree.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const routes = [
  "app/login/page.js.nft.json",
  "app/api/health/route.js.nft.json",
  "app/api/import/upload/route.js.nft.json",
];
for (const route of routes) {
  const filename = path.resolve(".next/server", route);
  const trace = JSON.parse(await fs.readFile(filename, "utf8"));
  const engine = trace.files.find((file) =>
    file.endsWith("/node_modules/.prisma/client/query_compiler_bg.wasm"),
  );
  assert.ok(
    engine,
    `${route}: Prisma query compiler missing from deployment trace`,
  );
  const bytes = await fs.readFile(path.resolve(path.dirname(filename), engine));
  assert.deepEqual(
    bytes.subarray(0, 4),
    Buffer.from([0, 97, 115, 109]),
    "Valid WASM compiler asset",
  );
  if (route.includes("import/upload")) {
    assert.ok(
      trace.files.some((file) => file.endsWith("/pdf.worker.mjs")),
      "PDF worker must be packaged",
    );
    assert.ok(
      trace.files.some((file) => file.includes("/standard_fonts/")),
      "PDF fonts must be packaged",
    );
  }
}
console.log(
  "Deployment assets verified: Prisma compiler, PDF worker and fonts.",
);
