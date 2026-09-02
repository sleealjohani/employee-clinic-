export function splitSql(text) {
  const statements = [];
  let start = 0,
    quote = "",
    dollar = "",
    line = false,
    block = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      n = text[i + 1];
    if (line) {
      if (c === "\n") line = false;
      continue;
    }
    if (block) {
      if (c === "*" && n === "/") {
        block = false;
        i++;
      }
      continue;
    }
    if (dollar) {
      if (text.startsWith(dollar, i)) {
        i += dollar.length - 1;
        dollar = "";
      }
      continue;
    }
    if (quote) {
      if (c === quote) {
        if (n === quote) i++;
        else quote = "";
      }
      continue;
    }
    if (c === "-" && n === "-") {
      line = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      block = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === "$") {
      const m = text.slice(i).match(/^\$[a-zA-Z_0-9]*\$/);
      if (m) {
        dollar = m[0];
        i += dollar.length - 1;
        continue;
      }
    }
    if (c === ";") {
      const part = text.slice(start, i + 1).trim();
      if (part) statements.push(part);
      start = i + 1;
    }
  }
  if (text.slice(start).trim()) statements.push(text.slice(start).trim());
  return statements;
}
