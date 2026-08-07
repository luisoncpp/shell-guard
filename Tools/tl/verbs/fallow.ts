// @Architecture(type=Module, descriptionShort="Runs fallow and returns the reduced report", descriptionLong="Thin IO wrapper: invokes npx fallow with --format json, parses stdout, and delegates every formatting and pass/fail decision to the pure fallowReport module. Replaces hand-written node -e/python -c JSON parsing, which could not pin fallow's schema_version. --baseline compares a saved dupes snapshot so only newly introduced clone groups are printed.")
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ParsedArgs } from '../lib/argv';
import { DefaultDiffBase, Limits } from '../lib/constants';
import { newGroupLines, parseSection, reduceAudit, reduceDupes, type DupesReport, type ReducedReport } from '../lib/fallowReport';
import { assertSafeGitArgument } from '../lib/gitArgs';
import { repoRoot } from '../lib/paths';
import { runTool } from '../lib/run';
import type { VerbResult } from '../lib/verb';

function parseFallowJson(args: readonly string[]): unknown {
  const result = runTool('npx', ['fallow', ...args, '--format', 'json', '--quiet']);
  if (!result.stdout.trim()) {
    const detail = result.stderr.trim().slice(0, Limits.HunkPreviewChars);
    throw new Error(`fallow produced no JSON (exit ${result.code}): ${detail}`);
  }
  return JSON.parse(result.stdout);
}

function emit(reduced: ReducedReport): VerbResult {
  return { lines: reduced.lines, code: reduced.passed ? 0 : 1 };
}

function readBaseline(relativePath: string): DupesReport {
  const absolute = path.resolve(repoRoot(), relativePath);
  return JSON.parse(readFileSync(absolute, 'utf8')) as DupesReport;
}

function dupes(args: ParsedArgs): VerbResult {
  const report = parseFallowJson(['dupes']) as DupesReport;
  const baseline = args.options.get('baseline');
  if (baseline === undefined) return emit(reduceDupes(report));
  return emit(newGroupLines(report, readBaseline(baseline)));
}

function audit(args: ParsedArgs): VerbResult {
  const base = assertSafeGitArgument(args.positional[1] ?? DefaultDiffBase, 'base');
  const section = parseSection(args.options.get('section') ?? 'complexity');
  const report = parseFallowJson(['audit', '--changed-since', base]);
  return emit(reduceAudit(report as never, section));
}

export function fallow(args: ParsedArgs): VerbResult {
  const subcommand = args.positional[0] ?? 'audit';
  if (subcommand === 'dupes') return dupes(args);
  if (subcommand !== 'audit') {
    throw new Error(`unknown fallow subcommand: ${subcommand} (expected audit | dupes)`);
  }
  return audit(args);
}
