import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

// End-to-end wiring only. The resolution rules themselves are covered in-process by
// conflictResolver.test.ts — a subprocess earns no coverage attribution, so anything
// testable without spawning belongs there instead.
const RepoRoot = path.resolve(__dirname, "..", "..", "..");
const Cli = path.join(RepoRoot, "Tools", "tl", "index.ts");
const FixtureDir = path.join(RepoRoot, "Tools", "tl", "__fixtures__");
// Same resolution order as the tl/tl.cmd shims: the vendored tsx first, the bare
// specifier only where the host supplies its own. `--import tsx` resolves from the
// cwd, so a host without a tsx dependency would fail every case here on spawn.
const VendoredTsx = path.join(RepoRoot, "Tools", "tl", "node_modules", "tsx", "dist", "cli.mjs");
const Loader = existsSync(VendoredTsx) ? [VendoredTsx] : ["--import", "tsx"];

interface CliResult {
  status: number;
  output: string;
}

let tmpRoot: string;

function runCli(args: string[], env: Record<string, string> = {}): CliResult {
  try {
    const output = execFileSync(process.execPath, [...Loader, Cli, ...args], {
      cwd: RepoRoot,
      encoding: "utf8",
      env: { ...process.env, TL_TMP: tmpRoot, ...env },
    });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? 1, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

beforeAll(/* createIsolatedTmpAndFixtureDirs */ () => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), "tl-test-"));
  mkdirSync(FixtureDir, { recursive: true });
});

afterAll(/* removeIsolatedTmpAndFixtureDirs */ () => {
  rmSync(tmpRoot, { recursive: true, force: true });
  rmSync(FixtureDir, { recursive: true, force: true });
});

function writeFixture(name: string, contents: string): string {
  writeFileSync(path.join(FixtureDir, name), contents, "utf8");
  return `Tools/tl/__fixtures__/${name}`;
}

function readFixture(name: string): string {
  return readFileSync(path.join(FixtureDir, name), "utf8");
}

const OneHunk = ["<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> develop"].join("\n");

