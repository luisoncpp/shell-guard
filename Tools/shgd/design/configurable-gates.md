# Configurable quality gates

Status: **implemented**. Behaviour matches this plan.

## Why

`shgd check` today is a compile-time table of `npx tsc`, `npm run lint`, and
`npm run test:jest`. `--project=<dir>` only *selects* that table: it names a
directory, discovers `tsconfig.json` / `package.json` scripts, and never
supplies a command. That is load-bearing. Under a blanket `Bash(shgd:*)` allow
rule, a verb that took a program name or a shell string would be an
unrestricted shell.

The README already records the cost: [Host project coupling](../README.md#host-project-coupling)
says the tool is **not yet configuration-driven**, and the first row of that
table is the root gate list in `lib/gatePlan.ts`. Dropping `Tools/shgd/` into
an Unreal project therefore means editing TypeScript, and `--project` on a
directory with no `package.json` is a hard error (`no tsconfig.json and no
lint/test script`).

This project wants the opposite: keep the current Node toolchain as the
**default**, and let a per-project file replace it with `clang-tidy`, `lizard`,
Unreal automation, and other quality gates.

## Non-goals

- A new verb that takes a program, script path, or shell string on the CLI
  (`shgd exec`, `shgd check --cmd=...`). Forbidden by the skill and by the
  "Adding a verb" rules.
- Parsing lizard or clang-tidy output into `fallowReport`. Different tools,
  different shapes; pass/fail plus the failing tail is enough for `check`.
- Teaching `shgd` to find an Epic Games install, expand globs, or generate
  `compile_commands.json`. Wrappers and UBT stay in the host repo.
- YAML, TOML, or comments-in-JSON. The tool already parses JSON
  (`package.json`, fallow). One schema, no extra parser.
- Making `shgd fallow` generic. Fallow stays the Node complexity reporter.
  An Unreal tree simply does not run it; lizard (or anything else) is a
  `check` gate.

## Invariants that must still hold

These are the existing rules the feature has to live inside, not a wishlist.

1. **The CLI never names a program.** `--project` is a directory, `--only` is a
   gate *name*, `--test` is a selector. Same as today.
2. **Config is argv, never a shell line.** A JSON string array is spawned as
   argv. Spaces, `;`, `=`, and `*` are data in one argument. They are not
   command separators, because there is no shell for custom tools.
3. **The config file is a write→execute manifest**, in the same class as
   `package.json`. `shgd replace --take` must refuse it. Humans and the editor
   permission layer can still change it; `shgd` itself cannot.
4. **PATH programs are resolved to an absolute path; cwd is never searched.**
   Same `resolveExecutable` rule that exists so a hostile `git.exe` /
   `clang-tidy.exe` in the repo root cannot win on Windows.
5. **Repo-relative wrappers stay inside the repo** (resolved path, no
   symlink-out). They are ordinary source: rewriting them then running `check`
   is the same inherent chain the README already admits for tests.
6. **`npm` / `npx` keep today's spawn path** (shell on Windows, every argument
   through `assertShellSafeArguments`). Do not merge that with the no-shell
   path.
7. **Rules live in a pure `lib/` module.** Parsing, admission, and gate-table
   construction are unit-tested in-process. `verbs/check.ts` only answers
   filesystem questions and spawns.

## Shape

One file per project directory: **`.shgd.json`**.

Discovery for `shgd check [--project=<dir>]`:

```
--project omitted or "root"
    repoRoot/.shgd.json exists?  →  that file is the whole gate list
    else                         →  today's RootGates (npx tsc / npm lint / npm test:jest)

--project=<dir>
    <dir>/.shgd.json exists?     →  that file, cwd = <dir>
    else                         →  today's workspaceGates (tsconfig + package.json scripts)
                                    (still errors if the directory has neither)
```

No merging. One file wins. A monorepo with a web app and a game is two files:

```
/.shgd.json              # optional; omit to keep the Node default at repo root
/MyGame/.shgd.json       # Unreal gates; shgd check --project=MyGame
```

`--project` stays a **directory**, never a profile name. That keeps the
existing grammar (`assertWorkspaceName`) and matches how Unreal already
thinks of a `.uproject` folder.

## Schema (v1)

