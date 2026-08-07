import { buildGrepArgs, reduceGrepOutput } from "../lib/grepQuery";

const Base = { pattern: "useDrag", paths: [], untracked: false, filesOnly: false, count: false };

describe("buildGrepArgs", () => {
  it("asks for line numbers by default and passes the pattern behind -e", () => {
    expect(buildGrepArgs(Base)).toEqual([
      "grep",
      "--no-color",
      "-I",
      "--extended-regexp",
      "--line-number",
      "-e",
      "useDrag",
    ]);
  });

  it("always requests extended regex, since git grep's basic default makes a|b a literal", () => {
    expect(buildGrepArgs({ ...Base, pattern: "a|b" })).toContain("--extended-regexp");
  });

  it("passes a dash-leading pattern as data, not an option", () => {
    const args = buildGrepArgs({ ...Base, pattern: "--force" });
    expect(args[args.length - 2]).toBe("-e");
    expect(args[args.length - 1]).toBe("--force");
  });

  it("switches to file names only", () => {
    expect(buildGrepArgs({ ...Base, filesOnly: true })).toContain("--files-with-matches");
  });

  it("switches to counts", () => {
    expect(buildGrepArgs({ ...Base, count: true })).toContain("--count");
  });

  it("adds --untracked when asked", () => {
    expect(buildGrepArgs({ ...Base, untracked: true })).toContain("--untracked");
  });

  it("puts pathspecs after a literal --", () => {
    const args = buildGrepArgs({ ...Base, paths: ["src/", "docs/"] });
    expect(args.slice(-3)).toEqual(["--", "src/", "docs/"]);
  });

  it("refuses two output modes at once", () => {
    expect(() => buildGrepArgs({ ...Base, filesOnly: true, count: true })).toThrow("not both");
  });

  it("refuses an empty pattern", () => {
    expect(() => buildGrepArgs({ ...Base, pattern: "" })).toThrow("usage: tl grep");
  });

  it("refuses a dashed pathspec", () => {
    expect(() => buildGrepArgs({ ...Base, paths: ["--output=x"] })).toThrow("leading dash");
  });
});

describe("reduceGrepOutput", () => {
  it("drops blank lines and trailing whitespace", () => {
    expect(reduceGrepOutput("a.ts:1:hit  \n\nb.ts:2:hit\n")).toEqual(["a.ts:1:hit", "b.ts:2:hit"]);
  });

  it("returns nothing for empty output", () => {
    expect(reduceGrepOutput("")).toEqual([]);
  });
});
