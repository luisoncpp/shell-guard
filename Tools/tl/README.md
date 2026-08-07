# `tl` — agent-facing repo inspection CLI

Why it exists: some shell shapes can never be pre-approved. A `for` loop, command
substitution, `awk`, `sed -i`, an inline `node -e`/`python -c` — there is no
`permissions.allow` syntax that names any of them, so they prompt every time regardless
of what the allow list contains. `tl` converts those shapes into single parseable
invocations that one allow rule covers forever.

**The un-allowlistable program is the cost, not the separator.** This document used to
claim the opposite, and the claim has expired. Claude Code once failed to parse *any*
compound line, so `;`-joined sequences of individually-allowed commands prompted too,
and collapsing separators was `tl`'s headline argument. It now splits a compound line
and allows it when **every** part matches a rule. Measured 2026-08-07 against the rules
in [Allowing `tl` in Claude Code](#allowing-tl-in-claude-code):

| Command | Prompts? |
|---------|----------|
| `./Tools/tl/tl -- status` | no |
| `cd <repo> && ./Tools/tl/tl -- status` | no |
| `./Tools/tl/tl -- status ; ./Tools/tl/tl -- where` | no |
| `./Tools/tl/tl -- status && node -e "console.log(1)"` | **yes** |

The last row is the one that still matters: a single un-allowed part gates the whole
line. Two commands joined by `;` do not.

What survives is a narrower, sturdier claim. Reach for `tl` when the alternative names a
program an allow rule cannot, not merely when it contains two commands — which makes the
verbs the primary argument and `batch` a secondary one. `batch` keeps its place on two
other grounds that have nothing to do with permissions: **one tool call instead of N**,
and labelled per-step output with shaping applied per step.

Consumer: agents, via a `tl` skill in the host repo's `.claude/skills/`. Not part of
any shipped application.

TypeScript throughout, run through a vendored `tsx` with no build step. See
[Installing](#installing) — the folder carries its own `package.json`, so dropping it
into a repo never touches the host's.

This README is the tool's own documentation and travels with `Tools/tl/`. See
[Host project coupling](#host-project-coupling) for everything a different repo must
change.

## Pure/IO split — the load-bearing structure

Every rule worth testing lives in a **dependency-free** module under `lib/`; every
module that touches a process, the filesystem or git is a thin wrapper around one.
This is not tidiness: a test that spawns a subprocess earns **no coverage
attribution**, and uncovered code inflates a CRAP-style complexity score regardless of
how well tested it actually is. Keeping the rules pure is what lets them be
unit-tested in-process, which is what keeps them off the findings list.

Effect of the split: every complexity finding that survives is an IO verb — none of
the pure `lib/` modules appears on the list. The count tracks the number of verbs, not
the quality of the code; do not chase it to zero.

| Layer | Files | Coverage |
|-------|-------|----------|
| Pure rules | `lib/argv.ts`, `lib/batchPlan.ts`, `lib/conflictResolver.ts`, `lib/constants.ts`, `lib/diffCounting.ts`, `lib/eachPlan.ts`, `lib/fallowReport.ts`, `lib/gatePlan.ts`, `lib/gitArgs.ts`, `lib/grepQuery.ts`, `lib/lines.ts`, `lib/outputShaping.ts`, `lib/redaction.ts`, `lib/sectionSlice.ts`, `lib/usage.ts`, `lib/verb.ts` | ~100% in-process |
| IO | `lib/run.ts`, `lib/paths.ts`, `lib/writeGuard.ts`, `verbs/*.ts`, `index.ts` | subprocess only (uncredited) |

**A new rule belongs in a pure module.** Putting it in a verb costs coverage,
testability, and a complexity finding.

## Files

Paths are relative to this directory.

| File | Responsibility |
|------|----------------|
| `index.ts` | Verb table, dispatch, unknown-key rejection, output shaping, printing; thrown error → exit 1, unknown verb → exit 2. `--no-write` sets `TL_NO_WRITE` before any verb runs |
| `lib/argv.ts` | **Pure.** `parseArgs` → `{flags, options, positional, paths}`; `assertKnownKeys`, `numericOption`, `compileRegExp` |
| `lib/verb.ts` | The `VerbResult`/`VerbHandler`/`StepDispatch` contract. Its own module so verbs never import `index.ts` |
| `lib/outputShaping.ts` | **Pure.** `shapeLines` (grep → maxCols → head → tail), `capLines` |
| `lib/batchPlan.ts` | **Pure.** `tokenizeStep` (quote-aware), `planSteps` admission: verb known, not `batch`, no `--take`, step cap |
| `lib/gitArgs.ts` | **Pure.** `assertSafeGitArgument` (no leading dash), `buildDiffArgs`, `buildLogArgs`, `resolveDiffMode` |
| `lib/grepQuery.ts` | **Pure.** `git grep` argument construction (pattern behind `-e`), output reduction |
| `lib/eachPlan.ts` | **Pure.** `resolveEachRequest` (one mode only), `summariseFile` |
| `lib/gatePlan.ts` | **Pure.** The `Gate` shape, `RootGates`, `assertWorkspaceName` (shell-safe directory grammar), `workspaceGates` (the fixed per-workspace gate template) |
| `lib/lines.ts` | **Pure.** `splitLines` on `/\r?\n/` — see the CRLF invariant below |
| `lib/redaction.ts` | **Pure.** `redactLine`: connection-string passwords + secret-looking assignment values |
| `lib/sectionSlice.ts` | **Pure.** `sliceSection`, inclusive of both boundaries like `sed -n '/a/,/b/p'` |
| `lib/usage.ts` | Usage text only, kept out of `index.ts` so the entry point stays scannable |
| `lib/constants.ts` | Frozen tunables: `Limits`, `ExpectedFallowSchemaVersion`, `DefaultDiffBase`, `ConflictMarkers`, `SourceExtensions`, `KnownFlags`, `KnownOptions` |
| `lib/conflictResolver.ts` | **Pure.** `classifyLine` marker state machine, `countHunks`, `resolveLines`, `parseSpec` |
| `lib/diffCounting.ts` | **Pure.** `countSubstantiveLines(diffText)`, `parseNumstat`, `rankByChurn`, `totalChurn`, `isCountableSource` |
| `lib/fallowReport.ts` | **Pure.** `reduceAudit`/`reduceDupes`/`deadCodeLines`/`newGroupLines` → printable lines + pass/fail, `schemaWarning`, `parseSection` |
| `lib/run.ts` | `runGit` (shell:false), `runTool` (shell:true, npm/npx only), `gitLines` |
| `lib/paths.ts` | Cached `repoRoot()` via `git rev-parse --show-toplevel`, `tmpDir()` (`TL_TMP` or os tmp), `backupDir()`, containment helpers |
| `lib/writeGuard.ts` | The single write choke point: toggle, containment, `findProtectedSegment`, pre-image copy, then write |
| `verbs/batch.ts` | Runs planned steps through the injected dispatcher, labels each, applies per-step shaping |
| `verbs/check.ts` | Resolves `--project` to a directory, answers `gatePlan`'s filesystem questions (tsconfig present, package scripts), runs the gates, per-gate status + failing tail |
| `verbs/fallow.ts` | Invokes `npx fallow --format json`, delegates all formatting to `fallowReport` |
| `verbs/diffstat.ts` | Captures `git diff --numstat` / `-U0`, delegates counting to `diffCounting` |
| `verbs/diff.ts` | `git diff` over caller-supplied refs in a chosen mode |
| `verbs/history.ts` | `--file` provenance, `--commits` per-commit breakdown, `--find` across all refs; also `show` |
| `verbs/status.ts` | Branch line + porcelain + conflicted count |
| `verbs/grep.ts` | `git grep` wrapper; no matches is exit 0, not exit 1 |
| `verbs/each.ts` | Resolves a pathspec via `git ls-files`, applies one `eachPlan` mode per file |
| `verbs/read.ts` | `read` (optionally redacted) and `section`, both confined to the repo |
| `verbs/conflicts.ts` | Conflict listing, hunk display, `--audit`, `--take` orchestration |
| `tl`, `tl.cmd` | PATH shims; run `index.ts` through the vendored `tsx`, resolved from the script's own directory rather than the cwd |
| `package.json` | This directory's private manifest — the `tsx` dependency, kept out of the host's |

Tests: one in-process suite per pure module
(`argv`, `batchPlan`, `conflictResolver`, `diffCounting`, `eachPlan`, `fallowReport`,
`gatePlan`, `gitArgs`, `grepQuery`, `outputShaping`, `redaction`, `sectionSlice`,
`writeGuard`),
plus `__tests__/tl.test.ts` — subprocess through the same vendored `tsx`, for end-to-end
wiring and the guards only.

**Test files go in `__tests__/`, never `lib/*.test.ts`** when the host's Jest config
matches only `**/__tests__/**/*.test.ts` — a suite beside its module would silently
never run.

## Data flow — `batch "<step>" "<step>"`

1. `index.ts` parses the outer argv; each positional is one raw step string.
2. `planSteps` tokenizes each step quote-aware, then admits it: the verb must exist in
   the table, must not be `batch`, and its argv must not contain `--take`. More than
   `Limits.BatchMaxSteps` steps is refused outright.
3. Each step is re-parsed with the *same* `parseArgs` and dispatched through the *same*
   verb table, injected as `StepDispatch` so `batch` never imports `index.ts`.
4. A step's own `--head`/`--tail`/`--grep`/`--max-cols` shape that step's lines; the
   outer call's shaping then applies to the concatenation.
5. A throwing step becomes one `tl: <message>` line with exit 1 and does not abort the
   run unless `--stop-on-fail` was passed. Exit code is the first non-zero.

There is deliberately **no data flow between steps.** Piping step N's output into step
N+1 needs a substitution syntax, and a substitution syntax makes `batch` a programming
language rather than a fixed list of pre-approved verbs.

## Data flow — `conflicts --take <file> <spec>`

1. `index.ts` parses argv; `--take` routes to `takeConflict`.
2. `path.resolve(repoRoot(), relativePath)` — accepts relative or absolute.
3. **`assertWritable` runs before the file is read.** Order is deliberate: refusing
   after reading would still have leaked a protected file's contents into the
   transcript on the error path.
4. File is read and split; `countHunks` counts `<<<<<<<` lines.
5. `parseSpec` builds an index→side function. A bare `ours`/`theirs` applies to all;
   a per-hunk spec is checked for **full coverage** and rejected if any hunk is
   unnamed.
6. `resolveLines` walks the marker state machine once via `classifyLine`, dropping
   markers, dropping `|||||||` base sections unconditionally, and dropping the
   non-chosen side.
7. `writeRepoFile` re-asserts the guard, copies the current file to
   `TL_TMP/backups/<iso-stamp>__<flattened-path>`, then writes.
8. Surviving marker count becomes the exit code (non-zero if any remain).

## Invariants

- **Verbs return `VerbResult`; they never print.** Printing and shaping belong to
  `index.ts`. A verb calling `console.log` is invisible to `--tail`/`--grep` and its
  output escapes `batch`'s step labelling.
- **The set of executable programs is a compile-time constant.** `lib/gatePlan.ts` is
  the only place a program name appears (`npx tsc`, `npm run`); `--project` supplies a
  *directory*, never a command. The npm script it runs must already exist in that
  workspace's `package.json`, and the directory must pass `assertWorkspaceName` —
  `runTool` uses a shell on Windows, so an unvalidated name there would make one allow
  rule cover arbitrary execution.
- **`batch` composes verbs, never programs.** No step may write, nest, or name anything
  outside the verb table. `tl exec "<pipeline>"` must never exist: under a blanket
  `Bash(tl:*)` rule it would be an unrestricted shell.
- **An unrecognised `--flag` or `--key=` is an error, not a no-op** (`assertKnownKeys`).
  `tl` forwards no unknown option to git, so an unknown key is always a typo — and
  silently ignoring `--output=x` would run a *different* command than the caller asked
  for, which is worse than refusing.
- **A single-dash token is rejected in `parseArgs`, not treated as a positional.** `tl`
  has no short options, and `assertKnownKeys` only inspects `--` tokens — so `-n` used
  to slip through as a *positional*, becoming `tl grep`'s pattern and demoting the real
  pattern to a pathspec matching no file. `git grep -e -n` is a valid search, so the
  result was a plausible, wrong answer with no error: `tl grep -n "^<<<<<<<"` reported
  conflict-marker hits from prose like `per-frame re-render`. The rule lives in
  `argv.ts` so it covers every verb that reads `args.positional` at once.
- **Every caller-supplied git ref and pathspec passes `assertSafeGitArgument`.**
  `runGit` is shell-free, which stops shell injection but not git's own file-writing
  options — `git diff --output=<file>` is honoured in a ref position. Pathspecs always
  follow a literal `--`.
- **Read-only verbs split file contents with `splitLines`, not `.split('\n')`.** On a
  CRLF file the naive split leaves a `\r` on every line, and JavaScript treats `\r` as a
  line terminator that `.` will not match — so any `$`-anchored regex silently matches
  nothing. This was a real redaction failure, not a hypothetical. `conflictResolver` is
  the deliberate exception: it rejoins with `\n` and must not rewrite line endings.
- **`tl grep` passes `--extended-regexp` to git.** `git grep` defaults to *basic*
  regex, where `a|b` and `x+` are literals — an alternation pattern silently returns
  "no matches" instead of erroring. Extended is what a caller typing a regex expects,
  and it matches the JS syntax used by every `--grep=` shaping option.
- **Every write goes through `writeRepoFile`.** A blanket `Bash(tl:*)` allow rule
  bypasses Claude Code's own protected-path layer, so `writeGuard.ts` re-implements
  that list. A verb writing with bare `writeFileSync` silently defeats the guard.
- **`runGit` must never use a shell.** It receives caller-supplied file paths.
  `runTool` may use one only because Node refuses to spawn `npm.cmd`/`npx.cmd`
  directly on Windows, and its argument lists are hardcoded here. Do not merge them.
- **`tl` never stages, commits, pushes, or deletes.** Those are the mutations that
  should keep prompting; the small verb surface is what makes one broad allow rule
  defensible.
- **`classifyLine` treats `=======`/`|||||||`/`>>>>>>>` as markers only inside a
  hunk.** Outside one, `=======` is ordinary content — a markdown underline. A
  resolver skipping this check corrupts docs.
- **`ExpectedFallowSchemaVersion` must track the pinned `fallow` version.** Bumping
  fallow without checking the field names in `lib/fallowReport.ts` prints a warning
  rather than wrong numbers.

## Host project coupling

The tool is not yet configuration-driven. Dropping `Tools/tl/` into another repo
requires editing these, and nothing else:

| What | Where | Why it is project-specific |
|------|-------|----------------------------|
| Root gate table | `lib/gatePlan.ts` — `RootGates` | Hardcodes the repo-root npm script names (`lint`, `test:jest`). Sub-packages need no edit: `--project=<dir>` discovers them |
| Default diff base | `lib/constants.ts` — `DefaultDiffBase` | `origin/develop`; a trunk-based repo wants `origin/main` |
| Quality-tool pin | `lib/constants.ts` — `ExpectedFallowSchemaVersion` | Must track the host's pinned `fallow` version. A repo without `fallow` should drop `verbs/fallow.ts` and its entry in the verb table |
| Entry point | nothing — see [Installing](#installing) | The shims vendor their own `tsx`; a host `"tl"` script is optional sugar |
| Type checking | host `tsconfig.jest.json` `include` | The root tsconfig typically covers only app sources, so these files are type-checked by the Jest config alone |
| Test discovery | host `jest.config.cjs` `testMatch` | Determines whether `__tests__/` is the required location |
| Agent skill | host `.claude/skills/tl/SKILL.md` | Claude Code discovers skills only there, so the skill file cannot live in this directory. Copy it into the consuming repo |
| Allow rules | host `.claude/settings.local.json` | Gitignored, so every clone needs its own copy — see [Allowing `tl` in Claude Code](#allowing-tl-in-claude-code) |

Nothing under `lib/` other than `constants.ts` contains a project-specific value.

## Installing

Copy `Tools/tl/` into the repo, then, once, inside that directory:

```bash
npm install
```

That resolves this directory's own `package.json` — a private one, vendored alongside
the source — and leaves the host's `package.json` untouched. `tsx` is the only
dependency; `Tools/tl/node_modules/` is gitignored, so a fresh clone repeats the one
command rather than carrying 12 MB.

The install is what makes the folder self-contained. `node --import tsx` resolves the
bare `tsx` specifier from the **current working directory**, not from the script, so
the shims cannot use that spelling in a host that has no `tsx` of its own — that is the
`ERR_MODULE_NOT_FOUND` a drop-in copy hits on its first call. `tl` and `tl.cmd` instead
run the vendored `node_modules/tsx/dist/cli.mjs` by a path derived from the script's own
location, and fall back to `--import tsx` only when that file is absent, so a host that
already depends on `tsx` can skip the install entirely.

A host that wants the `npm run tl` spelling adds the script itself:

```json
{ "scripts": { "tl": "Tools/tl/tl" } }
```

Both spellings accept a leading `--` (`npm run` eats it, the shims discard it), so
`npm run tl -- status` and `./Tools/tl/tl -- status` mean the same thing as
`./Tools/tl/tl status`.

## Allowing `tl` in Claude Code

Without these rules the whole point is lost: every `tl` call prompts, and an agent that
gets prompted falls back to hand-writing the shell line `tl` exists to replace. This is
the one piece of setup that is not optional.

### Where the rules go — `settings.local.json`, not `settings.json`

**Put them in `.claude/settings.local.json`.** Verified the hard way: an identical
`permissions.allow` block in the committed `.claude/settings.json` did **not** stop the
prompts; moving the same block to `settings.local.json` did.

| File | Scope | Verdict |
|------|-------|---------|
| `.claude/settings.local.json` | project, gitignored | **Use this.** The one that works |
| `~/.claude/settings.json` | every project on the machine | Works; reach for it when `tl` is on your `PATH` globally |
| `.claude/settings.json` | project, committed | Does not reliably apply — see below |

Settings merge user → project → local, so a machine-wide `~/.claude/settings.json` and a
per-repo `settings.local.json` compose; the local file does not have to repeat what the
user file already allows.

The cost is that `settings.local.json` is gitignored, so the rules do not travel with the
repo. A teammate cloning it gets `Tools/tl/` and the skill but no allow rules, and `tl`
prompts on every call until they create their own. There is no way around it — treat
"create `.claude/settings.local.json`" as a required step of [Installing](#installing)
and keep the block below copy-pasteable for exactly that reason.

### The rules

```json
{
  "permissions": {
    "allow": [
      "Bash(tl:*)",
      "Bash(./Tools/tl/tl:*)",
      "Bash(Tools/tl/tl:*)",
      "Bash(npm run tl:*)",
      "Bash(node --import tsx Tools/tl/index.ts:*)",
      "PowerShell(tl:*)",
      "PowerShell(./Tools/tl/tl.cmd:*)",
      "PowerShell(Tools/tl/tl.cmd:*)",
      "PowerShell(npm run tl:*)",
      "PowerShell(node --import tsx Tools/tl/index.ts:*)"
    ]
  }
}
```

**One rule per invocation spelling, per shell.** A permission rule matches the literal
command prefix, so `Bash(tl:*)` does *not* cover `./Tools/tl/tl` and a `Bash(...)` rule
does not cover a `PowerShell(...)` call. Each row above is a spelling an agent actually
emits: the `PATH` shim, the repo-relative shim with and without `./`, the npm script,
and the raw `tsx` entry point. Drop the rows for spellings your repo cannot produce —
`npm run tl:*` is dead weight without the `"tl"` script in `package.json`.

The `:*` suffix is the argument wildcard: `Bash(tl:*)` allows `tl` plus any arguments.
`Bash(tl)` alone would allow only the bare word.

### Why one broad rule is defensible here

A blanket `tl:*` pre-approves every verb, so the safety argument has to live in the tool
rather than in the prompt. It does: `tl` never stages, commits, pushes or deletes; the
only write path is `conflicts --take`, which goes through `writeRepoFile` and its own
protected-path list (see [Invariants](#invariants)); and no verb accepts a program name,
script path or shell string. Adding a verb that broke any of those would turn this one
rule into an unrestricted shell — which is why "Adding a verb" in the skill file forbids
it.

### Adding them without editing JSON

Two alternatives to hand-editing the file:

- Run `tl` once and pick **"Yes, and don't ask again for tl commands"** at the prompt.
  Claude Code writes the rule to `.claude/settings.local.json` itself. You get one rule
  for the spelling you happened to use, so repeat for the others or edit afterwards.
- Ask Claude directly — *"add allow permissions for all tl usage to
  `.claude/settings.local.json`"*. Name the file: asked for "project settings" it will
  reasonably write `settings.json`, which is the case that does not work. The bundled
  `update-config` skill merges into `permissions.allow` rather than replacing it.

Review what is allowed at any time with the `/permissions` command in an interactive
`claude` session.

### Still prompting?

In order of how often it is the answer:

1. **The rules are in `settings.json`.** Move them to `settings.local.json`.
2. **The file was created during the running session.** Claude Code watches `.claude/` for
   changes only in directories that already held a settings file at startup. A file that
   did not exist when the session began is not picked up — restart, or open `/permissions`
   to force a reload.
3. **The spelling is not in the list.** `Bash(tl:*)` does not cover `./Tools/tl/tl`, and no
   `Bash(...)` rule covers a `PowerShell(...)` call. Compare the prompted command against
   the ten rules above.
4. **Some *other* part of the line is not allowed.** A compound line passes only if every
   part does, so `tl status && node -e "..."` prompts even though the `tl` half is fine.
   The un-allowed part is the one to look at — not the `&&`. A bare `cd <repo> &&` prefix
   is harmless, though also pointless: Claude Code already runs in the project directory.
5. **The JSON is malformed** — which silently disables *every* setting in the file, not
   just the bad key:

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.local.json','utf8'))"
```

## Debug playbook

1. `npm run tl -- where` — repo root, tmp dir, write-toggle state. Confirms the
   toggle before blaming the guard.
2. Write refused? The message names the cause: `writes are disabled`,
   `outside the repository`, or `protected path (<segment>)`.
3. Bad `--take` result? The pre-image path is printed on every write; restore from
   it, or `git checkout -m -- <file>` to regenerate the conflict.
4. Wrong fallow numbers? Check for the `schema_version` warning first, then re-read
   the raw JSON keys — `lib/fallowReport.ts` declares every field it reads.
5. Type error only visible under Jest? Expected — see the type-checking row above.
   Running `npx tsc --noEmit -p tsconfig.jest.json` directly is **not** a substitute:
   that config sets `types: ["jest"]`, so it reports hundreds of phantom "Cannot find
   name 'process'" errors. Run the Jest suite instead.
6. `unknown flag --x` on something that looks valid? The key must be listed in
   `KnownFlags`/`KnownOptions` in `lib/constants.ts`. Adding a verb option means adding
   it there too.
7. A `tl each` mode silently ignored? Modes never reuse a shaping key. The per-file
   line count is `--first=N`; `--head=N` is the global output shaper and always wins.
8. A regex option matching nothing in a file that clearly contains the text? Suspect
   `$` against CRLF — see the `splitLines` invariant.

Focused tests:

```bash
npx jest --config jest.config.cjs Tools/tl
```