describe("tl conflicts --take end to end", () => {
  it("rewrites the file on disk and reports the pre-image path", () => {
    const relative = writeFixture("e2e.md", OneHunk);
    const result = runCli(["conflicts", "--take", relative, "theirs"]);
    expect(result.status).toBe(0);
    expect(readFixture("e2e.md")).toBe("theirs");
    const backupLine = result.output.split("\n").find((line) => line.startsWith("pre-image:"));
    const backupPath = backupLine?.replace("pre-image:", "").trim() ?? "";
    expect(readFileSync(backupPath, "utf8")).toBe(OneHunk);
  });

  it("refuses a file with no conflict markers", () => {
    const relative = writeFixture("clean.md", "nothing to resolve");
    const result = runCli(["conflicts", "--take", relative, "ours"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("no conflict markers");
  });

  it("propagates a spec error as exit 1 and leaves the file untouched", () => {
    const relative = writeFixture("badspec.md", OneHunk);
    const result = runCli(["conflicts", "--take", relative, "1=mine"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("bad spec segment");
    expect(readFixture("badspec.md")).toBe(OneHunk);
  });
});

describe("tl write gate", () => {
  it("refuses to write when disabled by flag", () => {
    const relative = writeFixture("gate-flag.md", OneHunk);
    const result = runCli(["conflicts", "--take", relative, "ours", "--no-write"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("writes are disabled");
    expect(readFixture("gate-flag.md")).toBe(OneHunk);
  });

  it("refuses to write when disabled by TL_WRITE=0", () => {
    const relative = writeFixture("gate-env.md", OneHunk);
    const result = runCli(["conflicts", "--take", relative, "ours"], { TL_WRITE: "0" });
    expect(result.status).toBe(1);
    expect(readFixture("gate-env.md")).toBe(OneHunk);
  });

  it("refuses a protected path holding a real conflict", () => {
    // node_modules is not guaranteed to exist: a host may run the suite before
    // `npm install`, and a pnpm/PnP layout may never create one at the repo root.
    // Without this the fixture write died with ENOENT and the guard was never
    // exercised — a setup failure that reads like a guard failure.
    const guardedDir = path.join(RepoRoot, "node_modules");
    const dirExisted = existsSync(guardedDir);
    mkdirSync(guardedDir, { recursive: true });
    const guarded = path.join(guardedDir, ".tl-guard-fixture.md");
    writeFileSync(guarded, OneHunk, "utf8");
    try {
      const result = runCli(["conflicts", "--take", "node_modules/.tl-guard-fixture.md", "ours"]);
      expect(result.status).toBe(1);
      expect(result.output).toContain("protected path");
      expect(readFileSync(guarded, "utf8")).toBe(OneHunk);
    } finally {
      rmSync(guarded, { force: true });
      // Only what this test created. An inherited node_modules is never touched.
      if (!dirExisted) rmSync(guardedDir, { recursive: true, force: true });
    }
  });

  it("refuses a path outside the repository", () => {
    const outside = path.join(tmpRoot, "outside.md");
    writeFileSync(outside, OneHunk, "utf8");
    const result = runCli(["conflicts", "--take", outside, "ours"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("outside the repository");
    expect(readFileSync(outside, "utf8")).toBe(OneHunk);
  });
});

describe("tl batch", () => {
  it("runs several verbs in one invocation, labelling each step", () => {
    const result = runCli(["batch", "where", "status --head=1"]);
    expect(result.status).toBe(0);
    expect(result.output).toContain("=== step 1/2: where (exit 0) ===");
    expect(result.output).toContain("=== step 2/2: status --head=1 (exit 0) ===");
    expect(result.output).toContain("=== 2/2 step(s) run ===");
  });

  it("refuses the write path as a step", () => {
    const relative = writeFixture("batch-take.md", OneHunk);
    const result = runCli(["batch", `conflicts --take ${relative} ours`]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("writes and may not run inside batch");
    expect(readFixture("batch-take.md")).toBe(OneHunk);
  });

  it("refuses to nest", () => {
    const result = runCli(["batch", "batch where"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("does not nest");
  });

  it("caps the number of steps", () => {
    const result = runCli(["batch", ...Array.from({ length: 11 }, () => "where")]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("the cap is");
  });

  it("keeps going after a failing step and reports the first failure as the exit code", () => {
    const result = runCli(["batch", "section missing.md a b", "where"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("=== step 2/2: where");
    expect(result.output).toContain("2/2 step(s) run");
  });

  it("stops at the first failure when asked", () => {
    const result = runCli(["batch", "section missing.md a b", "where", "--stop-on-fail"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("1 skipped after failure");
    expect(result.output).not.toContain("=== step 2/2: where");
  });
});

describe("tl output shaping", () => {
  it("applies --tail to a verb's output instead of needing a shell pipe", () => {
    const full = runCli(["where"]).output.trim().split("\n");
    const tailed = runCli(["where", "--tail=1"]).output.trim().split("\n");
    expect(full.length).toBeGreaterThan(1);
    expect(tailed).toEqual([full[full.length - 1]]);
  });

  it("applies --grep as a filter", () => {
    expect(runCli(["where", "--grep=^writes"]).output.trim()).toMatch(/^writes:/);
  });

  it("rejects a non-numeric --tail rather than ignoring it", () => {
    const result = runCli(["where", "--tail=lots"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("positive integer");
  });
});

describe("tl git argument guard", () => {
  it("refuses an unrecognised option instead of silently running a different command", () => {
    const result = runCli(["diff", "--output=.tl-pwn"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("unknown option --output=");
  });

  it("refuses an unrecognised flag", () => {
    const result = runCli(["diff", "--nmae-status"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("unknown flag --nmae-status");
  });

  it("refuses a single-dash token before it can be read as a ref", () => {
    // parseArgs now stops this one argument earlier than assertSafeGitArgument would;
    // the ref guard stays as defence in depth for callers that build args directly.
    const result = runCli(["diff", "-o"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain('unknown flag "-o"');
  });

  it("refuses a single-dash flag rather than searching for it", () => {
    // `tl grep -n <pattern>` used to take -n as the pattern and demote <pattern> to a
    // pathspec: a real-looking result set for a string nobody searched for.
    const result = runCli(["grep", "-n", "QQQQNOTPRESENT"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain('unknown flag "-n"');
  });

  it("refuses a dash-leading pathspec", () => {
    const result = runCli(["grep", "anything", "--", "--output=.tl-pwn"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("leading dash");
  });
});

describe("tl read", () => {
  it("confines reads to the repository", () => {
    const outside = path.join(tmpRoot, "outside.txt");
    writeFileSync(outside, "secret", "utf8");
    const result = runCli(["read", outside]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("outside the repository");
  });

  it("masks secret values but keeps their keys", () => {
    const relative = writeFixture("env-fixture.env", "PORT=3000\nJWT_SECRET=abc123\n");
    const output = runCli(["read", relative, "--redact"]).output;
    expect(output).toContain("PORT=3000");
    expect(output).toContain("JWT_SECRET=***");
    expect(output).not.toContain("abc123");
  });
});

describe("tl dispatch", () => {
  it("reports usage and exit 2 for an unknown verb", () => {
    const result = runCli(["bogus"]);
    expect(result.status).toBe(2);
    expect(result.output).toContain("unknown verb");
  });

  it("prints usage with no arguments", () => {
    expect(runCli([]).output).toContain("tl check");
  });

  it("reports the write toggle state via where", () => {
    expect(runCli(["where"]).output).toContain("writes: enabled");
    expect(runCli(["where"], { TL_WRITE: "0" }).output).toContain("writes: disabled");
  });

  it("lists no conflicted files in a clean tree", () => {
    expect(runCli(["conflicts"]).output).toContain("no conflicted files");
  });
});
