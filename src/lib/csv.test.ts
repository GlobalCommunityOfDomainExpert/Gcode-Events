import { describe, expect, it } from "vitest";
import { buildCsv, csvCell, exportFilename, phoneCell } from "./csv";

describe("csv", () => {
  it("quotes cells and doubles embedded quotes", () => {
    expect(csvCell('Ann "AJ" Lee')).toBe('"Ann ""AJ"" Lee"');
  });

  it("prefixes formula-looking cells with an apostrophe", () => {
    for (const bad of [
      "=1+1",
      "+91 98",
      "-2+3",
      "@SUM(A1)",
      "\tcmd",
      "\rcmd",
    ]) {
      expect(csvCell(bad)).toBe(`"'${bad}"`);
    }
    expect(csvCell("Priya = admin")).toBe('"Priya = admin"');
  });

  it("joins rows with CRLF and keeps non-English text intact", () => {
    const csv = buildCsv(["Name", "Email"], [["अनुज", "a@example.com"]]);
    expect(csv).toBe('"Name","Email"\r\n"अनुज","a@example.com"');
  });

  it("keeps phone numbers as text without the apostrophe", () => {
    expect(phoneCell("+91 98765-43210")).toBe("\t+919876543210");
    expect(csvCell(phoneCell("+919876543210"))).toBe('"\t+919876543210"');
    expect(phoneCell("9876543210")).toBe("\t9876543210");
    expect(phoneCell(null)).toBe("");
    // not a plain number: left to the formula guard
    expect(csvCell(phoneCell("=1+1"))).toBe(`"'=1+1"`);
    expect(csvCell(phoneCell("+1-2"))).toBe(`"'+1-2"`);
  });

  it("names the file after the event and the export date", () => {
    const day = new Date(2026, 10, 14, 9, 30);
    expect(exportFilename("Sarjapur Got Talent", day)).toBe(
      "Sarjapur Got Talent 2026-11-14.csv",
    );
    expect(exportFilename('A/B: "Demo"? <1>', day)).toBe(
      "A B Demo 1 2026-11-14.csv",
    );
    expect(exportFilename("   ", day)).toBe("Attendees 2026-11-14.csv");
  });
});
