// lib/mod-rules.ts
// Нормализация/транслитерация, компиляция правил и подсветка исходных диапазонов.

/** ---- Типы правил из БД/UI ---- */
export type UIRule = {
  id: string;
  pattern: string;                   // слово / фраза / регэксп / корень
  kind: "word" | "phrase" | "regex" | "stem"; // "stem" — поиск по корню
  category?: string;
  lang?: string | null;
  severity?: number | null;

  /** Граница слова для word/stem:
   *  - "both"  → ^слово$ (по умолчанию для word)
   *  - "left"  → ^корень…  (по умолчанию для stem)
   *  - "none"  → …корень…  (разрешено внутри слова)
   */
  boundary?: "both" | "left" | "none";
};

export type CompiledRule = UIRule & {
  rx?: RegExp;    // для word/phrase/stem — матч по нормализованному тексту
  rxRaw?: RegExp; // для regex — матч по «сырому» тексту
};

export type Span = {
  start: number;
  end: number;           // эксклюзивно
  ruleId?: string;
  matchedText?: string;
};

export type CheckResult = { ok: boolean; reason?: string | null; spans?: Span[] };

export const MOD_LEVELS = ["lenient", "medium", "strict"] as const;
export type ModLevel = typeof MOD_LEVELS[number];
export const HTML_SAFE = true;

/* ========= Нормализация символов (латиница/кириллица/leetspeak) ========= */
const MAP: Record<string, string> = {
  a:"a",b:"b",c:"c",d:"d",e:"e",f:"f",g:"g",h:"h",i:"i",j:"j",k:"k",l:"l",m:"m",
  n:"n",o:"o",p:"p",q:"q",r:"r",s:"s",t:"t",u:"u",v:"v",w:"w",x:"x",y:"y",z:"z",
  "0":"o","1":"i","2":"z","3":"e","4":"a","5":"s","6":"b","7":"t","8":"b","9":"g",
  "@":"a","$":"s","€":"e","£":"l","¥":"y","!":"i","|":"l","°":"o",
  "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"j","з":"z","и":"i","й":"i",
  "к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f",
  "х":"h","ц":"c","ч":"h","ш":"h","щ":"h","ъ":"", "ы":"y","ь":"", "э":"e","ю":"u","я":"a",
};

function canonChar(ch: string): string {
  const low = ch.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(MAP, low)) return MAP[low];
  const base = low.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  if (Object.prototype.hasOwnProperty.call(MAP, base)) return MAP[base];
  if (/[a-z0-9]/.test(base)) return base;
  return "";
}

type Norm = { norm: string; idx: number[] };

/** Нормализуем и строим карту позиций исходного текста */
function normalizeWithMap(raw: string): Norm {
  const chars: string[] = [];
  const idx: number[] = [];
  let i = 0;
  const push1 = (c: string, pos: number) => { chars.push(c); idx.push(pos); };

  while (i < raw.length) {
    const ch = raw[i];
    // грубое выпиливание HTML/markdown
    if (ch === "<") { const j = raw.indexOf(">", i + 1); i = j === -1 ? i + 1 : j + 1; continue; }
    if (ch === "*" || ch === "_" || ch === "~" || ch === "`") { i++; continue; }
    const c = canonChar(ch);
    if (c === "") { if (chars.length && chars[chars.length - 1] !== " ") push1(" ", i); i++; continue; }
    push1(c, i); i++;
  }

  // схлопываем пробелы
  let out = ""; const outIdx: number[] = [];
  for (let k = 0; k < chars.length; k++) {
    const c = chars[k];
    if (c === " " && (!out || out[out.length - 1] === " ")) continue;
    out += c; outIdx.push(idx[k]);
  }
  if (out.endsWith(" ")) { out = out.slice(0, -1); outIdx.pop(); }
  return { norm: out, idx: outIdx };
}

/* =================== Компиляция правил =================== */
const ESC = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lettersOf = (s: string) => normalizeWithMap(s).norm.replace(/\s+/g, "");

/** Базовая "фуззи" сборка из букв (между буквами допускаем пробелы) */
function fuzzyBody(letters: string) {
  return letters.split("").map(ESC).join("\\s*");
}

/** Для word/phrase/stem — строим RegExp по нормализованному тексту */
function buildRxForRule(kind: UIRule["kind"], pattern: string, boundary?: UIRule["boundary"]): RegExp {
  // AUTO-DETECTION:
  // - trailing "*" → stem/left (корень с начала слова)
  // - trailing "**" → stem/none (корень внутри слова)
  let autoKind = kind;
  let autoBoundary = boundary;
  let pat = pattern.trim();

  if (autoKind !== "regex") {
    const twoStars = /\*\*$/.test(pat);
    const oneStar = !twoStars && /\*$/.test(pat);
    if (twoStars || oneStar) {
      autoKind = "stem";
      if (!autoBoundary) autoBoundary = twoStars ? "none" : "left";
      pat = pat.replace(/\*+$/, "");
    }
  }

  // Нормализованные "буквы" паттерна
  const letters = lettersOf(pat);
  const body = fuzzyBody(letters);

  // Выбор границ
  const left  =
    (autoKind === "word" && (autoBoundary ?? "both") !== "none") ||
    (autoKind === "stem" && (autoBoundary ?? "left") !== "none")
      ? "(?<![a-z0-9])" : "";

  const right =
    (autoKind === "word" && (autoBoundary ?? "both") !== "none")
      ? "(?![a-z0-9])" : (
        autoKind === "stem" && (autoBoundary ?? "left") === "both"
          ? "(?![a-z0-9])"
          : ""
      );

  // Суффикс для stem: разрешаем любой хвост слова
  const suffix = autoKind === "stem" ? "[a-z0-9]*" : "";

  const source =
    autoKind === "phrase" ? body :
    `${left}${body}${suffix}${right}`;

  // u — для юникода в lookbehind, i — регистр, g — поиск всех
  return new RegExp(source, "giu");
}

