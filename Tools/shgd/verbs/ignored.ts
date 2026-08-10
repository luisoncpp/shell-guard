// @Architecture(type=Module, descriptionShort="Ignore-rule provenance backed by git check-ignore", descriptionLong="Answers 'is this path ignored, and by which rule' — the one question grep over .gitignore cannot answer, since the deciding pattern may live in a nested .gitignore, .git/info/exclude or the global excludesFile, and a negation later in the file can overturn an earlier match. No path ignored is exit 0, not exit 1, so a batch does not halt on a negative answer. Nothing is read from disk: git resolves the rules, so containment is checked on the resolved path only to refuse a query pointed out of the repository.")
import path from 'node:path';
import type { ParsedArgs } from '../lib/argv';
import { buildCheckIgnoreArgs, formatVerdicts, parseCheckIgnore } from '../lib/ignoreQuery';
import { isInsideRepo } from '../lib/paths';
import { runGit } from '../lib/run';
import { ok, type VerbResult } from '../lib/verb';

const CheckIgnoreNoneIgnored = 1;

export function ignored(args: ParsedArgs): VerbResult {
  const paths = [...args.positional, ...args.paths];
  // git resolves these against its own cwd, so containment must too — path.resolve,
  // not repoRoot(), or a query typed from a subdirectory would be judged wrongly.
  const outside = paths.find((queried) => !isInsideRepo(path.resolve(queried)));
  if (outside !== undefined) {
    throw new Error(`refusing path "${outside}": it resolves outside the repository`);
  }
  const noIndex = args.flags.has('no-index');
  const result = runGit(buildCheckIgnoreArgs({ paths, noIndex }));
  if (result.code !== 0 && result.code !== CheckIgnoreNoneIgnored) {
    return { lines: [`git check-ignore failed (exit ${result.code}): ${result.stderr.trim()}`], code: 1 };
  }
  return ok(formatVerdicts(parseCheckIgnore(result.stdout), noIndex));
}