```json
{
  "schemaVersion": 1,
  "diffBase": "origin/main",
  "sourceExtensions": [".h", ".cpp", ".hpp", ".c", ".cs"],
  "gates": [
    {
      "name": "clang-tidy",
      "command": "clang-tidy",
      "args": ["-p", "compile_commands.json"],
      "inQuickRun": true
    },
    {
      "name": "lizard",
      "command": "lizard",
      "args": ["Source", "--CCN", "15", "--length", "100"],
      "inQuickRun": true
    },
    {
      "name": "automation",
      "command": "Tools/RunAutomationTests.sh",
      "args": [],
      "inQuickRun": false,
      "role": "test"
    }
  ]
}
```

| Field | Rule |
|---|---|
| `schemaVersion` | Required. Unknown version is a refusal, not a best-effort parse. Start at **1**. |
| `gates` | Required, non-empty. Order is run order. |
| `gates[].name` | Unique, `/^[A-Za-z][A-Za-z0-9_-]*$/`. This is what `--only=` matches. |
| `gates[].command` | Either a **PATH basename** (`clang-tidy`, `lizard`, `npm`, `npx`, `UnrealEditor-Cmd`) or a **repo-relative file** (`Tools/RunAutomationTests.sh`). No absolute paths. No `${UE_ROOT}` interpolation in v1. |
| `gates[].args` | Array of strings. Each element is one argv token. Empty array is allowed. |
| `gates[].inQuickRun` | Boolean. `--quick` keeps these, skips the rest. Quality tools default to `true` in examples; the test gate is `false`. |
| `gates[].role` | Optional. `"test"` marks the unique gate that receives `--test=`. At most one. |
| `diffBase` | Optional. Overrides `DefaultDiffBase` for `fallow` / `diffstat` / `history` when those verbs read config. Omit to keep `origin/develop`. |
| `sourceExtensions` | Optional. Overrides the list `diffstat` uses to count source lines. Unreal wants `.cpp` / `.h` / `.cs`; the compile-time default stays `.ts` / `.tsx` / `.rs`. |

Comments are not JSON. Put rationale next to the file (`Tools/README.md`, a
comment in the wrapper script), not inside it.

### Command admission

A **PATH basename** matches `/^[A-Za-z0-9._+-]+$/` (no slash, no backslash, no
leading dash). It is resolved with the existing `resolveExecutable` (absolute
PATH entry, relative PATH entries skipped).

A **repo-relative command** must pass `isRepoRelativePath`, exist as a file,
and resolve inside the repository after symlink follow-through. Spawn the
resolved absolute path with `shell: false`.

**Refused as `command`**, even if they are on PATH: `sh`, `bash`, `zsh`, `fish`,
`cmd`, `cmd.exe`, `command`, `powershell`, `pwsh`. Custom logic belongs in a
committed script, not in `bash -c`. Also refuse a first argument of `-c`, `-e`,
`--eval`, `-Command`, `-EncodedCommand`, `/c` so `node -e` / `python -c` /
`powershell -Command` cannot be smuggled through an otherwise-legal basename.

`npm` and `npx` are legal basenames and keep the existing `runTool` path.

### Argument admission

Depends on the spawn path, not on a single global regex.

- **`npm` / `npx`:** today's `assertShellSafeArguments`. Windows still uses a
  shell for `.cmd`, so spaces, `;`, `&`, `|`, quotes stay illegal.
- **Everything else:** `spawnSync(..., { shell: false })`. An argument may
  contain spaces and `;` because they are not interpreted. Still refuse NUL
  and raw newlines. No glob expansion: `Source/*.cpp` is passed literally;
  clang-tidy should be driven from `compile_commands.json`, lizard from
  directory paths, or a wrapper should enumerate files.

That split is what makes Unreal possible. This is one argv element, not a
shell line:

```json
"-ExecCmds=Automation RunTests Inventory.AddItem; Quit"
```

### `--test=`

Today `--test` must be a repo-relative **file** path and is appended to the
jest gate after `--`. Keep the same *grammar* (it already accepts dotted
names such as `Project.Suite.Case`, which is how Unreal automation tests are
addressed) and change only the *sink*:

