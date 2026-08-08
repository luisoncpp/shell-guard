// @Architecture(type=Module, descriptionShort="Pure git-grep argument construction and output reduction", descriptionLong="Builds the git grep argument list from a parsed request and trims its output to a reportable size. The pattern is always passed behind -e so a pattern starting with a dash is data rather than an option; pathspecs are validated and pushed after a literal -- by gitArgs.")
import { assertSafePathspecs } from './gitArgs';

export interface GrepSpec {
  pattern: string;
  paths: readonly string[];
  untracked: boolean;
  filesOnly: boolean;
  count: boolean;
}

export function buildGrepArgs(spec: GrepSpec): string[] {
  if (spec.filesOnly && spec.count) throw new Error('pick either --files-only or --count, not both');
  if (spec.pattern.length === 0) throw new Error('usage: shgd grep <pattern> [pathspec...]');
  // git grep defaults to BASIC regex, where `a|b` and `x+` are literal characters — an
  // alternation would report "no matches" rather than failing. Extended is both what a
  // caller typing a regex expects and what every --grep= shaping option already uses.
  const args = ['grep', '--no-color', '-I', '--extended-regexp'];
  if (spec.filesOnly) args.push('--files-with-matches');
  else if (spec.count) args.push('--count');
  else args.push('--line-number');
  if (spec.untracked) args.push('--untracked');
  args.push('-e', spec.pattern);
  const paths = assertSafePathspecs(spec.paths);
  if (paths.length > 0) args.push('--', ...paths);
  return args;
}

export function reduceGrepOutput(stdout: string): string[] {
  return stdout.split('\n').map((line) => line.trimEnd()).filter((line) => line.length > 0);
}

const PathSeparatorIndex = 0;
const NotFound = -1;

/** `path:line:text`, `path:count` or a bare `path` — every mode leads with the file. */
export function grepLinePath(line: string, filesOnly: boolean): string {
  if (filesOnly) return line;
  const colon = line.indexOf(':');
  return colon === NotFound ? line : line.slice(PathSeparatorIndex, colon);
}

export interface ContainedGrepOutput {
  lines: string[];
  hidden: number;
}

/**
 * `git grep --untracked` walks into a symlink or a Windows junction, so a hit can be a
 * file that lives outside the repository — the one read path that does not go through
 * repoFile, because git does the reading. The containment predicate is injected so the
 * rule stays pure; the hidden count is reported rather than swallowed.
 */
export function keepContainedLines(
  lines: readonly string[],
  filesOnly: boolean,
  isContained: (relativePath: string) => boolean,
): ContainedGrepOutput {
  const kept = lines.filter((line) => isContained(grepLinePath(line, filesOnly)));
  return { lines: kept, hidden: lines.length - kept.length };
}
