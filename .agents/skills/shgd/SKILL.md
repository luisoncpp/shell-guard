---
name: shgd
description: Use when you need to search, inspect git state or files, rename an identifier or substitute text across many files, run the project's quality gates, get a fallow quality report, branch churn numbers, resolve merge conflicts, or run several repo commands in one round-trip. Read this BEFORE composing any shell line containing a for-loop, command substitution, `awk`, `sed -i`, or inline `node -e`/`python -c` against this repo — no allow rule can name those shapes, so they prompt every time, and `shgd` has a verb that replaces the job.
argument-hint: "verb (batch | grep | each | read | section | replace | status | diff | history | show | ignored | check | fallow | diffstat | conflicts)"
---

# shgd — repo work without the shell pipeline

## The one thing to know

**The program you cannot allowlist is what costs you a prompt — not the separator.**
Claude Code splits a compound line and allows it when *every* part matches a rule. So
`git diff ; git log` passes, and so does a `cd <repo>` prefix. One un-allowed part gates
the whole line: `shgd status` joined to `node -e "..."` still prompts.

A `;` on its own is therefore **not** a reason to reach for `shgd batch`. These are:

- The line would contain a **for-loop, command substitution, `awk`, `sed -i`, or inline
  `node -e`/`python -c`**. No allow rule can name those shapes, so they prompt every
  time. Use the verb that replaces the job — `each`, `section`, `grep`, `replace`,
  `fallow`, `diffstat`, `conflicts`.
- You would **pipe into a program that is not itself allowed**. Use the shaping options
  below instead of `| head`, `| tail`, `| cut`.
- You would otherwise make **N separate terminal calls**. One `shgd batch` is one
  round-trip, with each step labelled and shaped independently.

## Invocation

```bash
./Tools/shgd/shgd -- <verb> [args]
```

No verb needs its own allow rule. `.claude/settings.local.json` allows both spellings
up front — `Bash(shgd:*)` and `Bash(./Tools/shgd/shgd:*)`, plus their `PowerShell(...)`
twins — and the rules cover any arguments after them.

If a `shgd` call prompts anyway, the cause is one of: the rules are missing from
`.claude/settings.local.json`, or some *other* part of the line is un-allowed. It is
not the separator. See "Allowing `shgd` in Claude Code" in `Tools/shgd/README.md`.

## Batching — `shgd batch`

Reach for it to save round-trips, not permissions: three steps in one tool call instead
of three, each labelled and shaped on its own.

```bash
./Tools/shgd/shgd -- batch "status" "diff origin/develop --name-status -- src/" "grep useDrag src/"
```

Each quoted step is `<verb> [args]`, re-parsed and dispatched through shgd's own verb
table. Steps run in order, each under a `=== step N/M: ... (exit C) ===` header. Exit
code is the first non-zero; `--stop-on-fail` halts instead of continuing.

- Quote an argument containing spaces *inside* the step:
  `"section docs/GUIDELINES.md '^# Deep Modules' '^## Avoid'"`
- **No data flows between steps.** They are independent; there is no substitution
  syntax and there will not be one. If you need to loop over files, use `shgd each` —
  the loop lives inside that verb.
- A step may not write (`--take` is refused), may not nest, and the cap is 10 steps.
- Slow gates (`check`, `fallow`) are allowed as steps, but the whole call then blocks
  for their full duration and emits nothing until it finishes.

## Output shaping — replaces the pipe

Any verb accepts `--head=N`, `--tail=N`, `--grep=<regex>`, `--max-cols=N`, applied in
that order (filter → truncate → head → tail). Use these instead of
`| head`, `| tail`, `| Select-Object -Last N`, `| cut -c1-N` — a pipe is fine in itself,
but only if the program on the right is allowed too, and these need no second program.

Options take values **only** as `--key=value`. A bare `--` separates pathspecs.
There are no short options: a single-dash token like `-n` is rejected, never taken as
a positional.
An unrecognised flag or option is an **error**, not a no-op — so a typo tells you
rather than silently running something else.

## The verbs

### Search and files
- `shgd grep <pattern> [pathspec...]` — `git grep`; `--untracked` `--files-only` `--count`.
  Tracked files only by default, so a brand-new untracked file needs `--untracked`.
  No matches is exit 0, not exit 1, so a batch does not halt on an empty search.
- `shgd each <pathspec...> --<mode>` — one mode per call: `--cat`, `--first=N`,
  `--first-line`, `--count-lines`, `--count=<regex>`. `--first-line` over a glob is the
  `@Architecture`-header sweep. Note `--first=N`, not `--head=N`: `--head` shapes output.