- The unique gate with `"role": "test"` receives the extra arguments.
- Default insertion: append `--`, then the selector, matching npm/jest.
- If that gate is not `npm`/`npx`, append the selector as one extra argv
  token (no `--` unless the config asks for it later). A wrapper script is
  the Unreal-friendly way to turn that token into `-ExecCmds=...`.

No format-string interpolation of `--test` into the middle of an existing
arg in v1. Interpolation is how `;` and spaces re-enter a string that was
supposed to be opaque. A wrapper that takes the selector as `$1` is the
escape hatch.

### `--only=` and `--quick`

`--only=` must equal a configured gate `name`. The current hard-coded
`tsc|lint|jest` set is an artefact of `RootGates`. `--quick` is unchanged:
drop gates with `inQuickRun: false`.

### `--list`

New flag on `check`. Prints the resolved gate table (name, command, args,
quick, role) and exits 0 without spawning. Agents — and humans dropping this
into a new repo — can see what `check` will run without waiting on
clang-tidy. Implementation: the same pure planner `check` already needs;
`--list` is that planner's stdout.

## Default Node toolchain

No `.shgd.json` at repo root ⇒ **today's `RootGates`**. This repo does not
have to add a file to keep working. Sub-packages without a file keep
`workspaceGates`.

A Node repo that wants the default written down can commit the equivalent:

```json
{
  "schemaVersion": 1,
  "gates": [
    { "name": "tsc", "command": "npx", "args": ["tsc", "--noEmit"], "inQuickRun": true },
    { "name": "lint", "command": "npm", "args": ["run", "lint", "--silent"], "inQuickRun": true },
    { "name": "jest", "command": "npm", "args": ["run", "test:jest", "--silent"], "inQuickRun": false, "role": "test" }
  ]
}
```

That file, if present, *replaces* discovery: it will not look at
`package.json` to decide whether `lint` exists. Explicit over inferred.
Missing npm scripts then fail at run time with the same per-gate FAIL tail
as today.

## Unreal Engine

Unreal does not put `UnrealEditor-Cmd` on PATH, the invocation is
platform-specific, and `-ExecCmds` is a single argument that contains spaces
and `;`. v1 does **not** teach `shgd` about `UE_ROOT`. The host repo commits
a wrapper; `shgd` runs the wrapper.

Example `MyGame/.shgd.json`:

```json
{
  "schemaVersion": 1,
  "diffBase": "origin/main",
  "sourceExtensions": [".h", ".cpp", ".hpp", ".c", ".cs"],
  "gates": [
    {
      "name": "clang-tidy",
      "command": "clang-tidy",
      "args": ["-p", "compile_commands.json"],
      "inQuickRun": true
    },
    {
      "name": "lizard",
      "command": "lizard",
      "args": ["Source", "--CCN", "15", "--length", "100", "--exclude", "*/Intermediate/*"],
      "inQuickRun": true
    },
    {
      "name": "automation",
      "command": "Tools/RunAutomationTests.sh",
      "args": [],
      "inQuickRun": false,
      "role": "test"
    }
  ]
}
```

`Tools/RunAutomationTests.sh` (host repo, not `shgd`) is responsible for
engine location, `.uproject` path, `-unattended -nopause -NullRHI`, and for
turning an optional extra argv token into a filter:

```sh
# sketch — lives in the Unreal tree, not in Tools/shgd
filter=${1:-Now}
"$UE_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd" \
  MyGame.uproject -unattended -nopause -NullRHI \
  -ExecCmds="Automation RunTests ${filter}; Quit"
```

Windows: the same idea as a `.exe` the wrapper locates, or a small `node`
launcher that `spawnSync`s `UnrealEditor-Cmd.exe` with `shell: false`. Do
not use `.cmd` as the `command` in v1 — Node needs a shell to spawn `.cmd`,
which reintroduces the grammar that Unreal's arguments fail.

`clang-tidy` is expected to read a compilation database. Generating it
(`UnrealBuildTool -mode=GenerateClangDatabase`, or whatever the project
already uses) is a separate gate or a step inside the wrapper, not a
built-in.

`lizard` is a check gate: non-zero exit is FAIL plus tail. It does not go
through `shgd fallow`. Agents in an Unreal tree run `shgd check` /
`shgd check --quick` / `shgd check --only=lizard`. They do not run
`shgd fallow` unless the skill for *that* repo says so.

