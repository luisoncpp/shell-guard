\---

name: tl

description: Use when you need to search, inspect git state or files, run the project's quality gates, get a fallow quality report, branch churn numbers, resolve merge conflicts, or run several repo commands in one round-trip. Read this BEFORE composing any shell line containing a for-loop, command substitution, `awk`, `sed -i`, or inline `node -e`/`python -c` against this repo — no allow rule can name those shapes, so they prompt every time, and `tl` has a verb that replaces the job.

argument-hint: "verb (batch | grep | each | read | section | status | diff | history | show | check | fallow | diffstat | conflicts)"

\---



\# tl — repo work without the shell pipeline



\## The one thing to know



\*\*The program you cannot allowlist is what costs you a prompt — not the separator.\*\*

Claude Code splits a compound line and allows it when \*every\* part matches a rule. So

`git diff ; git log` passes, and so does a `cd <repo>` prefix. One un-allowed part gates

the whole line: `tl status` joined to `node -e "..."` still prompts.



A `;` on its own is therefore \*\*not\*\* a reason to reach for `tl batch`. These are:



\- The line would contain a \*\*for-loop, command substitution, `awk`, `sed -i`, or inline

&#x20; `node -e`/`python -c`\*\*. No allow rule can name those shapes, so they prompt every

&#x20; time. Use the verb that replaces the job — `each`, `section`, `grep`, `fallow`,

&#x20; `diffstat`, `conflicts`.

\- You would \*\*pipe into a program that is not itself allowed\*\*. Use the shaping options

&#x20; below instead of `| head`, `| tail`, `| cut`.

\- You would otherwise make \*\*N separate terminal calls\*\*. One `tl batch` is one

&#x20; round-trip, with each step labelled and shaped independently.



\## Invocation



```bash

./Tools/tl/tl -- <verb> \[args]

```



No verb needs its own allow rule. `.claude/settings.local.json` allows both spellings

up front — `Bash(tl:\*)` and `Bash(./Tools/tl/tl:\*)`, plus their `PowerShell(...)`

twins — and the rules cover any arguments after them.



If a `tl` call prompts anyway, the cause is one of: the rules are missing from

`.claude/settings.local.json`, or some \*other\* part of the line is un-allowed. It is

not the separator. See "Allowing `tl` in Claude Code" in `Tools/tl/README.md`.



\## Batching — `tl batch`



Reach for it to save round-trips, not permissions: three steps in one tool call instead

of three, each labelled and shaped on its own.



```bash

./Tools/tl/tl -- batch "status" "diff origin/develop --name-status -- src/" "grep useDrag src/"

```



Each quoted step is `<verb> \[args]`, re-parsed and dispatched through tl's own verb

table. Steps run in order, each under a `=== step N/M: ... (exit C) ===` header. Exit

code is the first non-zero; `--stop-on-fail` halts instead of continuing.



\- Quote an argument containing spaces \*inside\* the step:

&#x20; `"section docs/GUIDELINES.md '^# Deep Modules' '^## Avoid'"`

\- \*\*No data flows between steps.\*\* They are independent; there is no substitution

&#x20; syntax and there will not be one. If you need to loop over files, use `tl each` —

&#x20; the loop lives inside that verb.

\- A step may not write (`--take` is refused), may not nest, and the cap is 10 steps.

\- Slow gates (`check`, `fallow`) are allowed as steps, but the whole call then blocks

&#x20; for their full duration and emits nothing until it finishes.



\## Output shaping — replaces the pipe



Any verb accepts `--head=N`, `--tail=N`, `--grep=<regex>`, `--max-cols=N`, applied in

that order (filter → truncate → head → tail). Use these instead of

`| head`, `| tail`, `| Select-Object -Last N`, `| cut -c1-N` — a pipe is fine in itself,

but only if the program on the right is allowed too, and these need no second program.



Options take values \*\*only\*\* as `--key=value`. A bare `--` separates pathspecs.

There are no short options: a single-dash token like `-n` is rejected, never taken as

a positional.

An unrecognised flag or option is an \*\*error\*\*, not a no-op — so a typo tells you

rather than silently running something else.



\## The verbs



\### Search and files

\- `tl grep <pattern> \[pathspec...]` — `git grep`; `--untracked` `--files-only` `--count`.

&#x20; Tracked files only by default, so a brand-new untracked file needs `--untracked`.

&#x20; No matches is exit 0, not exit 1, so a batch does not halt on an empty search.

\- `tl each <pathspec...> --<mode>` — one mode per call: `--cat`, `--first=N`,

&#x20; `--first-line`, `--count-lines`, `--count=<regex>`. `--first-line` over a glob is the

&#x20; `@Architecture`-header sweep. Note `--first=N`, not `--head=N`: `--head` shapes output.

\- `tl read <file> \[--redact]` — `--redact` masks connection-string passwords and

&#x20; secret-looking assignment values. Use it for anything `.env`-shaped.

\- `tl section <file> <startRegex> <endRegex>` — replaces `sed -n '/a/,/b/p'`,

&#x20; inclusive of both boundary lines.



\### Git state

\- `tl status` — branch, porcelain changes, untracked, conflicted, in one call.

\- `tl diff \[<a>] \[<b>] \[-- paths...]` — `--name-status` `--stat` `--patch` `--numstat`

&#x20; `--cached`. Refs pass through verbatim, so `stash@{0}^ HEAD` and `a...b` both work.

&#x20; No ref given compares the working tree to `HEAD`.

\- `tl history --file=<path>` — last commit plus working-tree state for one file.

