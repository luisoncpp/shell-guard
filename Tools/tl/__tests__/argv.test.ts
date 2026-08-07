import { assertKnownKeys, compileRegExp, emptyArgs, numericOption, parseArgs } from "../lib/argv";

describe("parseArgs", () => {
  it("separates bare flags, key=value options and positionals", () => {
    const args = parseArgs(["audit", "origin/develop", "--quick", "--tail=15"]);
    expect(args.positional).toEqual(["audit", "origin/develop"]);
    expect([...args.flags]).toEqual(["quick"]);
    expect(args.options.get("tail")).toBe("15");
  });

  it("keeps a value containing = intact after the first separator", () => {
    expect(parseArgs(["--grep=a=b=c"]).options.get("grep")).toBe("a=b=c");
  });

  it("routes everything after a bare -- into paths", () => {
    const args = parseArgs(["origin/develop", "--stat", "--", "src/", "docs/"]);
    expect(args.positional).toEqual(["origin/develop"]);
    expect(args.paths).toEqual(["src/", "docs/"]);
  });

  it("treats a -- separator as terminal, so a later --flag is a path not a flag", () => {
    const args = parseArgs(["--", "--weird-path"]);
    expect(args.paths).toEqual(["--weird-path"]);
    expect(args.flags.size).toBe(0);
  });

  it("does not consume the token after a bare flag as its value", () => {
    // The whole reason values are --key=value: `tl fallow audit origin/develop` must
    // not lose origin/develop to a preceding flag.
    const args = parseArgs(["--quick", "origin/develop"]);
    expect(args.positional).toEqual(["origin/develop"]);
  });

  it.each(["-n", "-1", "-p", "-"])("rejects the single-dash token %s instead of making it a positional", (token) => {
    // Before this rule, `tl grep -n <pattern>` took -n as the pattern and demoted the
    // real pattern to a pathspec that matched nothing: a plausible-looking search
    // result for the wrong string, with no error anywhere.
    expect(() => parseArgs(["grep", token, "QQQQ"])).toThrow(`unknown flag "${token}"`);
  });

  it("names the --key=value form in the error, since that is the only fix", () => {
    expect(() => parseArgs(["-n"])).toThrow("--flag or --key=value form");
  });

  it("still routes a dash-leading token into paths after a bare --, where it is data", () => {
    expect(parseArgs(["--", "-weird-path"]).paths).toEqual(["-weird-path"]);
  });

  it("returns empty collections for no arguments", () => {
    const args = parseArgs([]);
    expect(args.positional).toEqual([]);
    expect(args.paths).toEqual([]);
    expect(args.flags.size).toBe(0);
    expect(args.options.size).toBe(0);
  });

  it("exposes an empty parse for callers with no argv", () => {
    expect(emptyArgs().positional).toEqual([]);
  });
});

describe("assertKnownKeys", () => {
  const flags = new Set(["quick"]);
  const options = new Set(["tail"]);

  it("accepts recognised keys", () => {
    expect(() => assertKnownKeys(parseArgs(["--quick", "--tail=3"]), flags, options)).not.toThrow();
  });

  it("rejects an unknown flag, because a typo would otherwise run a different command", () => {
    expect(() => assertKnownKeys(parseArgs(["--quik"]), flags, options)).toThrow("unknown flag --quik");
  });

  it("rejects an unknown option, which is how --output= is kept away from git", () => {
    expect(() => assertKnownKeys(parseArgs(["--output=x"]), flags, options)).toThrow("unknown option --output=");
  });

  it("ignores positionals and paths", () => {
    expect(() => assertKnownKeys(parseArgs(["a", "--", "--b"]), flags, options)).not.toThrow();
  });
});

describe("numericOption", () => {
  it("returns undefined when absent", () => {
    expect(numericOption(new Map(), "tail")).toBeUndefined();
  });

  it("parses a positive integer", () => {
    expect(numericOption(new Map([["tail", "20"]]), "tail")).toBe(20);
  });

  it.each(["0", "-3", "2.5", "abc", ""])("rejects %s", (raw) => {
    expect(() => numericOption(new Map([["tail", raw]]), "tail")).toThrow("positive integer");
  });
});

describe("compileRegExp", () => {
  it("compiles a valid pattern", () => {
    expect(compileRegExp("^a.c$", "grep").test("abc")).toBe(true);
  });

  it("names the option in the error for an invalid pattern", () => {
    expect(() => compileRegExp("[", "grep")).toThrow("--grep is not a valid regular expression");
  });
});