`--project=MyGame` is what an agent types. `--only=clang-tidy` and
`--test=MyGame.Inventory.AddItem` fall out of the schema above.

## Spawn model

```
Gate.command
    npm | npx  →  existing runTool (PATH-resolve, Windows shell, shell-safe args)
    PATH name  →  resolveExecutable, spawn shell:false, cwd = project directory
    repo file  →  resolveInsideRepo, spawn that absolute path, shell:false,
                  cwd = project directory
```

`cwd` is the project directory (`repo root` or `--project=<dir>`), always
inside the repo. Today `runTool` inherits process cwd and uses
`npm --prefix` for workspaces. Custom tools need a real cwd; set it
explicitly on both paths once config exists.

`Gate` in `lib/gatePlan.ts` today is `{ name, command: 'npm'|'npx', args,
inQuickRun }`. Widen `command` to `string` *after* admission, or introduce a
discriminated spawn kind (`npm` | `path` | `repo`) so `check.ts` cannot call
`runTool('clang-tidy', ...)` by accident. Prefer the discriminant: it makes
the Windows-shell special case obvious.

## Write protection

Add `.shgd.json` to `ProtectedFiles` in `lib/writeGuard.ts`, basename-matched
at any depth (same as `package.json`). A nested `MyGame/.shgd.json` is
protected for the same write→execute reason.

Do not put the file under `.claude/`. Quality gates are host-repo policy,
shared by every agent skill, not Claude-Code-only settings.

## Does the host need a `package.json`?

**No, except for `check` when there is no `.shgd.json`, and except for `fallow`.**
The rest of the verb surface is git. This repo is already a proof: the only
`package.json` in the tree is `Tools/shgd/package.json` (the tool's own `tsx`
install). There is no host manifest at the repo root.

| What | Reads host `package.json`? | Needs a Node/npm host? |
|---|---|---|
| `check` with no `.shgd.json` | **Yes**, for `--project=<dir>` script discovery. Root gates spawn `npx`/`npm` without opening the file, but those commands fail in a tree that has no npm scripts. | Yes, that is the default toolchain |
| `check` with `.shgd.json` | **No.** The file replaces discovery. A tree of only `.cpp` / `.h` is enough. | Only if a gate *names* `npm`/`npx` |
| `fallow` | **No**, but it looks for `node_modules/.bin/fallow` (and `node_modules/fallow/package.json`) then runs `npx fallow`. Missing install is a refusal, not a download. | Yes. Unreal does not call this verb |
| `writeGuard` | No. The basename `package.json` is protected *if present*, same as `.npmrc`. Absence is fine. | No |
| `status`, `diff`, `grep`, `history`, `each`, `replace`, `read`, `section`, `conflicts`, `ignored`, `where`, `batch` | No | No. `git` plus the shims |
| `diffstat` | No | No git-wise. **Source-line counts** only credit `.ts` / `.tsx` / `.mts` / `.cts` / `.rs` and skip paths containing `__tests__`. An Unreal diff that is all `.cpp` prints churn by file but **0 source lines** until `sourceExtensions` is configurable |

`runTool` in `lib/run.ts` is typed `'npm' \| 'npx'` and is only called from
`check` and `fallow`. Every other verb uses `runGit`. That is the whole
host-npm surface.

