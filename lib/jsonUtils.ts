// Escape control characters (newline, tab, CR) yang literal di dalam string JSON
export function sanitizeJSONString(raw: string): string {
  let inString = false;
  let escaped = false;
  let result = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      result += ch;
    } else if (ch === "\\" && inString) {
      escaped = true;
      result += ch;
    } else if (ch === '"') {
      inString = !inString;
      result += ch;
    } else if (inString && ch === "\n") {
      result += "\\n";
    } else if (inString && ch === "\r") {
      result += "\\r";
    } else if (inString && ch === "\t") {
      result += "\\t";
    } else {
      result += ch;
    }
  }
  return result;
}

// Ekstrak objek JSON pertama yang seimbang (tracking brace depth)
function extractFirstObject(s: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) return s.slice(start, i + 1);
    }
  }
  return null;
}

// Hapus trailing comma sebelum } atau ]
function removeTrailingCommas(s: string): string {
  return s.replace(/,(\s*[}\]])/g, "$1");
}

export function extractAndParseJSON<T>(raw: string, label = "JSON"): T {
  // 1. Buang markdown code block
  const stripped = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();

  // 2. Ekstrak JSON object pertama yang seimbang
  const extracted = extractFirstObject(stripped);
  if (!extracted) {
    console.error(`[extractAndParseJSON] Tidak ada object JSON untuk ${label}. Raw:`, raw.slice(0, 300));
    throw new Error(`Qwen tidak menghasilkan ${label} yang valid`);
  }

  // 3. Sanitasi + repair
  const sanitized = removeTrailingCommas(sanitizeJSONString(extracted));

  try {
    return JSON.parse(sanitized) as T;
  } catch (e) {
    console.error(`[extractAndParseJSON] Parse gagal untuk ${label}. Sanitized (500c):`, sanitized.slice(0, 500));
    throw new Error(`JSON tidak valid untuk ${label}: ${(e as Error).message}`);
  }
}
