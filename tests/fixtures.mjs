// All identities and observations in this module are synthetic.
export function syntheticId(last = 1) {
  const body = "19990000" + last;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const d = Number(body[i]) * (i % 2 === 0 ? 2 : 1);
    sum += Math.floor(d / 10) + (d % 10);
  }
  return body + String((10 - (sum % 10)) % 10);
}
export function syntheticPdf(lines, padding = 0) {
  const escape = (s) =>
    s.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const content =
    "BT /F1 12 Tf 50 750 Td " +
    lines
      .map((line, i) => (i ? "0 -20 Td " : "") + "(" + escape(line) + ") Tj")
      .join("\n") +
    " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " +
      Buffer.byteLength(content) +
      " >>\nstream\n" +
      content +
      "\nendstream",
  ];
  let text = "%PDF-1.4\n" + (padding ? "%" + "x".repeat(padding) + "\n" : ""),
    offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(text));
    text += i + 1 + " 0 obj\n" + objects[i] + "\nendobj\n";
  }
  const xref = Buffer.byteLength(text);
  text +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" +
    xref +
    "\n%%EOF";
  return Buffer.from(text);
}
