// @Architecture(type=Module, descriptionShort="shgd CLI entry: argv parse, verb dispatch, output shaping", descriptionLong="Parses argv into flags/options/positionals/pathspecs, dispatches to one verb from a frozen table, then applies head/tail/grep/max-cols shaping to the lines the verb returned. Verbs never print; this is the only place output reaches stdout, which is what lets batch relabel and concatenate them. Thrown errors map to exit 1, an unknown verb to exit 2.")
import { assertKnownKeys, parseArgs, type ParsedArgs } from './lib/argv';
import { KnownFlags, KnownOptions } from './lib/constants';
import { parseShaping, shapeLines } from './lib/outputShaping';
import { Usage } from './lib/usage';
import { isWriteEnabled } from './lib/writeGuard';
import { repoRoot, tmpDir } from './lib/paths';
import { ok, type VerbHandler, type VerbResult } from './lib/verb';
import { runBatch } from './verbs/batch';
import { check } from './verbs/check';
import { conflicts } from './verbs/conflicts';
import { diff } from './verbs/diff';
import { diffstat } from './verbs/diffstat';
import { each } from './verbs/each';
import { fallow } from './verbs/fallow';
import { grep } from './verbs/grep';
import { history, show } from './verbs/history';
import { ignored } from './verbs/ignored';
import { read, section } from './verbs/read';
import { replace } from './verbs/replace';
import { status } from './verbs/status';

function where(): VerbResult {
  return ok([
    `repo:   ${repoRoot()}`,
    `tmp:    ${tmpDir()}`,
    `writes: ${isWriteEnabled() ? 'enabled' : 'disabled'}`,
  ]);
}

const Verbs: Readonly<Record<string, VerbHandler>> = Object.freeze({
  batch: (args) => runBatch(args, { dispatch: runVerb, knownVerbs: VerbNames }),
  check,
  conflicts,
  diff,
  diffstat,
  each,
  fallow,
  grep,
  history,
  ignored,
  read,
  replace,
  section,
  show,
  status,
  where,
});

const VerbNames: ReadonlySet<string> = new Set(Object.keys(Verbs));

function runVerb(verb: string, args: ParsedArgs): VerbResult {
  const handler = Verbs[verb];
  if (!handler) throw new Error(`unknown verb "${verb}"`);
  assertKnownKeys(args, KnownFlags, KnownOptions);
  return handler(args);
}

function emit(result: VerbResult, args: ParsedArgs): number {
  for (const line of shapeLines(result.lines, parseShaping(args.options))) console.log(line);
  return result.code;
}

function main(): number {
  // `npm run shgd -- where` has npm eat the separator, the PATH shim does not, so the
  // same command typed against either spelling must mean the same thing. Only a
  // leading -- is dropped; a later one still opens the pathspec list.
  const argv = process.argv.slice(2);
  if (argv[0] === '--') argv.shift();
  const [verb, ...rest] = argv;
  if (!verb || verb === 'help' || verb === '--help') {
    console.log(Usage);
    return 0;
  }
  if (!Verbs[verb]) {
    console.error(`unknown verb "${verb}"\n\n${Usage}`);
    return 2;
  }
  const args = parseArgs(rest);
  if (args.flags.has('no-write')) process.env.SHGD_NO_WRITE = '1';
  return emit(runVerb(verb, args), args);
}

try {
  process.exit(main());
} catch (error) {
  console.error(`shgd: ${(error as Error).message}`);
  process.exit(1);
}
