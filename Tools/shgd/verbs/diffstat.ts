// @Architecture(type=Module, descriptionShort="Reports branch churn against a base ref", descriptionLong="Captures git diff --numstat and git diff -U0 for base...HEAD and hands both to the pure diffCounting module for ranking and non-comment source-line accounting. An empty result normally means HEAD equals the base, not that the base is unfetched.")
import type { ParsedArgs } from '../lib/argv';
import { DefaultDiffBase, Limits, SourceExtensions, TestPathFragment } from '../lib/constants';
import { countSubstantiveLines, parseNumstat, rankByChurn, totalChurn, type ChurnEntry } from '../lib/diffCounting';
import { assertSafeGitArgument } from '../lib/gitArgs';
import { runGit } from '../lib/run';
import { ok, type VerbResult } from '../lib/verb';
import { tryReadRootShgdConfig } from '../lib/loadShgdConfig';

function churnLines(entries: readonly ChurnEntry[]): string[] {
  const totals = totalChurn(entries);
  const lines = [`total: +${totals.added} -${totals.deleted} across ${entries.length} files`, ''];
  for (const entry of rankByChurn(entries).slice(0, Limits.TopFiles)) {
    const churn = String(entry.added + entry.deleted).padStart(6);
    lines.push(`  ${churn}  +${entry.added} -${entry.deleted}  ${entry.filePath}`);
  }
  return lines;
}

export function diffstat(args: ParsedArgs): VerbResult {
  const config = tryReadRootShgdConfig();
  const base = assertSafeGitArgument(args.positional[0] ?? config?.diffBase ?? DefaultDiffBase, 'base');
  const extensions = config?.sourceExtensions ?? SourceExtensions;
  const range = `${base}...HEAD`;
  const entries = parseNumstat(runGit(['diff', '--numstat', range]).stdout);
  if (entries.length === 0) {
    return ok([`no changes across ${range} (HEAD may equal ${base}, or ${base} is unfetched)`]);
  }
  const substantive = countSubstantiveLines(runGit(['diff', '-U0', range]).stdout, extensions);
  const net = substantive.added - substantive.deleted;
  return ok([
    ...churnLines(entries),
    '',
    `source lines excluding ${TestPathFragment} and comments: +${substantive.added} -${substantive.deleted} net ${net}`,
  ]);
}
