// @Architecture(type=Module, descriptionShort="Pure unified-diff line accounting", descriptionLong="Counts added/deleted source lines from `git diff -U0` text, skipping tests, comments and blanks, and ranks per-file churn from `git diff --numstat` text. IO-free: callers pass the captured git output, so the counting rules are unit-testable in-process.")
import { DiffFileHeaderPrefix, SourceExtensions, TestPathFragment } from './constants';

const CommentOrBlankPattern = /^\s*(\/\/|\*|\/\*)?\s*$|^\s*(\/\/|\*|\/\*)/;

export interface LineCounts {
  added: number;
  deleted: number;
}

export interface ChurnEntry extends LineCounts {
  filePath: string;
}

export function isCountableSource(filePath: string): boolean {
  if (filePath.includes(TestPathFragment)) return false;
  return SourceExtensions.some((extension) => filePath.endsWith(extension));
}

function diffLineKind(line: string): keyof LineCounts | null {
  if (line.startsWith('+++') || line.startsWith('---')) return null;
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'deleted';
  return null;
}

export function countSubstantiveLines(diffText: string): LineCounts {
  const counts: LineCounts = { added: 0, deleted: 0 };
  let currentFile = '';
  for (const line of diffText.split('\n')) {
    if (line.startsWith(DiffFileHeaderPrefix)) {
      currentFile = line.slice(DiffFileHeaderPrefix.length).trim();
      continue;
    }
    const kind = diffLineKind(line);
    if (!kind || !isCountableSource(currentFile)) continue;
    if (CommentOrBlankPattern.test(line.slice(1))) continue;
    counts[kind] += 1;
  }
  return counts;
}

export function parseNumstat(numstatText: string): ChurnEntry[] {
  return numstatText
    .split('\n')
    .map((row) => row.trimEnd())
    .filter((row) => row.length > 0)
    .map((row) => {
      const [added, deleted, filePath] = row.split('\t');
      return { added: Number(added) || 0, deleted: Number(deleted) || 0, filePath: filePath ?? '' };
    });
}

export function rankByChurn(entries: readonly ChurnEntry[]): ChurnEntry[] {
  return [...entries].sort((a, b) => b.added + b.deleted - (a.added + a.deleted));
}

export function totalChurn(entries: readonly ChurnEntry[]): LineCounts {
  return entries.reduce<LineCounts>(
    (sum, entry) => ({ added: sum.added + entry.added, deleted: sum.deleted + entry.deleted }),
    { added: 0, deleted: 0 },
  );
}
