import { resolveEachRequest, summariseFile, type EachRequest } from "../lib/eachPlan";

const Contents = ["// @Architecture(...)", "import x from 'y';", "export const a = 1;"].join("\n");

function request(overrides: Partial<EachRequest>): EachRequest {
  return { mode: "cat", firstLines: 0, pattern: null, ...overrides };
}

describe("resolveEachRequest", () => {
  it("resolves a bare mode flag", () => {
    expect(resolveEachRequest(new Set(["first-line"]), new Map()).mode).toBe("first-line");
  });

  it("resolves --first=N to the first mode with its count", () => {
    const resolved = resolveEachRequest(new Set(), new Map([["first", "5"]]));
    expect(resolved.mode).toBe("first");
    expect(resolved.firstLines).toBe(5);
  });

  it("does not treat the global --head shaping option as a mode", () => {
    expect(() => resolveEachRequest(new Set(), new Map([["head", "5"]]))).toThrow("needs a mode");
  });

  it("compiles the --count regex", () => {
    expect(resolveEachRequest(new Set(), new Map([["count", "^import"]])).pattern?.source).toBe("^import");
  });

  it("requires a mode", () => {
    expect(() => resolveEachRequest(new Set(), new Map())).toThrow("needs a mode");
  });

  it("refuses two modes rather than picking one", () => {
    expect(() => resolveEachRequest(new Set(["cat", "first-line"]), new Map())).toThrow("pick one mode");
  });

  it("refuses a bare mode combined with an option mode", () => {
    expect(() => resolveEachRequest(new Set(["cat"]), new Map([["first", "2"]]))).toThrow("pick one mode");
  });
});

describe("summariseFile", () => {
  it("emits one line per file for --first-line, which is the @Architecture sweep", () => {
    expect(summariseFile("a.ts", Contents, request({ mode: "first-line" }))).toEqual(["a.ts: // @Architecture(...)"]);
  });

  it("counts lines", () => {
    expect(summariseFile("a.ts", Contents, request({ mode: "count-lines" }))).toEqual(["a.ts: 3 line(s)"]);
  });

  it("counts pattern matches", () => {
    const result = summariseFile("a.ts", Contents, request({ mode: "count", pattern: /^(import|export)/ }));
    expect(result).toEqual(["a.ts: 2 match(es)"]);
  });

  it("takes the requested number of leading lines under a file banner", () => {
    expect(summariseFile("a.ts", Contents, request({ mode: "first", firstLines: 2 }))).toEqual([
      "=== a.ts",
      "// @Architecture(...)",
      "import x from 'y';",
    ]);
  });

  it("cats the whole file under a banner", () => {
    expect(summariseFile("a.ts", Contents, request({ mode: "cat" }))).toHaveLength(4);
  });

  it("splits CRLF contents without leaving a stray carriage return", () => {
    expect(summariseFile("a.ts", "one\r\ntwo\r\n", request({ mode: "first-line" }))).toEqual(["a.ts: one"]);
  });

  it("reports an empty file as a single empty line", () => {
    expect(summariseFile("a.ts", "", request({ mode: "count-lines" }))).toEqual(["a.ts: 1 line(s)"]);
  });
});
