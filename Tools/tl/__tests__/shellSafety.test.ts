import { assertShellSafeArgument, assertShellSafeArguments, isRepoRelativePath, isShellSafeArgument } from "../lib/shellSafety";

describe("isShellSafeArgument", () => {
  it("accepts every argument shape the gate table actually builds", () => {
    for (const value of ["--noEmit", "run", "test:jest", "--silent", "--prefix", "packages/web-ui", "tsc", "--", "@scope/pkg", "a/b/tsconfig.json", "C:\\Program", ""]) {
      expect(isShellSafeArgument(value)).toBe(true);
    }
  });

  it.each([
    "x & echo pwned",
    "x && echo pwned",
    "x | echo pwned",
    "x ; echo pwned",
    "$(id)",
    "`id`",
    "%PATH%",
    "!DELAYED!",
    "x > out.txt",
    "x ^ y",
    "a b",
    "one\ntwo",
    "'quoted'",
    '"quoted"',
  ])("refuses %j, which a shell would read as syntax", (value) => {
    expect(isShellSafeArgument(value)).toBe(false);
    expect(() => assertShellSafeArgument(value, "argument to npm")).toThrow(/refusing argument to npm/);
  });

  it("checks every argument in a list, not just the first", () => {
    expect(() => assertShellSafeArguments(["run", "lint", "& echo pwned"], "argument to npm")).toThrow(/refusing/);
  });
});

describe("isRepoRelativePath", () => {
  it("accepts the repo-relative paths --project and --test are for", () => {
    expect(isRepoRelativePath("server")).toBe(true);
    expect(isRepoRelativePath("Tools/tl/__tests__/argv.test.ts")).toBe(true);
    expect(isRepoRelativePath("packages/web-ui")).toBe(true);
  });

  it("refuses traversal, options and anything a shell would expand", () => {
    for (const value of ["../elsewhere", "a/../../b", "--prefix", "-server", "/etc/passwd", "C:\\Windows", "x & echo pwned", ""]) {
      expect(isRepoRelativePath(value)).toBe(false);
    }
  });
});
