import { buildCheckIgnoreArgs, formatVerdicts, parseCheckIgnore } from "../lib/ignoreQuery";

describe("buildCheckIgnoreArgs", () => {
  it("always pairs --verbose with --non-matching, so every path gets a verdict", () => {
    expect(buildCheckIgnoreArgs({ paths: ["a.log"], noIndex: false })).toEqual([
      "check-ignore",
      "--verbose",
      "--non-matching",
      "--",
      "a.log",
    ]);
  });

  it("adds --no-index when asked", () => {
    expect(buildCheckIgnoreArgs({ paths: ["a.log"], noIndex: true })).toContain("--no-index");
  });

  it("puts every path after a literal --", () => {
    const args = buildCheckIgnoreArgs({ paths: ["a.log", "build/"], noIndex: false });
    expect(args.slice(-3)).toEqual(["--", "a.log", "build/"]);
  });

  it("refuses a call with no path rather than querying the whole tree", () => {
    expect(() => buildCheckIgnoreArgs({ paths: [], noIndex: false })).toThrow("usage: shgd ignored");
  });

  it("refuses a dash-leading path, which git would read as an option", () => {
    expect(() => buildCheckIgnoreArgs({ paths: ["--output=x"], noIndex: false })).toThrow("leading dash");
  });
});

describe("parseCheckIgnore", () => {
  it("reads source, line and pattern off a matched path", () => {
    expect(parseCheckIgnore(".gitignore:12:*.log\tbuild/app.log")).toEqual([
      { path: "build/app.log", ignored: true, source: ".gitignore:12", pattern: "*.log" },
    ]);
  });

  it("reports the empty :: decision of --non-matching as not ignored", () => {
    expect(parseCheckIgnore("::\tsrc/index.ts")).toEqual([{ path: "src/index.ts", ignored: false }]);
  });

  it("keeps a nested .gitignore's own path intact as the source", () => {
    const [verdict] = parseCheckIgnore("Tools/shgd/.gitignore:3:node_modules/\tTools/shgd/node_modules/tsx");
    expect(verdict.source).toBe("Tools/shgd/.gitignore:3");
    expect(verdict.pattern).toBe("node_modules/");
  });

  it("keeps a colon inside the pattern, since only the line number splits the decision", () => {
    expect(parseCheckIgnore(".gitignore:4:build:out/\tbuild:out/x")[0].pattern).toBe("build:out/");
  });

  it("returns one verdict per line and drops blanks", () => {
    expect(parseCheckIgnore(".gitignore:1:a\ta\n\n::\tb\n")).toHaveLength(2);
  });

  it("returns nothing for empty output", () => {
    expect(parseCheckIgnore("")).toEqual([]);
  });
});

describe("formatVerdicts", () => {
  const Ignored = { path: "a.log", ignored: true, source: ".gitignore:12", pattern: "*.log" };
  const NotIgnored = { path: "src/index.ts", ignored: false };

  it("names the deciding rule and counts the verdicts", () => {
    const lines = formatVerdicts([Ignored], /*noIndex=*/false);
    expect(lines[0]).toContain("a.log  <- .gitignore:12  *.log");
    expect(lines[1]).toBe("-- 1 of 1 path(s) ignored");
  });

  it("hints at --no-index when something came back unignored", () => {
    expect(formatVerdicts([Ignored, NotIgnored], /*noIndex=*/false).join("\n")).toContain("--no-index");
  });

  it("drops the hint once --no-index is already in play", () => {
    expect(formatVerdicts([NotIgnored], /*noIndex=*/true).join("\n")).not.toContain("--no-index");
  });

  it("drops the hint when every path was ignored, since nothing is unexplained", () => {
    expect(formatVerdicts([Ignored], /*noIndex=*/false).join("\n")).not.toContain("--no-index");
  });
});
