// @Architecture(type=Module, descriptionShort="Commit provenance for a file, a branch or a vanished path", descriptionLong="Three questions that each used to need a shell loop or a command pair: what last touched this file and is it dirty (--file), which commit changed what across a branch (--commits), and where did a path that no longer exists live (--find, searching all refs). `tl show <ref>:<path>` prints a file as of a revision.")
import type { ParsedArgs } from '../lib/argv';
import { DefaultDiffBase, Limits } from '../lib/constants';
import { assertSafeGitArgument, buildLogArgs } from '../lib/gitArgs';
import { capLines } from '../lib/outputShaping';
import { gitLines, runGit } from '../lib/run';
import { ok, type VerbResult } from '../lib/verb';

const OneLineFormat = '%h %ad %s';
const ShortDate = ['--date=short'];

function fileHistory(target: string): VerbResult {
  const filePath = assertSafeGitArgument(target, 'file');
  const lastCommit = gitLines(buildLogArgs({ format: OneLineFormat, options: [...ShortDate, '-1'], paths: [filePath] }));
  const working = gitLines(['status', '--porcelain', '--', filePath]);
  return ok([
    `last commit: ${lastCommit[0] ?? '(never committed)'}`,
    `working tree: ${working[0] ?? 'clean'}`,
  ]);
}

function commitFiles(sha: string): string[] {
  return gitLines(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]);
}

function perCommitBreakdown(base: string): VerbResult {
  const range = `${assertSafeGitArgument(base, 'base')}..HEAD`;
  const shas = gitLines(['rev-list', '--reverse', range]);
  if (shas.length === 0) return ok([`no commits in ${range}`]);
  const lines: string[] = [];
  for (const sha of shas) {
    const subject = gitLines(buildLogArgs({ format: OneLineFormat, options: [...ShortDate, '-1'], refRange: sha }))[0] ?? sha;
    lines.push(`=== ${subject.slice(0, Limits.CommitSubjectChars)}`);
    lines.push(...commitFiles(sha).map((file) => `    ${file}`));
  }
  return ok(capLines(lines));
}

function findPath(pattern: string): VerbResult {
  const commits = gitLines(buildLogArgs({ format: OneLineFormat, options: [...ShortDate, '--all'], paths: [pattern] }));
  if (commits.length === 0) return ok([`no commit on any ref touches ${pattern}`]);
  return ok(capLines(commits));
}

export function history(args: ParsedArgs): VerbResult {
  const file = args.options.get('file');
  if (file !== undefined) return fileHistory(file);
  const find = args.options.get('find');
  if (find !== undefined) return findPath(find);
  if (args.flags.has('commits') || args.options.has('commits')) {
    return perCommitBreakdown(args.options.get('commits') ?? DefaultDiffBase);
  }
  throw new Error('usage: tl history --file=<path> | --commits[=<base>] | --find=<pathspec>');
}

export function show(args: ParsedArgs): VerbResult {
  const spec = args.positional[0];
  if (!spec) throw new Error('usage: tl show <ref>:<path>');
  const result = runGit(['show', assertSafeGitArgument(spec, 'revision spec')]);
  if (result.code !== 0) {
    return { lines: [`git show failed (exit ${result.code}): ${result.stderr.trim()}`], code: 1 };
  }
  return ok(capLines(result.stdout.split('\n')));
}
