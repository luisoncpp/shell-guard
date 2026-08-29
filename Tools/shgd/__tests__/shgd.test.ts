import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

// End-to-end wiring only. The resolution rules themselves are covered in-process by
// conflictResolver.test.ts — a subprocess earns no coverage attribution, so anything
// testable without spawning belongs there instead.
const RepoRoot = path.resolve(__dirname, "..", "..", "..");
const Cli = path.join(RepoRoot, "Tools", "shgd", "index.ts");
const FixtureDir = path.join(RepoRoot, "Tools", "shgd", "__fixtures__");
// Same resolution order as the shgd/shgd.cmd shims: the vendored tsx first, the bare
// specifier only where the host supplies its own. `--import tsx` resolves from the
// cwd, so a host without a tsx dependency would fail every case here on spawn.
const VendoredTsx = path.join(RepoRoot, "Tools", "shgd", "node_modules", "tsx", "dist", "cli.mjs");
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
      env: { ...process.env, SHGD_TMP: tmpRoot, ...env },
    });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? 1, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

beforeAll(/* createIsolatedTmpAndFixtureDirs */ () => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), "shgd-test-"));
  mkdirSync(FixtureDir, { recursive: true });
});

afterAll(/* removeIsolatedTmpAndFixtureDirs */ () => {
  rmSync(tmpRoot, { recursive: true, force: true });
  rmSync(FixtureDir, { recursive: true, force: true });
});

function writeFixture(name: string, contents: string): string {
  writeFileSync(path.join(FixtureDir, name), contents, "utf8");
  return `Tools/shgd/__fixtures__/${name}`;
}

function readFixture(name: string): string {
  return readFileSync(path.join(FixtureDir, name), "utf8");
}

const OneHunk = ["<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> develop"].join("\n");

