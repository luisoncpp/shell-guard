// @Architecture(type=Module, descriptionShort="File reading with redaction and range slicing", descriptionLong="Two things the built-in Read tool cannot do: mask secrets before the contents reach the transcript, and slice a start/end regex range out of a file. Both are readable as a batch step, which is the other reason they are verbs. Reads are confined to the repository.")
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { compileRegExp, type ParsedArgs } from '../lib/argv';
import { splitLines } from '../lib/lines';
import { capLines } from '../lib/outputShaping';
import { isInsideRepo, repoRoot } from '../lib/paths';
import { redactLines } from '../lib/redaction';
import { sliceSection } from '../lib/sectionSlice';
import { ok, type VerbResult } from '../lib/verb';

function readRepoFile(target: string | undefined, usage: string): { relativePath: string; lines: string[] } {
  if (!target) throw new Error(usage);
  const absolute = path.resolve(repoRoot(), target);
  if (!isInsideRepo(absolute)) throw new Error(`refusing to read outside the repository: ${target}`);
  return { relativePath: target, lines: splitLines(readFileSync(absolute, 'utf8')) };
}

export function read(args: ParsedArgs): VerbResult {
  const { relativePath, lines } = readRepoFile(args.positional[0], 'usage: tl read <file> [--redact]');
  const body = args.flags.has('redact') ? redactLines(lines) : lines;
  return ok([`=== ${relativePath}`, ...capLines(body)]);
}

export function section(args: ParsedArgs): VerbResult {
  const [target, startPattern, endPattern] = args.positional;
  const usage = 'usage: tl section <file> <startRegex> <endRegex>';
  if (!startPattern || !endPattern) throw new Error(usage);
  const { relativePath, lines } = readRepoFile(target, usage);
  const slice = sliceSection(lines, compileRegExp(startPattern, 'startRegex'), compileRegExp(endPattern, 'endRegex'));
  if (slice.startLine === null) {
    return { lines: [`no line of ${relativePath} matches /${startPattern}/`], code: 1 };
  }
  return ok([`=== ${relativePath}:${slice.startLine}-${slice.endLine}`, ...capLines(slice.lines)]);
}
