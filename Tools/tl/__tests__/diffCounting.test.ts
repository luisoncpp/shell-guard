import {
  countSubstantiveLines,
  isCountableSource,
  parseNumstat,
  rankByChurn,
  totalChurn,
} from "../lib/diffCounting";

describe("isCountableSource", () => {
  it("accepts the project's source extensions", () => {
    expect(isCountableSource("src/a.ts")).toBe(true);
    expect(isCountableSource("src/a.tsx")).toBe(true);
    expect(isCountableSource("src-tauri/src/lib.rs")).toBe(true);
  });

  it("rejects tests and non-source files", () => {
    expect(isCountableSource("src/__tests__/a.test.ts")).toBe(false);
    expect(isCountableSource("docs/a.md")).toBe(false);
    expect(isCountableSource("package.json")).toBe(false);
  });
});

describe("countSubstantiveLines", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "+const kept = 1;",
    "+// a comment",
    "+  * jsdoc continuation",
    "+/* block open */",
    "+",
    "-const removed = 2;",
    "-// removed comment",
  ].join("\n");

  it("counts code lines and skips comments and blanks", () => {
    expect(countSubstantiveLines(diff)).toEqual({ added: 1, deleted: 1 });
  });

  it("does not count the +++/--- file headers as changes", () => {
    const headersOnly = ["--- a/src/a.ts", "+++ b/src/a.ts"].join("\n");
    expect(countSubstantiveLines(headersOnly)).toEqual({ added: 0, deleted: 0 });
  });

  it("attributes lines to the file header that precedes them", () => {
    const twoFiles = [
      "+++ b/src/__tests__/a.test.ts",
      "+expect(1).toBe(1);",
      "+++ b/src/b.ts",
      "+const counted = 1;",
    ].join("\n");
    expect(countSubstantiveLines(twoFiles)).toEqual({ added: 1, deleted: 0 });
  });

  it("ignores changes before any file header", () => {
    expect(countSubstantiveLines("+orphan line")).toEqual({ added: 0, deleted: 0 });
  });

  it("ignores non-source files entirely", () => {
    const docs = ["+++ b/docs/a.md", "+# heading", "-# old"].join("\n");
    expect(countSubstantiveLines(docs)).toEqual({ added: 0, deleted: 0 });
  });
});

describe("parseNumstat", () => {
  it("parses tab-separated rows and skips blanks", () => {
    expect(parseNumstat("3\t4\tsrc/a.ts\n\n1\t0\tsrc/b.ts\n")).toEqual([
      { added: 3, deleted: 4, filePath: "src/a.ts" },
      { added: 1, deleted: 0, filePath: "src/b.ts" },
    ]);
  });

  it("treats binary '-' counts as zero rather than NaN", () => {
    expect(parseNumstat("-\t-\tassets/sprite.png")).toEqual([
      { added: 0, deleted: 0, filePath: "assets/sprite.png" },
    ]);
  });
});

describe("rankByChurn / totalChurn", () => {
  const entries = [
    { added: 1, deleted: 1, filePath: "small.ts" },
    { added: 10, deleted: 5, filePath: "big.ts" },
    { added: 4, deleted: 0, filePath: "mid.ts" },
  ];

  it("ranks by added plus deleted, descending", () => {
    expect(rankByChurn(entries).map((entry) => entry.filePath)).toEqual(["big.ts", "mid.ts", "small.ts"]);
  });

  it("does not mutate its input", () => {
    rankByChurn(entries);
    expect(entries[0].filePath).toBe("small.ts");
  });

  it("sums both directions", () => {
    expect(totalChurn(entries)).toEqual({ added: 15, deleted: 6 });
  });
});
