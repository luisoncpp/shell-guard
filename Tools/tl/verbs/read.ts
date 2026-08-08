// @Architecture(type=Module, descriptionShort="File reading with redaction and range slicing", descriptionLong="Two things the built-in Read tool cannot do: mask secrets before the contents reach the transcript, and slice a start/end regex range out of a file. Both are readable as a batch step, which is the other reason they are verbs. Reads go through repoFile, so they are confined to the repository through symlinks as well as lexically.")
import { compileRegExp, type ParsedArgs } from '../lib/argv';
import { capLines } from '../lib/outputShaping';
import { redactLines } from '../lib/redaction';
import { readRepoLines } from '../lib/repoFile';
import { sliceSection } from '../lib/sectionSlice';
import { ok, type VerbResult } from '../lib/verb';

function repoFileLines(target: string | undefined, usage: string): { relativePath: string; lines: string[] } {
  if (!target) throw new Error(usage);
  return { relativePath: target, lines: readRepoLines(target) };
}

function redactIfAsked(lines: readonly string[], args: ParsedArgs): string[] {
  return args.flags.has('redact') ? redactLines(lines) : [...lines];
}

export function read(args: ParsedArgs): VerbResult {
  const { relativePath, lines } = repoFileLines(args.positional[0], 'usage: tl read <file> [--redact]');
  return ok([`=== ${relativePath}`, ...capLines(redactIfAsked(lines, args))]);
}

export function section(args: ParsedArgs): VerbResult {
  const [target, startPattern, endPattern] = args.positional;
  const usage = 'usage: tl section <file> <startRegex> <endRegex> [--redact]';
  if (!startPattern || !endPattern) throw new Error(usage);
  const { relativePath, lines } = repoFileLines(target, usage);
  const slice = sliceSection(lines, compileRegExp(startPattern, 'startRegex'), compileRegExp(endPattern, 'endRegex'));
  if (slice.startLine === null) {
    return { lines: [`no line of ${relativePath} matches /${startPattern}/`], code: 1 };
  }
  // A range out of an .env is as much of a disclosure as the whole file, so --redact
  // is available here too rather than only on `read`.
  return ok([`=== ${relativePath}:${slice.startLine}-${slice.endLine}`, ...capLines(redactIfAsked(slice.lines, args))]);
}
