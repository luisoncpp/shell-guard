# A CRAP gate rewards covered code, not fewer functions — and a subprocess test earns no coverage

`fallow audit` gates on the **CRAP score** (`--max-crap`, default 30), which is
cyclomatic complexity weighted by a coverage penalty — not on cyclomatic complexity
alone. Three consequences, in the order they bite. Any coverage-weighted complexity gate
behaves the same way.

## 1. Extracting helpers raises the finding *count* while lowering severity

Measured on this tool during implementation:

| | findings | worst function |
|---|---|---|
| before extraction | 9 | `resolveLines` cyclomatic 12 / cognitive 17, `critical` |
| after extraction | 10 | `resolveLines` cyclomatic 7 / cognitive 9, `high` |

Every extracted helper landing at cyclomatic ≥5 becomes its own finding, so the count
went **up** while the code got simpler — and a style rule that mandates extracting long
functions guarantees that direction. **Read the severity column, not the count.** A
cyclomatic-5 four-line dispatcher is a finding, not a problem.

## 2. A test that spawns a subprocess earns no coverage, by any config

Jest instruments modules passing through its own registry, so it only observes code
executed *inside the Jest process*. A test driving a CLI with
`execFileSync(process.execPath, …)` runs it in a separate OS process with its own
uninstrumented loader.

Measured: with `--collectCoverageFrom` pointed straight at the CLI's sources, all 9
files were listed and reported **0%**, with real uncovered line ranges — Jest parsed
them, it never saw them run.

Do not "fix" this by widening the host's `collectCoverageFrom` (which normally scopes to
application sources); that is a red herring, proven above. A telltale when reading such a
report: a file with no branches and no functions shows `% Branch 100 / % Funcs 100`
beside `0%` statements, because those denominators are zero. Vacuous 100s next to 0% mean
"never loaded", not "partially tested".

## 3. The fix is a pure/IO split, not more tests

Since the penalty is on *uncovered* complexity, the lever is making the complex parts
coverable — which means dependency-free. This tool was restructured so every rule
(conflict marker state machine, diff line accounting, audit JSON reduction) lives in
a pure module unit-tested in-process, and every module touching a process, git or the
filesystem is a thin wrapper.

| | introduced findings | shape |
|---|---|---|
| `.mjs`, subprocess tests only | 10 | rules interleaved with IO |
| `.ts`, pure rules tested in-process | **4** | all four survivors are IO verbs |

The pure modules dropped off the findings list entirely at ~100% coverage. Note the
conversion from `.mjs` to `.ts` was itself required: a CJS-transformed `.test.ts`
cannot `require` an ESM `.mjs` (`transform` matches only `.tsx?`), so in-process
testing was impossible until the tool became TypeScript run through `tsx`.

The residue is structural. An IO wrapper cannot be covered in-process without
injecting its dependencies, so a `.ts` CLI's IO layer will always contribute a few
findings. Budget for that instead of chasing zero.

See [`README.md`](../README.md) § Pure/IO split.
