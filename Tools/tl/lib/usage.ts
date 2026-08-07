// @Architecture(type=Module, descriptionShort="tl usage text", descriptionLong="Held apart from index.ts purely so the entry point stays short enough to read at a glance as the verb surface grows. No logic.")
export const Usage = `tl — repo inspection + conflict resolution

Batching
  tl batch "<step>" "<step>" ...     run several verbs in ONE invocation
                                     --stop-on-fail halts after the first failure
                                     steps may not write, may not nest

Inspection
  tl grep <pattern> [pathspec...]    git grep; --untracked --files-only --count
  tl each <glob> --<mode>            per file: --cat --first=N --first-line
                                     --count-lines --count=<regex>
                                     (--first=N, not --head=N: --head shapes output)
  tl read <file> [--redact]          file contents; --redact masks secrets
  tl section <file> <startRe> <endRe>  slice a range out of a file
  tl status                          porcelain + untracked + conflicted
  tl diff [<a>] [<b>] [-- paths...]  --name-status --stat --patch --numstat --cached
                                     no ref given compares the working tree to HEAD
  tl history --file=<path>           last commit + working state for one file
  tl history --commits[=<base>]      per-commit changed files over base..HEAD
  tl history --find=<glob>           every commit touching a path, all refs
  tl show <ref>:<path>               file contents at a revision

Gates and quality
  tl check [--quick]                 tsc --noEmit, npm run lint, npm run test:jest
                                     --project=<dir> gates one workspace directory
                                     --only=tsc|lint|jest  --test=<path>
  tl fallow [audit [base] | dupes]   introduced-vs-inherited report
                                     --section=complexity|dead-exports|all
                                     dupes --baseline=<file> shows only new groups
  tl diffstat [base]                 churn vs base...HEAD plus source-line counts

Conflicts
  tl conflicts                       list conflicted files with hunk counts
  tl conflicts --show [file]         print conflict hunks
  tl conflicts --take <file> <spec>  resolve; spec = ours | theirs | 1=theirs,2=ours
                                     per-hunk specs must cover every hunk
  tl conflicts --audit               staged files differing from BOTH merge parents

  tl where                           repo root, tmp dir, write-toggle state

Output shaping (any verb, replaces a shell pipe)
  --head=N --tail=N --grep=<regex> --max-cols=N
  Applied in that order: filter, truncate, head, tail.

Options take values only as --key=value. A bare -- separates pathspecs. There are
no short options: a single-dash token such as -n is an error, not a positional.

Writes: enabled by default, and only --take writes. Set TL_WRITE=0 (or pass
--no-write) to disable. Every write drops a pre-image copy in TL_TMP/backups first,
refuses paths outside the repo, and refuses .git/.claude/.vscode/.idea/node_modules
and friends. Nothing is ever staged, committed, pushed, or deleted.`;
