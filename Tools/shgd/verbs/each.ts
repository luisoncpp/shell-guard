// @Architecture(type=Module, descriptionShort="Applies one inspection mode to every file matching a pathspec", descriptionLong="The loop lives inside the verb, which is the only way an agent can iterate files without writing a for-loop that Claude Code cannot parse. File discovery goes through git ls-files, so pathspecs are git pathspecs and ignored files are excluded automatically.")
import type { ParsedArgs } from '../lib/argv';
import { Limits } from '../lib/constants';
import { resolveEachRequest, summariseFile } from '../lib/eachPlan';
import { listRepoFiles } from '../lib/fileList';
import { capLines } from '../lib/outputShaping';
import { readRepoText } from '../lib/repoFile';
import { ok, type VerbResult } from '../lib/verb';

export function each(args: ParsedArgs): VerbResult {
  const request = resolveEachRequest(args.flags, args.options);
  const files = listRepoFiles([...args.positional, ...args.paths], {
    usage: 'usage: shgd each <pathspec...> --<mode>',
    cap: Limits.EachMaxFiles,
  });
  if (files.length === 0) return ok(['no files match that pathspec']);
  const lines: string[] = [];
  for (const relativePath of files) {
    // `git ls-files` walks into a junction, so a pathspec sweep can name a file that
    // lives outside the repository. The confined reader is what refuses it.
    lines.push(...summariseFile(relativePath, readRepoText(relativePath), request));
  }
  return ok([...capLines(lines), `-- ${files.length} file(s)`]);
}
