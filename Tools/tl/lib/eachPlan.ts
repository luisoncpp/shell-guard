// @Architecture(type=Module, descriptionShort="Pure per-file summarisation rules for tl each", descriptionLong="Decides what one file contributes to the report given the requested mode, so the loop an agent would otherwise write in shell (for f in ...; do head -1 $f; done) lives inside a verb and is unit-testable. Takes file contents as a string; the verb does the reading.")
import { compileRegExp, numericOption } from './argv';
import { splitLines } from './lines';

export type EachMode = 'cat' | 'first' | 'first-line' | 'count-lines' | 'count';

export interface EachRequest {
  mode: EachMode;
  firstLines: number;
  pattern: RegExp | null;
}

const BareModes: Readonly<Record<string, EachMode>> = Object.freeze({
  cat: 'cat',
  'first-line': 'first-line',
  'count-lines': 'count-lines',
});

/**
 * The per-file line count is `--first=N`, not `--head=N`: `--head` is the global output
 * shaping option, and a mode sharing its name would silently steal it from every `tl each`.
 */
export function resolveEachRequest(flags: ReadonlySet<string>, options: ReadonlyMap<string, string>): EachRequest {
  const firstLines = numericOption(options, 'first');
  const countPattern = options.get('count');
  const bare = Object.keys(BareModes).filter((name) => flags.has(name));
  const requested = [...bare, ...(firstLines === undefined ? [] : ['first']), ...(countPattern === undefined ? [] : ['count'])];
  if (requested.length === 0) {
    throw new Error('tl each needs a mode: --cat | --first=N | --first-line | --count-lines | --count=<regex>');
  }
  if (requested.length > 1) throw new Error(`pick one mode, got ${requested.map((name) => `--${name}`).join(' ')}`);
  return {
    mode: BareModes[requested[0]] ?? (requested[0] as EachMode),
    firstLines: firstLines ?? 0,
    pattern: countPattern === undefined ? null : compileRegExp(countPattern, 'count'),
  };
}

export function summariseFile(relativePath: string, contents: string, request: EachRequest): string[] {
  const lines = splitLines(contents);
  if (request.mode === 'first-line') return [`${relativePath}: ${lines[0] ?? ''}`];
  if (request.mode === 'count-lines') return [`${relativePath}: ${lines.length} line(s)`];
  if (request.mode === 'count') {
    const pattern = request.pattern as RegExp;
    return [`${relativePath}: ${lines.filter((line) => pattern.test(line)).length} match(es)`];
  }
  const body = request.mode === 'first' ? lines.slice(0, request.firstLines) : lines;
  return [`=== ${relativePath}`, ...body];
}
