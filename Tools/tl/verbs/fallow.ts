// @Architecture(type=Module, descriptionShort="Runs fallow and returns the reduced report", descriptionLong="Thin IO wrapper: invokes npx fallow with --format json, parses stdout, and delegates every formatting and pass/fail decision to the pure fallowReport module. Replaces hand-written node -e/python -c JSON parsing, which could not pin fallow's schema_version. fallow must already be a dependency of the repository — npx would otherwise download and execute a package from the registry under tl's blanket allow rule. --baseline compares a saved dupes snapshot so only newly introduced clone groups are printed.")
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ParsedArgs } from '../lib/argv';
import { DefaultDiffBase, Limits } from '../lib/constants';
import { newGroupLines, parseSection, reduceAudit, reduceDupes, type DupesReport, type ReducedReport } from '../lib/fallowReport';
import { assertShellSafeRef } from '../lib/gitArgs';
import { repoRoot } from '../lib/paths';
import { readRepoText } from '../lib/repoFile';
import { runTool } from '../lib/run';
import type { VerbResult } from '../lib/verb';

const LocalFallow = ['node_modules/.bin/fallow', 'node_modules/.bin/fallow.cmd', 'node_modules/fallow/package.json'];

/**
 * `npx <name>` silently downloads and runs the package when it is not installed.
 * Under a blanket Bash(tl:*) rule that is a pre-approved fetch-and-execute of
 * whatever the registry currently serves for that name, so the local copy is a
 * precondition rather than a convenience.
 */
function assertFallowInstalled(): void {
  const root = repoRoot();
  if (LocalFallow.some((candidate) => existsSync(path.join(root, candidate)))) return;
  throw new Error('fallow is not installed in this repository, and tl will not let npx download it. Run `npm install --save-dev fallow` first.');
}

function parseFallowJson(args: readonly string[]): unknown {
  assertFallowInstalled();
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

function dupes(args: ParsedArgs): VerbResult {
  const report = parseFallowJson(['dupes']) as DupesReport;
  const baseline = args.options.get('baseline');
  if (baseline === undefined) return emit(reduceDupes(report));
  // Through the confined reader: --baseline used to read any JSON file on the disk.
  return emit(newGroupLines(report, JSON.parse(readRepoText(baseline)) as DupesReport));
}

function audit(args: ParsedArgs): VerbResult {
  // The base reaches runTool, which uses a shell on Windows. assertSafeGitArgument is
  // the wrong guard for a shell sink — it only refuses a leading dash.
  const base = assertShellSafeRef(args.positional[1] ?? DefaultDiffBase, 'base');
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
