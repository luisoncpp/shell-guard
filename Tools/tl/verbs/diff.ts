// @Architecture(type=Module, descriptionShort="git diff over arbitrary refs with a chosen output mode", descriptionLong="Refs are passed through verbatim, so a stash ref, a merge-base pair or a three-dot range all work without a dedicated verb for each. Every ref and pathspec is validated by gitArgs first, because git's own file-writing options (--output=) would otherwise be reachable through a caller-supplied value.")
import type { ParsedArgs } from '../lib/argv';
import { buildDiffArgs, resolveDiffMode } from '../lib/gitArgs';
import { capLines } from '../lib/outputShaping';
import { runGit } from '../lib/run';
import { ok, type VerbResult } from '../lib/verb';

const DefaultRefs = ['HEAD'];

function describe(refs: readonly string[], cached: boolean): string {
  const against = refs.join(' ');
  if (cached) return `staged changes vs ${against}`;
  return `working tree vs ${against}`;
}

export function diff(args: ParsedArgs): VerbResult {
  const cached = args.flags.has('cached');
  const refs = args.positional.length > 0 ? args.positional : DefaultRefs;
  const gitArgs = buildDiffArgs({ refs, paths: args.paths, mode: resolveDiffMode(args.flags), cached });
  const result = runGit(gitArgs);
  if (result.code !== 0) {
    return { lines: [`git diff failed (exit ${result.code}): ${result.stderr.trim()}`], code: 1 };
  }
  const body = result.stdout.split('\n').map((line) => line.trimEnd()).filter((line) => line.length > 0);
  if (body.length === 0) return ok([`no differences (${describe(refs, cached)})`]);
  return ok([describe(refs, cached), ...capLines(body)]);
}
