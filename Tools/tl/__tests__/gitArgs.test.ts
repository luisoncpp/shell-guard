import { assertSafeGitArgument, assertSafePathspecs, buildDiffArgs, buildLogArgs, resolveDiffMode } from "../lib/gitArgs";

describe("assertSafeGitArgument", () => {
  it("returns a plain value unchanged", () => {
    expect(assertSafeGitArgument("origin/develop", "ref")).toBe("origin/develop");
  });

  it("allows a ref with punctuation git needs", () => {
    expect(assertSafeGitArgument("stash@{0}^", "ref")).toBe("stash@{0}^");
  });

  it.each(["--output=/tmp/pwn", "-o", "--exec=rm"])("refuses %s, which git would read as an option", (value) => {
    // runGit spawns without a shell, so this is not about shell injection: git's own
    // --output= writes a file, and a ref position will happily accept it.
    expect(() => assertSafeGitArgument(value, "ref")).toThrow("leading dash");
  });

  it("refuses an empty value", () => {
    expect(() => assertSafeGitArgument("", "ref")).toThrow("must not be empty");
  });

  it("validates every pathspec", () => {
    expect(assertSafePathspecs(["src/", "docs/"])).toEqual(["src/", "docs/"]);
    expect(() => assertSafePathspecs(["src/", "--output=x"])).toThrow("leading dash");
  });
});

describe("resolveDiffMode", () => {
  it("defaults to stat", () => {
    expect(resolveDiffMode(new Set())).toBe("stat");
  });

  it("picks the requested mode", () => {
    expect(resolveDiffMode(new Set(["name-status"]))).toBe("name-status");
  });

  it("ignores unrelated flags", () => {
    expect(resolveDiffMode(new Set(["cached", "patch"]))).toBe("patch");
  });

  it("refuses two modes rather than silently preferring one", () => {
    expect(() => resolveDiffMode(new Set(["stat", "patch"]))).toThrow("not several");
  });
});

describe("buildDiffArgs", () => {
  it("puts pathspecs after a literal -- so a path is never read as a ref", () => {
    expect(buildDiffArgs({ refs: ["origin/develop"], paths: ["src/"], mode: "name-status", cached: false })).toEqual([
      "diff",
      "--name-status",
      "origin/develop",
      "--",
      "src/",
    ]);
  });

  it("omits the separator when there are no pathspecs", () => {
    expect(buildDiffArgs({ refs: ["HEAD"], paths: [], mode: "stat", cached: false })).toEqual(["diff", "--stat", "HEAD"]);
  });

  it("adds --cached before the refs", () => {
    expect(buildDiffArgs({ refs: ["HEAD"], paths: [], mode: "stat", cached: true })).toEqual([
      "diff",
      "--stat",
      "--cached",
      "HEAD",
    ]);
  });

  it("supports a two-ref comparison", () => {
    const args = buildDiffArgs({ refs: ["stash@{0}^", "HEAD"], paths: [], mode: "numstat", cached: false });
    expect(args).toEqual(["diff", "--numstat", "stash@{0}^", "HEAD"]);
  });

  it("refuses a dashed ref", () => {
    expect(() => buildDiffArgs({ refs: ["--output=x"], paths: [], mode: "stat", cached: false })).toThrow("leading dash");
  });
});

describe("buildLogArgs", () => {
  it("keeps hardcoded options before the ref and pathspecs after the separator", () => {
    expect(buildLogArgs({ format: "%h %s", options: ["--date=short", "-1"], paths: ["docs/a.md"] })).toEqual([
      "log",
      "--format=%h %s",
      "--date=short",
      "-1",
      "--",
      "docs/a.md",
    ]);
  });

  it("places a ref range before the separator", () => {
    expect(buildLogArgs({ format: "%h", refRange: "abc123", paths: ["src/"] })).toEqual([
      "log",
      "--format=%h",
      "abc123",
      "--",
      "src/",
    ]);
  });

  it("refuses a dashed ref range", () => {
    expect(() => buildLogArgs({ format: "%h", refRange: "--all" })).toThrow("leading dash");
  });
});
