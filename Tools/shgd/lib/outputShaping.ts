// @Architecture(type=Module, descriptionShort="Pure head/tail/grep/maxCols shaping of verb output", descriptionLong="Replaces the shell pipes an agent would otherwise append to a shgd call (| head, | tail, | Select-Object -Last, | cut -c1-N), each of which drags in a second program that must itself be allowed or the whole line prompts. Shaping in-process needs no second program at all. Applied by index.ts to every verb result and by batch to each step.")
import { compileRegExp, numericOption } from './argv';
import { Limits } from './constants';

export interface Shaping {
  head?: number;
  tail?: number;
  grep?: RegExp;
  maxCols?: number;
}

const TruncationMarker = '...';

export function parseShaping(options: ReadonlyMap<string, string>): Shaping {
  const grepPattern = options.get('grep');
  return {
    head: numericOption(options, 'head'),
    tail: numericOption(options, 'tail'),
    grep: grepPattern === undefined ? undefined : compileRegExp(grepPattern, 'grep'),
    maxCols: numericOption(options, 'max-cols'),
  };
}

function truncate(line: string, maxCols: number): string {
  if (line.length <= maxCols) return line;
  return `${line.slice(0, maxCols)}${TruncationMarker}`;
}

/**
 * Order is fixed and documented: filter, then truncate, then head, then tail.
 * Head before tail means `--head=50 --tail=10` is "the last 10 of the first 50".
 */
export function shapeLines(lines: readonly string[], shaping: Shaping): string[] {
  const pattern = shaping.grep;
  let shaped = pattern === undefined ? [...lines] : lines.filter((line) => pattern.test(line));
  const maxCols = shaping.maxCols;
  if (maxCols !== undefined) shaped = shaped.map((line) => truncate(line, maxCols));
  if (shaping.head !== undefined) shaped = shaped.slice(0, shaping.head);
  if (shaping.tail !== undefined) shaped = shaped.slice(-shaping.tail);
  return shaped;
}

/** Caps runaway output from a verb that can legitimately produce thousands of lines. */
export function capLines(lines: readonly string[], limit: number = Limits.MaxReportedLines): string[] {
  if (lines.length <= limit) return [...lines];
  const omitted = lines.length - limit;
  return [...lines.slice(0, limit), `... ${omitted} more line(s) omitted (raise with --head= or narrow the query)`];
}
