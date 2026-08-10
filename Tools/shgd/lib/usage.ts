// @Architecture(type=Module, descriptionShort="shgd usage text", descriptionLong="Held apart from index.ts purely so the entry point stays short enough to read at a glance as the verb surface grows. No logic.")
export const Usage = `shgd — repo inspection + conflict resolution

Batching
  shgd batch "<step>" "<step>" ...     run several verbs in ONE invocation
                                     --stop-on-fail halts after the first failure
                                     steps may not write, may not nest

Inspection
  shgd grep <pattern> [pathspec...]    git grep; --untracked --files-only --count
  shgd each <glob> --<mode>            per file: --cat --first=N --first-line
                                     --count-lines --count=<regex>
                                     (--first=N, not --head=N: --head shapes output)
  shgd read <file> [--redact]          file contents; --redact masks secrets
  shgd section <file> <startRe> <endRe>  slice a range out of a file
  shgd status                          porcelain + untracked + conflicted
  shgd diff [<a>] [<b>] [-- paths...]  --name-status --stat --patch --numstat --cached
                                     no ref given compares the working tree to HEAD
  shgd history --file=<path>           last commit + working state for one file
  shgd history --commits[=<base>]      per-commit changed files over base..HEAD
  shgd history --find=<glob>           every commit touching a path, all refs
  shgd show <ref>:<path>               file contents at a revision
  shgd ignored <path> [path...]        is it gitignored, and by which rule and line
                                     --no-index answers for a tracked path too

Editing
  shgd replace <from> <to> [<from> <to> ...] -- <pathspec...>
                                     replaces sed -i across files; rules apply in
                                     order, within a line, literally by default
                                     --word  match whole words only (identifiers)
                                     --regex treat <from> as a regex, $1 in <to>
                                     --take  write; without it this is a preview

Gates and quality
  shgd check [--quick]                 tsc --noEmit, npm run lint, npm run test:jest
                                     --project=<dir> gates one workspace directory
                                     --only=tsc|lint|jest  --test=<path>
  shgd fallow [audit [base] | dupes]   introduced-vs-inherited report
                                     --section=complexity|dead-exports|all
                                     dupes --baseline=<file> shows only new groups
  shgd diffstat [base]                 churn vs base...HEAD plus source-line counts

Conflicts
  shgd conflicts                       list conflicted files with hunk counts
  shgd conflicts --show [file]         print conflict hunks
  shgd conflicts --take <file> <spec>  resolve; spec = ours | theirs | 1=theirs,2=ours
                                     per-hunk specs must cover every hunk
  shgd conflicts --audit               staged files differing from BOTH merge parents

  shgd where                           repo root, tmp dir, write-toggle state

Output shaping (any verb, replaces a shell pipe)
  --head=N --tail=N --grep=<regex> --max-cols=N
  Applied in that order: filter, truncate, head, tail.

Options take values only as --key=value. A bare -- separates pathspecs. There are
no short options: a single-dash token such as -n is an error, not a positional.

Writes: enabled by default, and only --take writes — on conflicts and on replace, so
a verb without it is inspection. Set SHGD_WRITE=0 (or pass --no-write) to disable. Every write drops a pre-image copy in SHGD_TMP/backups first,
refuses paths outside the repo, and refuses .git/.claude/.vscode/.idea/node_modules
and friends. Nothing is ever staged, committed, pushed, or deleted.`;
