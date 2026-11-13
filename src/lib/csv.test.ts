import { describe, expect, it } from "vitest";
import { buildCsv, csvCell } from "./csv";

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
});
