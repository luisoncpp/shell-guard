// @Architecture(type=Module, descriptionShort="Pure git check-ignore argument construction and verdict parsing", descriptionLong="Builds the git check-ignore argument list and turns its -v --non-matching output into one verdict per queried path. --verbose and --non-matching are always paired so every path gets a line, including the ones no rule matches: a verb that printed only the ignored paths would answer 'is this ignored' with silence. Pathnames are validated and pushed after a literal -- by gitArgs.")
import { assertSafePathspecs } from './gitArgs';
import { capLines } from './outputShaping';

export interface IgnoreSpec {
  paths: readonly string[];
  /** Ask why a *tracked* file was not ignored: without it, git reports tracked paths as unmatched. */
  noIndex: boolean;
}

export function buildCheckIgnoreArgs(spec: IgnoreSpec): string[] {
  if (spec.paths.length === 0) throw new Error('usage: shgd ignored <path> [path...]');
  // --non-matching is only legal alongside --verbose, and the two together are what make
  // the output a verdict per path rather than a filtered list.
  const args = ['check-ignore', '--verbose', '--non-matching'];
  if (spec.noIndex) args.push('--no-index');
  args.push('--', ...assertSafePathspecs(spec.paths));
  return args;
}

export interface IgnoreVerdict {
  path: string;
  ignored: boolean;
  /** `.gitignore:12` — absent when no rule matched. */
  source?: string;
  /** The pattern that decided it — absent when no rule matched. */
  pattern?: string;
}

const TabSeparator = '\t';
const NotFound = -1;
// `<source>:<linenum>:<pattern>`, with an unmatched path reported as the empty `::`.
// The source group is greedy so a colon inside a pattern (`build:*`) still parses; a
// pattern that itself contains `:<digits>:` would mis-split, which no real one does.
const DecisionPattern = /^(.*):(\d+):(.*)$/;

export function parseCheckIgnore(stdout: string): IgnoreVerdict[] {
  return stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(toVerdict);
}

function toVerdict(line: string): IgnoreVerdict {
  const tab = line.indexOf(TabSeparator);
  if (tab === NotFound) return { path: line, ignored: false };
  const decision = DecisionPattern.exec(line.slice(0, tab));
  const queried = line.slice(tab + TabSeparator.length);
  if (!decision) return { path: queried, ignored: false };
  return { path: queried, ignored: true, source: `${decision[1]}:${decision[2]}`, pattern: decision[3] };
}

const IgnoredLabel = 'ignored:    ';
const NotIgnoredLabel = 'not ignored:';

/**
 * The hint is the whole reason `--no-index` exists: a path already in the index comes
 * back "not ignored" even when a pattern matches it, which reads as a missing rule
 * rather than as the tracked-file rule it is.
 */
const TrackedHint = '-- if an unignored path is already tracked, no rule can ignore it; --no-index shows which one would have';

export function formatVerdicts(verdicts: readonly IgnoreVerdict[], noIndex: boolean): string[] {
  const lines = verdicts.map((verdict) => (verdict.ignored
    ? `${IgnoredLabel} ${verdict.path}  <- ${verdict.source}  ${verdict.pattern}`
    : `${NotIgnoredLabel} ${verdict.path}`));
  const ignored = verdicts.filter((verdict) => verdict.ignored).length;
  const hint = ignored === verdicts.length || noIndex ? [] : [TrackedHint];
  // Capped before the summary, so the counts survive a query over hundreds of paths.
  return [...capLines(lines), `-- ${ignored} of ${verdicts.length} path(s) ignored`, ...hint];
}
