const rules = rows.map((r: any) => {
  // было: const raw = String(r.pattern ?? "");
  const raw = String(r.pattern ?? "");
  // СДЕЛАТЬ: превратить \\ в \
  const pattern = raw.includes("\\\\") ? raw.replace(/\\\\/g, "\\") : raw;

  const normKind = ["regex","regexp","re"].includes(String(r.kind||"").toLowerCase())
    ? "regex"
    : (r.kind === "word" || r.kind === "phrase") ? r.kind : "regex";

  return {
    id: String(r.id),
    pattern,                       // ← используем нормализованный шаблон
    kind: normKind as "regex"|"word"|"phrase",
    category: String(r.category ?? "misc"),
    lang: r.lang ?? null,
    severity: r.severity ?? null,
  };
});
