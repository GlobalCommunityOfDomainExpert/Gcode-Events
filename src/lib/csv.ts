import { triggerDownload } from "./download";

// A cell starting with = + - @ (or a tab / carriage return) is read by Excel
// as a formula, so a registrant who typed one as their name could run it on
// the organizer's machine. A leading apostrophe makes Excel show it as text.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(cell: string): string {
  const safe = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return `"${safe.replace(/"/g, '""')}"`;
}

// CRLF between rows, as Excel expects. The BOM is added by downloadCsv.
export function buildCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: string[][],
): void {
  // The UTF-8 byte-order mark makes Excel read non-English names correctly
  // instead of guessing a legacy code page.
  const blob = new Blob(["﻿", buildCsv(headers, rows)], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, filename);
}
