import { applyTestSelector, formatGateListing, parseCheckConfig } from "../lib/checkConfig";

const NodeDefault = {
  schemaVersion: 1,
  gates: [
    { name: "tsc", command: "npx", args: ["tsc", "--noEmit"], inQuickRun: true },
    { name: "lint", command: "npm", args: ["run", "lint", "--silent"], inQuickRun: true },
    { name: "jest", command: "npm", args: ["run", "test:jest", "--silent"], inQuickRun: false, role: "test" },
  ],
};

describe("parseCheckConfig", () => {
  it("admits a valid Node default config", () => {
    const config = parseCheckConfig(NodeDefault);
    expect(config.schemaVersion).toBe(1);
    expect(config.gates).toHaveLength(3);
    expect(config.gates[0].spawn).toEqual({ kind: "npm", command: "npx" });
    expect(config.gates[2].role).toBe("test");
  });

  it("admits PATH tools and repo-relative wrappers", () => {
    const config = parseCheckConfig({
      schemaVersion: 1,
      gates: [
        { name: "clang-tidy", command: "clang-tidy", args: ["-p", "compile_commands.json"], inQuickRun: true },
        { name: "automation", command: "Tools/RunTests.sh", args: [], inQuickRun: false, role: "test" },
      ],
    });
    expect(config.gates[0].spawn).toEqual({ kind: "path", command: "clang-tidy" });
    expect(config.gates[1].spawn).toEqual({ kind: "repo", command: "Tools/RunTests.sh" });
  });

  it("admits optional diffBase and sourceExtensions", () => {
    const config = parseCheckConfig({
      ...NodeDefault,
      diffBase: "origin/main",
      sourceExtensions: [".h", ".cpp"],
    });
    expect(config.diffBase).toBe("origin/main");
    expect(config.sourceExtensions).toEqual([".h", ".cpp"]);
  });

  it("refuses an unknown schema version", () => {
    expect(() => parseCheckConfig({ schemaVersion: 2, gates: NodeDefault.gates })).toThrow(/unsupported schemaVersion 2/);
  });

  it("refuses a missing or empty gates array", () => {
    expect(() => parseCheckConfig({ schemaVersion: 1 })).toThrow(/gates must be a non-empty array/);
    expect(() => parseCheckConfig({ schemaVersion: 1, gates: [] })).toThrow(/gates must be a non-empty array/);
  });

  it("refuses duplicate gate names", () => {
    expect(() => parseCheckConfig({
      schemaVersion: 1,
      gates: [
        { name: "lint", command: "npm", args: ["run", "lint"], inQuickRun: true },
        { name: "lint", command: "npm", args: ["run", "lint"], inQuickRun: true },
      ],
    })).toThrow(/duplicate gate name "lint"/);
  });

  it("refuses invalid gate names", () => {
    expect(() => parseCheckConfig({
      schemaVersion: 1,
      gates: [{ name: "1bad", command: "true", args: [], inQuickRun: true }],
    })).toThrow(/refusing gate name "1bad"/);
  });

  it("refuses two gates with role test", () => {
    expect(() => parseCheckConfig({
      schemaVersion: 1,
      gates: [
        { name: "a", command: "true", args: [], inQuickRun: false, role: "test" },
        { name: "b", command: "true", args: [], inQuickRun: false, role: "test" },
      ],
    })).toThrow(/multiple gates have role "test"/);
  });

  it("refuses shell interpreters as command", () => {
    for (const shell of ["sh", "bash", "zsh", "fish", "cmd", "cmd.exe", "command", "powershell", "pwsh", "BASH"]) {
      expect(() => parseCheckConfig({
        schemaVersion: 1,
        gates: [{ name: "bad", command: shell, args: [], inQuickRun: true }],
      })).toThrow(new RegExp(`refusing gate command "${shell}"`));
    }
  });

  it("refuses interpreter flags as the first argument", () => {
    for (const flag of ["-c", "-e", "--eval", "-Command", "-EncodedCommand", "/c"]) {
      expect(() => parseCheckConfig({
        schemaVersion: 1,
        gates: [{ name: "bad", command: "node", args: [flag, "code"], inQuickRun: true }],
      })).toThrow(new RegExp(`refusing gates\\[0\\] first argument "${flag}"`));
    }
  });

  it("refuses absolute paths and leading-dash basenames", () => {
    expect(() => parseCheckConfig({
      schemaVersion: 1,
      gates: [{ name: "bad", command: "/usr/bin/clang-tidy", args: [], inQuickRun: true }],
    })).toThrow(/refusing gate command "\/usr\/bin\/clang-tidy"/);
    expect(() => parseCheckConfig({
      schemaVersion: 1,
      gates: [{ name: "bad", command: "-clang-tidy", args: [], inQuickRun: true }],
    })).toThrow(/refusing gate command "-clang-tidy"/);
  });

  it("refuses repo-relative commands ending in .cmd or .bat", () => {
    for (const command of ["Tools/run.cmd", "Tools/run.bat", "Tools/run.CMD"]) {
      expect(() => parseCheckConfig({
        schemaVersion: 1,
        gates: [{ name: "bad", command, args: [], inQuickRun: true }],
      })).toThrow(/\.cmd\/\.bat wrappers need a shell in v1/);
    }
  });

  it("refuses unsafe npm/npx arguments", () => {
    expect(() => parseCheckConfig({
      schemaVersion: 1,
      gates: [{ name: "lint", command: "npm", args: ["run", "lint;rm -rf /"], inQuickRun: true }],
    })).toThrow(/npm\/npx arguments must be shell-safe/);
  });

  it("allows semicolons in path/repo gate arguments", () => {
    const config = parseCheckConfig({
      schemaVersion: 1,
      gates: [{
        name: "automation",
        command: "Tools/RunTests.sh",
        args: ["-ExecCmds=Automation RunTests Now; Quit"],
        inQuickRun: false,
      }],
    });
    expect(config.gates[0].args[0]).toContain(";");
  });

  it("refuses NUL and newlines in path/repo arguments", () => {
    expect(() => parseCheckConfig({
      schemaVersion: 1,
      gates: [{ name: "tool", command: "lizard", args: ["a\0b"], inQuickRun: true }],
    })).toThrow(/NUL or raw newlines/);
    expect(() => parseCheckConfig({
      schemaVersion: 1,
      gates: [{ name: "tool", command: "lizard", args: ["a\nb"], inQuickRun: true }],
    })).toThrow(/NUL or raw newlines/);
  });

  it("refuses bad sourceExtensions", () => {
    expect(() => parseCheckConfig({
      ...NodeDefault,
      sourceExtensions: [],
    })).toThrow(/sourceExtensions must be a non-empty array/);
    expect(() => parseCheckConfig({
      ...NodeDefault,
      sourceExtensions: ["cpp"],
    })).toThrow(/refusing sourceExtensions entry "cpp"/);
  });

  it("refuses an unsafe diffBase", () => {
    expect(() => parseCheckConfig({
      ...NodeDefault,
      diffBase: "origin/main & echo pwned",
    })).toThrow(/refusing diffBase/);
  });
});

