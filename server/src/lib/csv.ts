type Row = Record<string, unknown>;

function cell(v: unknown) {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Row[], columns?: { key: string; label?: string }[]) {
  const cols: { key: string; label?: string }[] = columns ?? Object.keys(rows[0] ?? {}).map((key) => ({ key }));
  const header = cols.map((c) => cell(c.label ?? c.key)).join(',');
  const body = rows.map((r) => cols.map((c) => cell(r[c.key])).join(',')).join('\n');
  // BOM so Excel opens UTF-8 (₦) correctly
  return `﻿${header}\n${body}`;
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). Header keys are lower_snake_cased. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  const [header, ...data] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}
