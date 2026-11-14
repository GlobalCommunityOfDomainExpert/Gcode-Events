import { triggerDownload } from "./download";

// A cell starting with = + - @ (or a tab / carriage return) is read by Excel
// as a formula, so a registrant who typed one as their name could run it on
// the organizer's machine. A leading apostrophe makes Excel show it as text.
const FORMULA_START = /^[=+\-@\t\r]/;

// A phone number prefixed with a tab (see phoneCell) is plain digits, so it
// can't be a formula and doesn't need the apostrophe.
const TEXT_PHONE = /^\t\+?\d{6,15}$/;

export function csvCell(cell: string): string {
  const safe =
    FORMULA_START.test(cell) && !TEXT_PHONE.test(cell) ? `'${cell}` : cell;
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

// Excel turns a bare digit string into a number (12 digits show as 9.19877E+11
// and leading zeros vanish). A leading tab keeps it as text, invisibly. Only
// plain "+" and digits get this; anything else goes through the formula guard.
export function phoneCell(phone: string | null | undefined): string {
  const value = (phone ?? "").replace(/[\s()-]/g, "");
  return /^\+?\d{6,15}$/.test(value) ? `\t${value}` : (phone ?? "").trim();
}

// "<event name> <YYYY-MM-DD of export>.csv", safe as a Windows filename.
export function exportFilename(title: string, now = new Date()): string {
  const name =
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80)
      .trim() || "Attendees";
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${name} ${date}.csv`;
}