- `shgd read <file> [--redact]` — `--redact` masks connection-string passwords, bearer
  tokens, PEM key bodies and secret-looking assignment values (bare or JSON-quoted).
  Use it for anything `.env`-shaped.
- `shgd section <file> <startRegex> <endRegex> [--redact]` — replaces
  `sed -n '/a/,/b/p'`, inclusive of both boundary lines.

### Git state
- `shgd status` — branch, porcelain changes, untracked, conflicted, in one call.
- `shgd diff [<a>] [<b>] [-- paths...]` — `--name-status` `--stat` `--patch` `--numstat`
  `--cached`. Refs pass through verbatim, so `stash@{0}^ HEAD` and `a...b` both work.
  No ref given compares the working tree to `HEAD`.
- `shgd history --file=<path>` — last commit plus working-tree state for one file.
- `shgd history --commits[=<base>]` — per-commit changed files over `base..HEAD`.
- `shgd history --find=<pathspec>` — every commit touching a path, across all refs.
  This is how you find a file that no longer exists.
- `shgd show <ref>:<path>` — a file's contents at a revision.
- `shgd ignored <path> [path...]` — `git check-ignore`: is the path gitignored, and
  which file, line and pattern decided it. Grepping `.gitignore` does **not** answer
  this — the rule can live in a nested `.gitignore`, `.git/info/exclude` or the global
  `core.excludesFile`, and a later negation can overturn an earlier match. Every queried
  path gets an explicit verdict, and nothing ignored is exit 0, not exit 1.
  A **tracked** path always comes back "not ignored"; `--no-index` names the rule that
  would have matched, which is how you debug a file `git add` picked up unexpectedly.

### Gates and quality
- `shgd check [--quick]` — runs quality gates from `.shgd.json` when present, else the
  default Node table (`tsc`, `lint`, `jest`). Per-gate PASS/FAIL and the failing tail.
  Run `shgd check --list` first to see gate names; `--only=<gate>` picks one.
  `--test=<path>` targets the gate with `role: test` (repo-relative selector).
  `--project=<dir>` is a **directory** inside the repo: that folder's `.shgd.json` wins,
  else gates are derived from its `tsconfig.json` / `package.json` scripts. Never pass a
  program name to `shgd` — configure tools in `.shgd.json` instead.
- `shgd fallow [audit [base] | dupes]` — optional, Node-specific: the introduced-vs-inherited report.
  `--section=complexity` (default) `|dead-exports|all`. `dupes --baseline=<file>`
  prints only clone groups absent from a saved snapshot — never hand-diff fingerprints
  in `node -e`. The verb pins `schema_version` (currently **7**) and warns loudly if
  fallow's shape changes, which a hand-written parser cannot do. `fallow` must already
  be a dependency of the repo — the verb refuses rather than let `npx` download and
  run it — and `<base>` must be a plain ref name, since it reaches a shell.
  Caveat: the finding **count** is not a quality signal. A CRAP-style score punishes
  extraction — splitting one IO verb into a pure rule plus a thin wrapper can raise the
  count while improving the code. Do not drive it to zero.
- `shgd diffstat [base]` — churn for `base...HEAD` plus non-comment, non-`__tests__`
  source-line counts. Empty usually means `HEAD` equals the base, not an unfetched base.

### Editing
- `shgd replace <from> <to> [<from> <to> ...] -- <pathspec...>` — this is `sed -i`, and
  it is the reason you should not reach for `sed -i`. Rules are **positional pairs**,
  applied in order, **within a line**, and **literally** unless you say otherwise —
  so `a.b(c)` matches that text, not a regex. Pathspecs come after the `--`, and a
  call without one is a usage error rather than a guess.
  `--word` matches whole words only: this is the identifier-rename mode, and it is
  what keeps `activeItems` → `liveItems` from mangling `activeItemsCount`.
  `--regex` treats `<from>` as a regex with `$1` available in `<to>`.
  **Preview is the default.** You get per-file before/after lines and a per-rule match
  count; nothing is written until you re-run the same command with `--take`. Read the
  preview — a rename that hits a file you did not expect is the signal to narrow the
  pathspec, not to add a rule.

One `shgd replace` covers a whole `sed` script's worth of substitutions, so do not chain
them. The five-expression `sed` line that motivated this verb — backtick-wrapped forms
first, then bare, then `\b`-anchored — was three redundant rules: `--word` already
covers every wrapping, because a backtick is not a word character.

