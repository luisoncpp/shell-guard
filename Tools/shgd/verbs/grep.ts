// @Architecture(type=Module, descriptionShort="Repo search backed by git grep", descriptionLong="Exists so a search can be a step inside shgd batch — the built-in Grep tool cannot participate in one. Tracked files only unless --untracked is passed, which means .gitignore is respected for free. No matches is exit 0 with a stated line, not exit 1, so a batch does not halt on an empty search. Hits are filtered back to the repository: git, not repoFile, does the reading here, and git walks into a junction.")
import path from 'node:path';
import type { ParsedArgs } from '../lib/argv';
import { buildGrepArgs, keepContainedLines, reduceGrepOutput } from '../lib/grepQuery';
import { capLines } from '../lib/outputShaping';
import { isInsideRepo, repoRoot } from '../lib/paths';
import { runGit } from '../lib/run';
import { ok, type VerbResult } from '../lib/verb';

const GitGrepNoMatch = 1;

export function grep(args: ParsedArgs): VerbResult {
  const [pattern, ...inlinePaths] = args.positional;
  const filesOnly = args.flags.has('files-only');
  const gitArgs = buildGrepArgs({
    pattern: pattern ?? '',
    paths: [...inlinePaths, ...args.paths],
    untracked: args.flags.has('untracked'),
    filesOnly,
    count: args.flags.has('count'),
  });
  const result = runGit(gitArgs);
  if (result.code !== 0 && result.code !== GitGrepNoMatch) {
    return { lines: [`git grep failed (exit ${result.code}): ${result.stderr.trim()}`], code: 1 };
  }
  const contained = keepContainedLines(reduceGrepOutput(result.stdout), filesOnly, (relativePath) =>
    isInsideRepo(path.resolve(repoRoot(), relativePath)));
  const hidden = contained.hidden > 0 ? [`-- ${contained.hidden} line(s) hidden: a link out of the repository`] : [];
  if (contained.lines.length === 0) return ok([`no matches for /${pattern}/`, ...hidden]);
  return ok([...capLines(contained.lines), `-- ${contained.lines.length} match line(s)`, ...hidden]);
}
