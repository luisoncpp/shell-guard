import { assertTestPath, assertWorkspaceName, workspaceGates } from "../lib/gatePlan";

describe("assertWorkspaceName", () => {
  it("accepts plain and nested directory names", () => {
    expect(assertWorkspaceName("server")).toBe("server");
    expect(assertWorkspaceName("packages/web-ui")).toBe("packages/web-ui");
    expect(assertWorkspaceName("apps/api.v2")).toBe("apps/api.v2");
  });

  it("rejects a leading dash, which npm would read as an option", () => {
    expect(() => assertWorkspaceName("--prefix")).toThrow(/unsafe --project/);
    expect(() => assertWorkspaceName("-server")).toThrow(/unsafe --project/);
  });

  it("rejects traversal out of the repository", () => {
    expect(() => assertWorkspaceName("../elsewhere")).toThrow(/unsafe --project/);
    expect(() => assertWorkspaceName("a/../../b")).toThrow(/unsafe --project/);
  });

  it("rejects anything a shell would expand", () => {
    for (const name of ["a b", "a;rm -rf /", "a&&b", "a|b", "$(id)", "a`id`", "a>b", "a*"]) {
      expect(() => assertWorkspaceName(name)).toThrow(/unsafe --project/);
    }
  });
});

describe("assertTestPath", () => {
  it("accepts a repo-relative test file", () => {
    expect(assertTestPath("Tools/tl/__tests__/argv.test.ts")).toBe("Tools/tl/__tests__/argv.test.ts");
  });

  it("refuses a value that would inject a second command into the jest gate", () => {
    // --test is appended to an npm argument list, and runTool uses a shell on Windows.
    for (const value of ["x & echo pwned & rem", "x && whoami", "$(id)", "../../etc/passwd", "--runInBand"]) {
      expect(() => assertTestPath(value)).toThrow(/unsafe --test/);
    }
  });
});

describe("workspaceGates", () => {
  it("builds tsc, lint and test gates from what the workspace actually has", () => {
    expect(workspaceGates("server", { hasTsconfig: true, scripts: ["lint", "test"] })).toEqual([
      { name: "tsc", command: "npx", args: ["tsc", "--noEmit", "-p", "server/tsconfig.json"], inQuickRun: true },
      { name: "lint", command: "npm", args: ["--prefix", "server", "run", "lint", "--silent"], inQuickRun: true },
      { name: "jest", command: "npm", args: ["--prefix", "server", "run", "test", "--silent"], inQuickRun: false },
    ]);
  });

  it("omits gates the workspace cannot run", () => {
    expect(workspaceGates("admin", { hasTsconfig: true, scripts: [] })).toEqual([
      { name: "tsc", command: "npx", args: ["tsc", "--noEmit", "-p", "admin/tsconfig.json"], inQuickRun: true },
    ]);
  });

  it("prefers test:jest over test when both exist", () => {
    const gates = workspaceGates("web", { hasTsconfig: false, scripts: ["test", "test:jest"] });
    expect(gates.map((gate) => gate.args)).toEqual([["--prefix", "web", "run", "test:jest", "--silent"]]);
  });

  it("only the test gate is outside a --quick run", () => {
    const gates = workspaceGates("web", { hasTsconfig: true, scripts: ["lint", "test"] });
    expect(gates.filter((gate) => gate.inQuickRun).map((gate) => gate.name)).toEqual(["tsc", "lint"]);
  });

  it("refuses a directory with nothing to check", () => {
    expect(() => workspaceGates("docs", { hasTsconfig: false, scripts: ["build"] })).toThrow(/no tsconfig/);
  });
});