**`Tools/shgd/package.json` is not the host's.** The shims run `index.ts`
through a vendored `tsx` next to the tool. Dropping `Tools/shgd/` into an
Unreal repo still needs **Node on PATH** and one `npm install` *inside that
folder* so `tsx` exists. It does not need a root `package.json`, a
`node_modules` at repo root, or npm scripts. That install is documented
under [Installing](../README.md#installing) and is unchanged by this plan.

The leftover Node-shaped knobs that are *not* `package.json` — and that an
Unreal drop-in still feels — are `DefaultDiffBase` (`origin/develop`),
`SourceExtensions` / `__tests__` in `diffstat`, and the `fallow` verb
sitting in the table. The first two move into `.shgd.json` in phase 4. The
third stays and refuses cleanly; the host skill simply does not mention it.

## `fallow`, `diffstat`, skill text

| Verb | With config | Without config |
|---|---|---|
| `check` | Runs `.shgd.json` gates | `RootGates` / `workspaceGates` |
| `fallow` | Unchanged. Still requires a local fallow install. A repo that does not use fallow leaves the verb in place; it already refuses instead of downloading. | Same |
| `diffstat` | Uses `sourceExtensions` from the **root** `.shgd.json` if present | Compile-time `SourceExtensions` |
| `history` / `fallow` base | Uses `diffBase` from the root file if present | `DefaultDiffBase` |

The skill (`.claude/skills/shgd/SKILL.md`) currently hard-codes `tsc`,
`lint`, `jest`, and fallow. After this ships it should say: run `shgd check`;
use `shgd check --list` to see the gates; `--only=` takes a name from that
list; `fallow` is optional and Node-specific. The Unreal host copies the
skill and can delete the fallow paragraph. The skill still must not name
`clang-tidy` as a *CLI* argument to `shgd`.

## Module split

| Piece | Where | Pure? |
|---|---|---|
| JSON → admitted config (schema version, names, command grammar, unique `role: test`, unique gate names) | `lib/checkConfig.ts` (new) | Yes |
| Default `RootGates` / `workspaceGates` | `lib/gatePlan.ts` (keep) | Yes |
| `selectGates` using either source | `lib/gatePlan.ts` or `checkConfig.ts` | Yes |
| Read `.shgd.json` via `readRepoText`, facts about existence | `verbs/check.ts` | IO |
| `runPathTool` / `runRepoTool` (`shell: false`, cwd) | `lib/run.ts` | IO |
| Protect `.shgd.json` | `lib/writeGuard.ts` | already tested via `findProtectedSegment` |
| `--list`, `--only` any name, `--test` to `role: test` | `verbs/check.ts` + planner | mixed |

Tests go in `Tools/shgd/__tests__/checkConfig.test.ts` (and extensions of
`gatePlan.test.ts`, `writeGuard.test.ts`, `shgd.test.ts`). A `lib/*.test.ts`
would never run.

## Phases

Ship in this order so each step is useful on its own and does not weaken
admission to make an argument fit.

1. **Parser + protection.** `lib/checkConfig.ts`, tests for every refusal in
   the tables above, `.shgd.json` on the protected-file list. No spawn
   changes yet.
2. **`check` reads the file.** Discovery algorithm, `--only=` by configured
   name, `--list`. Custom commands still not spawned: a non-npm command in
   the file is a clear error pointing at phase 3. Node default unchanged.
3. **No-shell spawn.** `runPathTool` / `runRepoTool`, cwd = project dir,
   interpreter denylist, `--test` forwarded to `role: test`. This is the
   Unreal-enabling step.
4. **Host-coupling extras.** `diffBase` and `sourceExtensions` from the root
   file. Optional. Does not block Unreal `check`.
5. **Docs.** README host-coupling table: root gate list moves from
   `gatePlan.ts` to `.shgd.json`. Skill: `check` runs whatever the project
   file declares; `--list` before `--only`. Copy-paste Unreal example from
   this document into the README. Usage text in `lib/usage.ts` stops saying
   `tsc|lint|jest` as the only `--only=` values.

Phase 3 is the one that must not ship without the parser tests from phase 1.
An unvalidated `command` reaching `spawnSync` is the old `--test=` bug with
a new name.

## What this does *not* change about safety

A committed `.shgd.json` that names `lizard` is arbitrary execution in the
same sense that a committed `package.json` `"lint"` script is. That is
accepted today and documented as the write→execute chain. The new file
joins that chain on purpose. What stays forbidden is turning **one
pre-approved CLI invocation** into a shell: no `shgd check --cmd`, no
`bash -c` as a gate command, no env-var rewriting of the executable path in
v1, no downloading a tool the way `npx <missing>` would.

## Open questions (resolved for v1 unless a later change-set reopens them)

- **Engine path / `${UE_ROOT}`:** wrapper script, not interpolation.
- **Globs:** not expanded; compilation database, directories, or a wrapper.
- **Windows `.cmd` wrappers other than npm/npx:** not in v1. Use a `.exe` on
  PATH, a shebang script, or `node Tools/run-tests.js`.
- **Named profiles in one root file:** no. One `.shgd.json` per directory,
  `--project` already selects the directory.
- **Disabling `fallow` from config:** no. Absence of fallow in the repo is
  already a refusal. Unreal agents are told by the host skill not to call it.