### Conflicts
- `shgd conflicts` — list conflicted files with hunk counts
- `shgd conflicts --show [file]` — print the hunks
- `shgd conflicts --audit` — during a merge, the staged files differing from **both**
  parents: the ones somebody actually decided rather than took wholesale
- `shgd conflicts --take <file> <spec>` — resolve; spec is `ours`, `theirs`, or per-hunk
  `1=theirs,2=ours,3=theirs`

A per-hunk spec **must name every hunk**; a partial spec is refused rather than
defaulted, because a silent default is how hand-rolled `awk` resolvers went wrong.
Base sections from `diff3`/`zdiff3` conflict style are always dropped — the other way
those `awk` scripts corrupted files. `--take` never stages.

## Writes

Only `--take` writes — on `conflicts` and on `replace`, the same flag both times, so a
verb without it is inspection. A step carrying `--take` is refused inside `batch`,
which is exactly why `shgd replace` previews by default: the preview composes, the
rewrite stands alone. Writes are **enabled by default**; the rationale is the same as
`acceptEdits` mode — git holds the pre-change content, so a bad rewrite is recoverable
(`git checkout -m -- <file>` even regenerates conflict markers).

Because that rationale does *not* cover untracked files or uncommitted modifications,
every write first copies the current file to
`SHGD_TMP/backups/<timestamp>/<repo-relative-path>` and prints that path.

Disable with `--no-write` or `SHGD_WRITE=0`. Writes are refused outside the repo and
under `.git`, `.github`, `.claude`, `.vscode`, `.idea`, `.husky`, `.cargo`,
`.devcontainer`, `.yarn`, `.mvn`, `node_modules`, and for files like `.gitconfig` /
`.npmrc` / `.mcp.json` / `package.json` / `.shgd.json` and the lockfiles — the manifests are
protected because `shgd check` runs whatever they declare, so rewriting one would make
the next `shgd check` arbitrary execution. `shgd` never stages, commits, pushes, or deletes.

"Outside the repo" is decided on the **resolved** path, so a symlink or a Windows
junction pointing out of the tree is refused for reads as well as writes — including
one a pathspec sweep found, since `git ls-files` walks into it.

Run `shgd where` to see the repo root, tmp dir, and current write state.

## Adding a verb

Keep the surface small and auditable — a broad `Bash(shgd:*)` allow rule means every
verb is pre-approved. A new verb must not push, delete, stage, or run caller-supplied
code. **Never add a verb that takes a program name, script path or shell string as an
argument**; that converts one allow rule into an unrestricted shell.

- Route any file write through `writeRepoFile` in `Tools/shgd/lib/writeGuard.ts`, and
  any read of a caller-named path through `readRepoText` in `lib/repoFile.ts`. A bare
  `readFileSync` re-opens the read-outside-the-repo hole; a bare `writeFileSync`
  silently defeats the write guard.
- Validate any caller-supplied git ref or pathspec with `assertSafeGitArgument` in
  `lib/gitArgs.ts` — `runGit` is shell-free, but `git diff --output=<file>` still writes.
- Anything caller-supplied that reaches `runTool` needs an allowlist grammar first —
  `runTool` uses a shell on Windows and Node quotes nothing there. See
  `assertWorkspaceName`/`assertTestPath` in `lib/gatePlan.ts` and `assertShellSafeRef`
  in `lib/gitArgs.ts`. `runTool` re-checks every argument against
  `assertShellSafeArguments`, so a forgotten grammar is a refusal rather than a shell
  — do not weaken that backstop to make an argument fit.
- Return a `VerbResult` (`{lines, code}`); never `console.log`. Printing belongs to
  `index.ts`, and a printing verb is invisible to shaping and to `batch`.
- Register any new `--flag`/`--key=` in `KnownFlags`/`KnownOptions` (`lib/constants.ts`)
  or it will be rejected as unknown.
- **Put the rule in a pure module under `lib/`, not in the verb.** Verbs are IO
  wrappers; a rule living in one cannot be unit-tested in-process, which costs both
  testability and a fallow finding.
- Tests go in `Tools/shgd/__tests__/`. A `lib/*.test.ts` would **never run** —
  `jest.config.cjs` matches only `**/__tests__/**/*.test.ts`.

See `Tools/shgd/README.md` — the tool's documentation lives with the tool, not under
`docs/`, so `Tools/shgd/` can be copied into another repo intact. This skill file is the
one piece that cannot: Claude Code discovers skills only under `.claude/skills/`.
