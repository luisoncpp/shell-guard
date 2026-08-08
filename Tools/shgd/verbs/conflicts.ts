// @Architecture(type=Module, descriptionShort="Lists, shows, audits and resolves merge conflicts", descriptionLong="IO half of conflict handling: enumerates conflicted files via git, renders hunks, audits which staged files differ from BOTH merge parents, and routes --take through the pure conflictResolver then writeGuard. Asserts writability BEFORE reading the file, so a refusal never leaks a protected file's contents into the transcript. Never stages.")
import path from 'node:path';
import type { ParsedArgs } from '../lib/argv';
import { ConflictMarkers, Limits } from '../lib/constants';
import { classifyLine, countHunks, parseSpec, resolveLines } from '../lib/conflictResolver';
import { gitLines, runGit } from '../lib/run';
import { repoRoot } from '../lib/paths';
import { readRepoText } from '../lib/repoFile';
import { ok, type VerbResult } from '../lib/verb';
import { assertWritable, writeRepoFile } from '../lib/writeGuard';

function conflictedFiles(): string[] {
  return gitLines(['diff', '--name-only', '--diff-filter=U']);
}

/**
 * Through the confined reader, and split raw rather than with splitLines: the
 * resolver rejoins with the terminators it was given. `--show` takes a caller-named
 * path, so without the confinement `--show ../../secret` printed it.
 */
function readLines(relativePath: string): string[] {
  return readRepoText(relativePath).split('\n');
}

function listConflicts(): VerbResult {
  const files = conflictedFiles();
  if (files.length === 0) return ok(['no conflicted files']);
  return ok(files.map((relativePath) => `${String(countHunks(readLines(relativePath))).padStart(3)} hunk(s)  ${relativePath}`));
}

function hunkLines(relativePath: string): string[] {
  const lines = [`######## ${relativePath}`];
  let section: ReturnType<typeof classifyLine>['section'] = 'none';
  let shown = 0;
  for (const line of readLines(relativePath)) {
    const step = classifyLine(line, section);
    const wasInside = section !== 'none' || step.opensHunk;
    section = step.section;
    if (!wasInside) continue;
    if (shown < Limits.HunkPreviewLines) lines.push(`  ${line.slice(0, Limits.HunkPreviewChars)}`);
    shown = section === 'none' ? 0 : shown + 1;
  }
  return lines;
}

function showConflicts(target: string | undefined): VerbResult {
  const targets = target ? [target] : conflictedFiles();
  return ok(targets.flatMap((relativePath) => ['', ...hunkLines(relativePath)]));
}

function differsFromBothParents(relativePath: string): boolean {
  const againstHead = runGit(['diff', '--cached', '--quiet', 'HEAD', '--', relativePath]).code;
  const againstMerge = runGit(['diff', '--cached', '--quiet', 'MERGE_HEAD', '--', relativePath]).code;
  return againstHead !== 0 && againstMerge !== 0;
}

/** During a merge, the staged files matching neither side are the ones a human actually decided. */
function auditResolutions(): VerbResult {
  if (runGit(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']).code !== 0) {
    return { lines: ['no merge in progress (MERGE_HEAD is absent)'], code: 1 };
  }
  const staged = gitLines(['diff', '--cached', '--name-only', 'HEAD']);
  const genuine = staged.filter(differsFromBothParents);
  if (genuine.length === 0) return ok([`${staged.length} staged file(s); none differ from both parents`]);
  return ok([`staged files differing from BOTH parents (${genuine.length}/${staged.length}):`, ...genuine.map((file) => `  ${file}`)]);
}

function takeConflict(positional: readonly string[]): VerbResult {
  const [relativePath, spec] = positional;
  if (!relativePath || !spec) {
    throw new Error('usage: shgd conflicts --take <file> <ours|theirs|1=theirs,2=ours,...>');
  }
  // Permission before disclosure: refusing after reading would still have leaked
  // a protected file's contents into the transcript on the error path.
  const absolutePath = path.resolve(repoRoot(), relativePath);
  assertWritable(absolutePath);
  const lines = readLines(relativePath);
  const hunkCount = countHunks(lines);
  if (hunkCount === 0) throw new Error(`no conflict markers in ${relativePath}`);
  const resolved = resolveLines(lines, parseSpec(spec, hunkCount));
  const { backupPath } = writeRepoFile(absolutePath, resolved.join('\n'));
  const remaining = resolved.filter((line) => line.startsWith(ConflictMarkers.Ours)).length;
  return {
    lines: [
      `resolved ${hunkCount} hunk(s) in ${relativePath} -> ${remaining} marker(s) remaining`,
      `pre-image: ${backupPath ?? '(file did not exist)'}`,
      'not staged — review with `git diff` then stage yourself.',
    ],
    code: remaining === 0 ? 0 : 1,
  };
}

export function conflicts(args: ParsedArgs): VerbResult {
  if (args.flags.has('take')) return takeConflict(args.positional);
  if (args.flags.has('show')) return showConflicts(args.positional[0]);
  if (args.flags.has('audit')) return auditResolutions();
  return listConflicts();
}