export function compileRules(rules: UIRule[]): CompiledRule[] {
  const out: CompiledRule[] = [];
  for (const r of rules || []) {
    try {
      if (r.kind === "regex") {
        out.push({ ...r, rxRaw: new RegExp(r.pattern, "giu") });
        continue;
      }
      const rx = buildRxForRule(r.kind, r.pattern, r.boundary);
      out.push({ ...r, rx });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("Bad moderation rule, skipped:", r.id, e);
    }
  }
  return out;
}

/* ============ Загрузка правил (из /api/moderation/rules*) ============ */
let _compiled: CompiledRule[] | null = null;

export async function loadCompiledRules(): Promise<CompiledRule[]> {
  if (_compiled) return _compiled;

  const urls = [
    `/api/moderation/rules/list?_=${Date.now()}`,
    `/api/moderation/rules?_=${Date.now()}`
  ];

  let raw: any[] = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const text = await res.text();
      if (!ct.includes("application/json")) continue;

      let data: any = {};
      try { data = JSON.parse(text || "{}"); } catch { data = {}; }

      raw =
        Array.isArray(data) ? data :
        Array.isArray(data.rules) ? data.rules :
        Array.isArray(data.items) ? data.items :
        Array.isArray(data.list)  ? data.list  :
        (data.rules && Array.isArray(data.rules.items)) ? data.rules.items :
        Array.isArray(data.data)  ? data.data  :
        [];

      if (raw.length) break;
    } catch { /* try next */ }
  }

  _compiled = compileRules(raw as UIRule[]);
  // eslint-disable-next-line no-console
  console.log("Loaded moderation rules:", _compiled.length);
  return _compiled!;
}

/* ============ Поиск «плохих» диапазонов в ОРИГИНАЛЕ ============ */
export function findBadSpans(text: string, rules: CompiledRule[]): Span[] {
  const spans: Span[] = [];
  const { norm, idx } = normalizeWithMap(text);

  // 1) Правила по нормализованному тексту (word/phrase/stem)
  for (const r of rules) {
    if (!r.rx) continue;
    r.rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.rx.exec(norm))) {
      let ns = m.index, ne = ns + (m[0]?.length || 0) - 1;
      if (ne < ns) continue;
      while (ns <= ne && norm[ns] === " ") ns++;
      while (ne >= ns && norm[ne] === " ") ne--;
      if (ns > ne) continue;
      const s = idx[ns]; const e = (idx[ne] ?? idx[ns]) + 1;
      if (s != null && e != null && e > s) {
        spans.push({ start: s, end: e, ruleId: r.id, matchedText: text.slice(s, e) });
      }
      if (m.index === r.rx.lastIndex) r.rx.lastIndex++;
    }
  }

  // 2) "Сырые" regex-правила (rxRaw) — прямо по исходнику
  for (const r of rules) {
    if (!r.rxRaw) continue;
    r.rxRaw.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.rxRaw.exec(text))) {
      const s = m.index; const e = s + (m[0]?.length || 0);
      if (e > s) spans.push({ start: s, end: e, ruleId: r.id, matchedText: text.slice(s, e) });
      if (m.index === r.rxRaw.lastIndex) r.rxRaw.lastIndex++;
    }
  }

  // Слияние пересечений
  spans.sort((a,b)=>a.start-b.start || b.end-a.end);
  const merged: Span[] = [];
  for (const h of spans) {
    const last = merged[merged.length-1];
    if (last && h.start <= last.end) last.end = Math.max(last.end, h.end);
    else merged.push(h);
  }
  return merged;
}

/* ============ Базовая безопасная проверка HTML ============ */
export function validateCommentHtml(html: string, level: ModLevel = "medium"): CheckResult {
  const src = String(html ?? "").trim();
  if (!src) return { ok: true };

  const forbiddenTags =
    /<\/?\s*(script|style|iframe|object|embed|link|meta|svg|math|audio|video|source|form|input|button|textarea|select|option|frame|frameset|noscript)\b/i;
  if (forbiddenTags.test(src)) return { ok: false, reason: "forbidden_tag" };

  if (/\son[a-z]+\s*=/i.test(src)) return { ok: false, reason: "inline_event_handler" };
  if (/(href|src)\s*=\s*["']\s*javascript\s*:/i.test(src)) return { ok: false, reason: "javascript_protocol" };
  if (/style\s*=\s*["'][^"']*(expression|url\(\s*javascript\s*:)/i.test(src)) return { ok: false, reason: "dangerous_style" };

  const maxLen = level === "strict" ? 10_000 : 20_000;
  if (src.length > maxLen) return { ok: false, reason: "too_long" };
  return { ok: true };
}

export async function validateCommentHtmlAsync(html: string, level: ModLevel = "medium"): Promise<CheckResult> {
  const base = validateCommentHtml(html, level);
  if (!base.ok) return base;
  try {
    const rules = await loadCompiledRules();
    const spans = findBadSpans(html, rules);
    if (spans.length) return { ok: false, reason: "rule_hit", spans };
    return { ok: true };
  } catch {
    // если правила не загрузились — не блокируем
    return { ok: true };
  }
}