describe("formatGateListing", () => {
  it("prints stable readable lines", () => {
    const lines = formatGateListing(parseCheckConfig(NodeDefault).gates);
    expect(lines).toEqual([
      "tsc  spawn=npx  quick=yes",
      "  npx tsc --noEmit",
      "lint  spawn=npm  quick=yes",
      "  npm run lint --silent",
      "jest  spawn=npm  quick=no  role=test",
      "  npm run test:jest --silent",
    ]);
  });
});

describe("applyTestSelector", () => {
  const jestGate = parseCheckConfig(NodeDefault).gates[2];

  it("appends -- then the selector for npm gates", () => {
    expect(applyTestSelector(jestGate, "src/foo.test.ts").args).toEqual([
      "run", "test:jest", "--silent", "--", "src/foo.test.ts",
    ]);
  });

  it("appends the selector directly for repo gates", () => {
    const repoGate = parseCheckConfig({
      schemaVersion: 1,
      gates: [{ name: "automation", command: "Tools/RunTests.sh", args: [], inQuickRun: false, role: "test" }],
    }).gates[0];
    expect(applyTestSelector(repoGate, "MyGame.Suite.Case").args).toEqual(["MyGame.Suite.Case"]);
  });

  it("leaves non-test gates unchanged", () => {
    const tsc = parseCheckConfig(NodeDefault).gates[0];
    expect(applyTestSelector(tsc, "ignored")).toBe(tsc);
  });
});
