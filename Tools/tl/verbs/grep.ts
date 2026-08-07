// @Architecture(type=Module, descriptionShort="Repo search backed by git grep", descriptionLong="Exists so a search can be a step inside tl batch — the built-in Grep tool cannot participate in one. Tracked files only unless --untracked is passed, which means .gitignore is respected for free. No matches is exit 0 with a stated line, not exit 1, so a batch does not halt on an empty search.")
import type { ParsedArgs } from '../lib/argv';
import { buildGrepArgs, reduceGrepOutput } from '../lib/grepQuery';
import { capLines } from '../lib/outputShaping';
import { runGit } from '../lib/run';
import { ok, type VerbResult } from '../lib/verb';

const GitGrepNoMatch = 1;

export function grep(args: ParsedArgs): VerbResult {
  const [pattern, ...inlinePaths] = args.positional;
  const gitArgs = buildGrepArgs({
    pattern: pattern ?? '',
    paths: [...inlinePaths, ...args.paths],
    untracked: args.flags.has('untracked'),
    filesOnly: args.flags.has('files-only'),
    count: args.flags.has('count'),
  });
  const result = runGit(gitArgs);
  if (result.code !== 0 && result.code !== GitGrepNoMatch) {
    return { lines: [`git grep failed (exit ${result.code}): ${result.stderr.trim()}`], code: 1 };
  }
  const matches = reduceGrepOutput(result.stdout);
  if (matches.length === 0) return ok([`no matches for /${pattern}/`]);
  return ok([...capLines(matches), `-- ${matches.length} match line(s)`]);
}
