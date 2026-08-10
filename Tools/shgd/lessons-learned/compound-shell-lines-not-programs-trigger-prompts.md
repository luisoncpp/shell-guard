# The separator triggers the permission prompt, not the program

> **Partly superseded.** The measurement below held when Claude Code could not statically
> parse *any* compound line. It now splits a compound line and allows it when **every**
> part matches a rule, so a `;`-joined sequence of individually-allowed commands no longer
> prompts. See [README § why `shgd` exists](../README.md) for the current measurement.
> What survives unchanged: the un-allowlistable *program* (a `for` loop, `sed -i`, an
> inline `node -e`) is what prompts, and the two design consequences below.

Measured over 59 real commands taken from session transcripts and checked against
`.claude/settings.local.json`:

| Cause of the prompt | Blocks |
|---|---|
| `;` / `&&` joining commands that would each be allowed alone | ~30 |
| A program with no allow rule | few |
| A `for` loop or an inline `node -e` / `python -c` | the remainder |

The commonly used read-only programs were **already allowed**. The intuitive fix — "add
more allow rules" or "add more verbs" — addresses the smallest category. The dominant one
is a syntax problem: no `permissions.allow` entry can name a loop or an inline script, so
no rule can ever match one.

Two consequences for tool design here:

1. **Sequencing is a first-class feature, not a convenience.** `shgd batch` collapses a
   `;`-joined line into one parseable invocation — now mainly for *one tool call instead
   of N* with per-step labelling, rather than for permissions. Every other verb exists
   mainly so it can *be* a batch step.
2. **Output shaping must be built in.** `| head`, `| tail`, `| Select-Object -Last N`
   and `| cut -c1-N` are the same problem in miniature, which is why `--head`/`--tail`/
   `--grep`/`--max-cols` are global flags rather than something the caller pipes.

The boundary that keeps this safe: a batch step names a **verb from the tool's own
frozen table**, never a program, script or pipeline. A generic `shgd exec "<pipeline>"`
would turn one blanket `Bash(shgd:*)` allow rule into an unrestricted shell — the exact
thing the tool exists to avoid. When tempted, add a verb instead.

Related: [`splitLines`](crlf-breaks-dollar-anchored-regexes.md),
[the CRAP gate](fallow-crap-penalises-extraction.md),
and the tool's own docs at [`README.md`](../README.md).