describe("shgd conflicts --take end to end", () => {
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

describe("shgd write gate", () => {
  it("refuses to write when disabled by flag", () => {
    const relative = writeFixture("gate-flag.md", OneHunk);
    const result = runCli(["conflicts", "--take", relative, "ours", "--no-write"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("writes are disabled");
    expect(readFixture("gate-flag.md")).toBe(OneHunk);
  });

  it("refuses to write when disabled by SHGD_WRITE=0", () => {
    const relative = writeFixture("gate-env.md", OneHunk);
    const result = runCli(["conflicts", "--take", relative, "ours"], { SHGD_WRITE: "0" });
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
    const guarded = path.join(guardedDir, ".shgd-guard-fixture.md");
    writeFileSync(guarded, OneHunk, "utf8");
    try {
      const result = runCli(["conflicts", "--take", "node_modules/.shgd-guard-fixture.md", "ours"]);
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

describe("shgd shell-argument guard", () => {
  // Both of these reach runTool, which uses a shell on Windows where Node quotes
  // nothing. Each was a working arbitrary-command execution under one Bash(shgd:*) rule.
  it("refuses a --test= value that would inject a command into the jest gate", () => {
    const result = runCli(["check", "--only=jest", "--test=x & echo pwned > pwned.txt & rem"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("unsafe --test");
    expect(existsSync(path.join(RepoRoot, "pwned.txt"))).toBe(false);
  });

  it("refuses a fallow base that would inject a command", () => {
    const result = runCli(["fallow", "audit", "x & echo pwned > pwned.txt & rem"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("refusing base");
    expect(existsSync(path.join(RepoRoot, "pwned.txt"))).toBe(false);
  });
});

describe("shgd link containment", () => {
  function linkOutside(name: string): string | null {
    const outsideDir = path.join(tmpRoot, name);
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(path.join(outsideDir, "secret.md"), OneHunk, "utf8");
    const link = path.join(FixtureDir, name);
    try {
      // A junction needs no administrator rights on Windows; elsewhere this is a
      // directory symlink, which git itself will happily carry in a hostile repo.
      symlinkSync(outsideDir, link, "junction");
    } catch {
      return null;
    }
    return link;
  }

  function removeLink(link: string): void {
    try {
      unlinkSync(link);
    } catch {
      rmdirSync(link);
    }
  }

  it("refuses to read or write through a link that leaves the repository", () => {
    const link = linkOutside("escape-tree");
    if (!link) return; // no permission to create links here; the unit guards still hold
    const target = path.join(tmpRoot, "escape-tree", "secret.md");
    const through = "Tools/shgd/__fixtures__/escape-tree/secret.md";
    try {
      const shown = runCli(["read", through]);
      expect(shown.status).toBe(1);
      expect(shown.output).toContain("outside the repository");
      expect(shown.output).not.toContain("<<<<<<<");

      const taken = runCli(["conflicts", "--take", through, "theirs"]);
      expect(taken.status).toBe(1);
      expect(taken.output).toContain("outside the repository");
      expect(readFileSync(target, "utf8")).toBe(OneHunk);

      // Whether `git ls-files --others` walks into the link is git's business; either
      // the sweep never names the file or the reader refuses it. It is never rewritten.
      const rewritten = runCli(["replace", "ours", "pwned", "--take", "--", through]);
      expect(rewritten.output).not.toContain("file(s) written");
      expect(readFileSync(target, "utf8")).toBe(OneHunk);
    } finally {
      removeLink(link);
    }
  });
});

describe("shgd conflicts --show", () => {
  it("confines the reader to the repository", () => {
    const outside = path.join(tmpRoot, "outside-show.md");
    writeFileSync(outside, OneHunk, "utf8");
    const result = runCli(["conflicts", "--show", outside]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("outside the repository");
    expect(result.output).not.toContain("<<<<<<<");
  });
});

describe("shgd batch", () => {
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

describe("shgd output shaping", () => {
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

describe("shgd git argument guard", () => {
  it("refuses an unrecognised option instead of silently running a different command", () => {
    const result = runCli(["diff", "--output=.shgd-pwn"]);
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
    // `shgd grep -n <pattern>` used to take -n as the pattern and demote <pattern> to a
    // pathspec: a real-looking result set for a string nobody searched for.
    const result = runCli(["grep", "-n", "QQQQNOTPRESENT"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain('unknown flag "-n"');
  });

  it("refuses a dash-leading pathspec", () => {
    const result = runCli(["grep", "anything", "--", "--output=.shgd-pwn"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("leading dash");
  });
});

describe("shgd read", () => {
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

describe("shgd replace end to end", () => {
  const Doc = "`activeItems` and pendingItems, plus activeItemsCount\n";

  it("previews without writing, and writes only with --take", () => {
    const relative = writeFixture("rename.md", Doc);
    const spec = ["replace", "activeItems", "liveItems", "--word", "--", relative];

    const preview = runCli(spec);
    expect(preview.status).toBe(0);
    expect(preview.output).toContain("preview only");
    expect(readFixture("rename.md")).toBe(Doc);

    const written = runCli(["replace", "activeItems", "liveItems", "--word", "--take", "--", relative]);
    expect(written.status).toBe(0);
    expect(readFixture("rename.md")).toBe("`liveItems` and pendingItems, plus activeItemsCount\n");
    const backupLine = written.output.split("\n").find((line) => line.includes("pre-image:"));
    expect(readFileSync(backupLine?.split("pre-image:")[1].trim() ?? "", "utf8")).toBe(Doc);
  });

  it("applies several rules across several files in one call", () => {
    writeFixture("multi-a.md", "activeItems\n");
    writeFixture("multi-b.md", "pendingItems\n");
    const result = runCli([
      "replace", "activeItems", "liveItems", "pendingItems", "staleItems",
      "--word", "--take", "--", "Tools/shgd/__fixtures__/multi-*.md",
    ]);
    expect(result.status).toBe(0);
    expect(readFixture("multi-a.md")).toBe("liveItems\n");
    expect(readFixture("multi-b.md")).toBe("staleItems\n");
    expect(result.output).toContain("2 file(s) written");
  });

  it("refuses an odd number of positionals rather than guessing the pairing", () => {
    const relative = writeFixture("odd.md", Doc);
    const result = runCli(["replace", "a", "b", "c", "--take", "--", relative]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("pairs; got 3");
    expect(readFixture("odd.md")).toBe(Doc);
  });

  it("refuses to write when a matched file is protected, without touching the others", () => {
    const relative = writeFixture("safe.md", Doc);
    const result = runCli(["replace", "activeItems", "x", "--take", "--", relative, ".claude"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("protected path");
    expect(readFixture("safe.md")).toBe(Doc);
  });

  it("refuses to run inside batch, because it writes", () => {
    const result = runCli(["batch", "replace a b --take -- Tools/shgd/__fixtures__"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("may not run inside batch");
  });
});

describe("shgd check", () => {
  it("lists the default gates when no .shgd.json is present", () => {
    const result = runCli(["check", "--list"]);
    expect(result.status).toBe(0);
    expect(result.output).toContain("tsc  spawn=npx  quick=yes");
    expect(result.output).toContain("lint  spawn=npm  quick=yes");
    expect(result.output).toContain("jest  spawn=npm  quick=no  role=test");
  });

  it("refuses an unknown --only gate name", () => {
    const result = runCli(["check", "--only=clang-tidy"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("--only=clang-tidy is not a gate");
  });

  it("refuses replace --take on .shgd.json", () => {
    const relative = writeFixture(".shgd.json", '{"schemaVersion":1,"gates":[]}');
    const result = runCli(["replace", "schemaVersion", "schemaVersionX", "--take", "--", relative]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("protected path");
    expect(readFixture(".shgd.json")).toContain('"schemaVersion":1');
  });
});

describe("shgd ignored end to end", () => {
  it("names the .gitignore rule that decided an ignored path", () => {
    writeFixture(".gitignore", "*.log\n");
    const result = runCli(["ignored", "Tools/shgd/__fixtures__/app.log"]);
    expect(result.status).toBe(0);
    expect(result.output).toContain("Tools/shgd/__fixtures__/.gitignore:1");
    expect(result.output).toContain("*.log");
    expect(result.output).toContain("-- 1 of 1 path(s) ignored");
  });

  it("answers exit 0 with a verdict when nothing is ignored, so a batch does not halt", () => {
    const result = runCli(["ignored", "Tools/shgd/index.ts"]);
    expect(result.status).toBe(0);
    expect(result.output).toContain("not ignored: Tools/shgd/index.ts");
    expect(result.output).toContain("-- 0 of 1 path(s) ignored");
  });

  it("refuses a path resolving outside the repository", () => {
    const result = runCli(["ignored", "../outside.log"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("outside the repository");
  });

  it("refuses a call with no path", () => {
    const result = runCli(["ignored"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("usage: shgd ignored");
  });
});

describe("shgd dispatch", () => {
  it("reports usage and exit 2 for an unknown verb", () => {
    const result = runCli(["bogus"]);
    expect(result.status).toBe(2);
    expect(result.output).toContain("unknown verb");
  });

  it("prints usage with no arguments", () => {
    expect(runCli([]).output).toContain("shgd check");
  });

  it("reports the write toggle state via where", () => {
    expect(runCli(["where"]).output).toContain("writes: enabled");
    expect(runCli(["where"], { SHGD_WRITE: "0" }).output).toContain("writes: disabled");
  });

  it("lists no conflicted files in a clean tree", () => {
    expect(runCli(["conflicts"]).output).toContain("no conflicted files");
  });
});
