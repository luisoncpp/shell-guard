// @Architecture(type=Module, descriptionShort="Working-tree state in one call", descriptionLong="Branch line, porcelain entries (tracked modifications and untracked files alike) and a conflicted-file count, so the three-command `git status; git ls-files -o; git diff --diff-filter=U` sequence becomes one parseable invocation.")
import type { ParsedArgs } from '../lib/argv';
import { assertSafePathspecs } from '../lib/gitArgs';
import { capLines } from '../lib/outputShaping';
import { gitLines } from '../lib/run';
import { ok, type VerbResult } from '../lib/verb';

const UntrackedPrefix = '??';

export function status(args: ParsedArgs): VerbResult {
  const paths = assertSafePathspecs(args.paths);
  const scope = paths.length > 0 ? ['--', ...paths] : [];
  const entries = gitLines(['status', '--porcelain', '--branch', ...scope]);
  const [branch, ...changes] = entries;
  const untracked = changes.filter((line) => line.startsWith(UntrackedPrefix)).length;
  const conflicted = gitLines(['diff', '--name-only', '--diff-filter=U', ...scope]);
  const summary = `${changes.length} change(s), ${untracked} untracked, ${conflicted.length} conflicted`;
  if (changes.length === 0) return ok([branch ?? '', 'clean working tree']);
  return ok([branch ?? '', summary, '', ...capLines(changes)]);
}
