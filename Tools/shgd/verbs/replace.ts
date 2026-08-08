// @Architecture(type=Module, descriptionShort="Applies from/to substitution rules across a pathspec, previewing by default", descriptionLong="The verb that replaces `sed -i 's/a/b/g' file file file` — a shape no allow rule can name, so it prompted every time. IO half only: expands the pathspec, reads each file, hands the contents to replacePlan, and writes through writeGuard. Previewing is the default and `--take` is the write, which keeps shgd's one-write-flag rule intact and means batch's existing --take denial already covers this verb. Writability for every target is asserted before any file is read, so a refusal never leaks a protected file's contents into the transcript.")
import type { ParsedArgs } from '../lib/argv';
import { Limits } from '../lib/constants';
import { listRepoFiles } from '../lib/fileList';
import { capLines } from '../lib/outputShaping';
import { readRepoBuffer, resolveInsideRepo } from '../lib/repoFile';
import { applyRules, describeRule, parseRules, resolveReplaceMode, type FileChange, type ReplacePlan } from '../lib/replacePlan';
import { ok, type VerbResult } from '../lib/verb';
import { assertWritable, writeRepoFile } from '../lib/writeGuard';

const Usage = 'usage: shgd replace <from> <to> [<from> <to> ...] [--word|--regex] [--take] -- <pathspec...>';
const NulByte = 0;

interface FileOutcome {
  relativePath: string;
  change: FileChange;
  backupPath: string | null;
}

/** A rewrite decoded as UTF-8 and written back would corrupt an image or a binary fixture. */
function readTextOrNull(relativePath: string): string | null {
  const buffer = readRepoBuffer(relativePath);
  return buffer.includes(NulByte) ? null : buffer.toString('utf8');
}

function sum(counts: readonly number[]): number {
  return counts.reduce((running, count) => running + count, 0);
}

function previewLines(outcome: FileOutcome): string[] {
  const { relativePath, change } = outcome;
  const header = `=== ${relativePath}  (${change.changed.length} line(s), ${sum(change.perRule)} match(es))`;
  const body = change.changed.slice(0, Limits.ReplacePreviewLines).flatMap((line) => [
    `  ${line.line}- ${line.before}`,
    `  ${line.line}+ ${line.after}`,
  ]);
  const omitted = change.changed.length - Limits.ReplacePreviewLines;
  return [header, ...body, ...(omitted > 0 ? [`  ... ${omitted} more changed line(s)`] : [])];
}

function writtenLines(outcome: FileOutcome): string[] {
  return [
    `${String(outcome.change.changed.length).padStart(3)} line(s)  ${sum(outcome.change.perRule)} match(es)  ${outcome.relativePath}`,
    `    pre-image: ${outcome.backupPath ?? '(file did not exist)'}`,
  ];
}

function summary(plan: ReplacePlan, outcomes: readonly FileOutcome[], skipped: number, taking: boolean): string[] {
  const perRule = plan.rules.map((_, index) => sum(outcomes.map((outcome) => outcome.change.perRule[index])));
  return [
    `-- ${outcomes.length} file(s) ${taking ? 'written' : 'would change'}, ${sum(perRule)} match(es)${skipped > 0 ? `, ${skipped} binary file(s) skipped` : ''}`,
    ...plan.rules.map((rule, index) => `   ${perRule[index]}  ${describeRule(rule, plan.mode)}`),
    ...(taking
      ? ['not staged — review with `git diff` then stage yourself.']
      : ['preview only — re-run the same command with --take to write.']),
  ];
}

export function replace(args: ParsedArgs): VerbResult {
  const plan: ReplacePlan = {
    rules: parseRules(args.positional, Limits.ReplaceMaxRules),
    mode: resolveReplaceMode(args.flags),
  };
  const taking = args.flags.has('take');
  const files = listRepoFiles(args.paths, { usage: Usage, cap: Limits.ReplaceMaxFiles });
  if (files.length === 0) return ok(['no files match that pathspec']);
  // Resolved through any link first: `git ls-files` walks into a junction, so the
  // match set can name a file that lives outside the repository.
  const absolutePaths = files.map((relativePath) => resolveInsideRepo(relativePath, taking ? 'write' : 'read'));
  // Permission before disclosure, and before the first write: a pathspec that sweeps in
  // one protected file must fail the whole call rather than half-rewrite the rest.
  if (taking) for (const absolutePath of absolutePaths) assertWritable(absolutePath);

  const outcomes: FileOutcome[] = [];
  let skipped = 0;
  for (const [index, relativePath] of files.entries()) {
    const contents = readTextOrNull(relativePath);
    if (contents === null) {
      skipped += 1;
      continue;
    }
    const change = applyRules(contents, plan);
    if (change.changed.length === 0) continue;
    const backupPath = taking ? writeRepoFile(absolutePaths[index], change.contents).backupPath : null;
    outcomes.push({ relativePath, change, backupPath });
  }
  if (outcomes.length === 0) {
    return ok([`no matches in ${files.length} file(s)`, ...summary(plan, outcomes, skipped, taking)]);
  }
  const detail = outcomes.flatMap(taking ? writtenLines : previewLines);
  return ok([...capLines(detail), ...summary(plan, outcomes, skipped, taking)]);
}