\- `tl history --commits\[=<base>]` — per-commit changed files over `base..HEAD`.

\- `tl history --find=<pathspec>` — every commit touching a path, across all refs.

&#x20; This is how you find a file that no longer exists.

\- `tl show <ref>:<path>` — a file's contents at a revision.



\### Gates and quality

\- `tl check \[--quick]` — `npx tsc --noEmit`, `npm run lint`, `npm run test:jest`, with

&#x20; per-gate PASS/FAIL and the failing tail. `--quick` skips jest.

&#x20; `--only=tsc|lint|jest` and `--test=<path>` give a focused run.

&#x20; `--project=<dir>` gates one workspace directory instead of the repo root: its gates

&#x20; are derived from what that directory has — `tsc` if it holds a `tsconfig.json`,

&#x20; `lint`/`jest` if its `package.json` declares a `lint` / `test:jest` \(or `test`\)

&#x20; script. It takes a \*\*directory\*\*, never a command, and the root `lint` may already

&#x20; cover a workspace's sources.

\- `tl fallow \[audit \[base] | dupes]` — the introduced-vs-inherited report.

&#x20; `--section=complexity` (default) `|dead-exports|all`. `dupes --baseline=<file>`

&#x20; prints only clone groups absent from a saved snapshot — never hand-diff fingerprints

&#x20; in `node -e`. The verb pins `schema\_version` (currently \*\*7\*\*) and warns loudly if

&#x20; fallow's shape changes, which a hand-written parser cannot do.

&#x20; Caveat: the finding \*\*count\*\* is not a quality signal. A CRAP-style score punishes

&#x20; extraction — splitting one IO verb into a pure rule plus a thin wrapper can raise the

&#x20; count while improving the code. Do not drive it to zero.

\- `tl diffstat \[base]` — churn for `base...HEAD` plus non-comment, non-`\_\_tests\_\_`

&#x20; source-line counts. Empty usually means `HEAD` equals the base, not an unfetched base.



\### Conflicts

\- `tl conflicts` — list conflicted files with hunk counts

\- `tl conflicts --show \[file]` — print the hunks

\- `tl conflicts --audit` — during a merge, the staged files differing from \*\*both\*\*

&#x20; parents: the ones somebody actually decided rather than took wholesale

\- `tl conflicts --take <file> <spec>` — resolve; spec is `ours`, `theirs`, or per-hunk

&#x20; `1=theirs,2=ours,3=theirs`



A per-hunk spec \*\*must name every hunk\*\*; a partial spec is refused rather than

defaulted, because a silent default is how hand-rolled `awk` resolvers went wrong.

Base sections from `diff3`/`zdiff3` conflict style are always dropped — the other way

those `awk` scripts corrupted files. `--take` never stages.



\## Writes



Only `--take` writes. Writes are \*\*enabled by default\*\*; the rationale is the same as

`acceptEdits` mode — git holds the pre-change content, so a bad rewrite is recoverable

(`git checkout -m -- <file>` even regenerates conflict markers).



Because that rationale does \*not\* cover untracked files or uncommitted modifications,

every write first copies the current file to

`TL\_TMP/backups/<timestamp>\_\_<flattened-path>` and prints that path.



Disable with `--no-write` or `TL\_WRITE=0`. Writes are refused outside the repo and

under `.git`, `.claude`, `.vscode`, `.idea`, `.husky`, `.cargo`, `.devcontainer`,

`.yarn`, `.mvn`, `node\_modules`, and for files like `.gitconfig` / `.npmrc` /

`.mcp.json`. `tl` never stages, commits, pushes, or deletes.



Run `tl where` to see the repo root, tmp dir, and current write state.



\## Adding a verb



Keep the surface small and auditable — a broad `Bash(tl:\*)` allow rule means every

verb is pre-approved. A new verb must not push, delete, stage, or run caller-supplied

code. \*\*Never add a verb that takes a program name, script path or shell string as an

argument\*\*; that converts one allow rule into an unrestricted shell.



\- Route any file write through `writeRepoFile` in `Tools/tl/lib/writeGuard.ts`.

\- Validate any caller-supplied git ref or pathspec with `assertSafeGitArgument` in

&#x20; `lib/gitArgs.ts` — `runGit` is shell-free, but `git diff --output=<file>` still writes.

\- Anything caller-supplied that reaches `runTool` needs an allowlist grammar first —

&#x20; `runTool` uses a shell on Windows. See `assertWorkspaceName` in `lib/gatePlan.ts`,

&#x20; which is why `--project` can accept a directory name at all.

\- Return a `VerbResult` (`{lines, code}`); never `console.log`. Printing belongs to

&#x20; `index.ts`, and a printing verb is invisible to shaping and to `batch`.

\- Register any new `--flag`/`--key=` in `KnownFlags`/`KnownOptions` (`lib/constants.ts`)

&#x20; or it will be rejected as unknown.

\- \*\*Put the rule in a pure module under `lib/`, not in the verb.\*\* Verbs are IO

&#x20; wrappers; a rule living in one cannot be unit-tested in-process, which costs both

&#x20; testability and a fallow finding.

\- Tests go in `Tools/tl/\_\_tests\_\_/`. A `lib/\*.test.ts` would \*\*never run\*\* —

&#x20; `jest.config.cjs` matches only `\*\*/\_\_tests\_\_/\*\*/\*.test.ts`.



See `Tools/tl/README.md` — the tool's documentation lives with the tool, not under

`docs/`, so `Tools/tl/` can be copied into another repo intact. This skill file is the

one piece that cannot: Claude Code discovers skills only under `.claude/skills/`.



