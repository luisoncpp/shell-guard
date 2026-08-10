// @Architecture(type=Module, descriptionShort="All shgd tunables as frozen objects", descriptionLong="Single place for limits, the pinned fallow schema version, the default diff base, conflict marker strings and source extensions. Kept dependency-free so the pure logic modules can import it without pulling in any IO.")
export const Limits = Object.freeze({
  MaxOutputBytes: 32 * 1024 * 1024,
  TailLines: 15,
  TopFiles: 14,
  HunkPreviewChars: 320,
  HunkPreviewLines: 40,
  MinReportedCyclomatic: 5,
  BatchMaxSteps: 10,
  MaxReportedLines: 400,
  EachMaxFiles: 200,
  CommitSubjectChars: 72,
  ReplaceMaxRules: 8,
  ReplaceMaxFiles: 200,
  ReplacePreviewLines: 40,
});

export const ExpectedFallowSchemaVersion = 7;

export const DefaultDiffBase = 'origin/develop';

export const ConflictMarkers = Object.freeze({
  Ours: '<<<<<<<',
  Base: '|||||||',
  Separator: '=======',
  Theirs: '>>>>>>>',
});

export const SourceExtensions = Object.freeze(['.ts', '.tsx', '.mts', '.cts', '.rs']);

/**
 * Every bare --flag and --key=value any verb accepts. Checked globally rather than
 * per verb: shgd forwards no unrecognised option to git, so an unknown key is always a
 * typo, and silently ignoring one would run a different command than the caller asked for.
 */
export const KnownFlags: ReadonlySet<string> = new Set([
  'audit', 'cached', 'cat', 'commits', 'count', 'count-lines', 'files-only', 'first-line',
  'help', 'name-status', 'no-index', 'no-write', 'numstat', 'patch', 'quick', 'redact', 'regex',
  'show', 'stat', 'stop-on-fail', 'take', 'untracked', 'word',
]);

export const KnownOptions: ReadonlySet<string> = new Set([
  'baseline', 'commits', 'count', 'file', 'find', 'first', 'grep', 'head', 'max-cols',
  'only', 'project', 'section', 'tail', 'test',
]);

export const TestPathFragment = '__tests__';

export const DiffFileHeaderPrefix = '+++ b/';

export type ConflictSide = 'ours' | 'theirs';
