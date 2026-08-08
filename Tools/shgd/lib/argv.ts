// @Architecture(type=Module, descriptionShort="Pure argv tokenisation for shgd", descriptionLong="Splits an argument list into bare --flags, --key=value options, positionals and the pathspecs that follow a literal --. Values are accepted only in the --key=value form so that a verb taking positionals (shgd fallow audit origin/main) can never confuse an option's value for one of its own arguments. A single-dash token is rejected at parse time rather than treated as a positional, because no verb has a short option and a token like -n would otherwise become a verb's first argument in silence.")
export interface ParsedArgs {
  flags: ReadonlySet<string>;
  options: ReadonlyMap<string, string>;
  positional: readonly string[];
  paths: readonly string[];
}

const OptionPrefix = '--';
const ShortOptionPrefix = '-';
const PathSeparator = '--';
const NotFound = -1;

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const positional: string[] = [];
  const paths: string[] = [];
  let pastSeparator = false;
  for (const argument of argv) {
    if (pastSeparator) {
      paths.push(argument);
      continue;
    }
    if (argument === PathSeparator) {
      pastSeparator = true;
      continue;
    }
    if (!argument.startsWith(OptionPrefix)) {
      // A single-dash token is never a shgd option, and letting it fall through to
      // positional is worse than useless: assertKnownKeys only inspects flags and
      // options, so `shgd grep -n <pattern>` would take -n as the pattern and demote
      // the real pattern to a pathspec — a silently wrong search, not an error.
      if (argument.startsWith(ShortOptionPrefix)) {
        throw new Error(`unknown flag "${argument}"; shgd options take the --flag or --key=value form`);
      }
      positional.push(argument);
      continue;
    }
    const body = argument.slice(OptionPrefix.length);
    const equals = body.indexOf('=');
    if (equals === NotFound) flags.add(body);
    else options.set(body.slice(0, equals), body.slice(equals + 1));
  }
  return { flags, options, positional, paths };
}

export function emptyArgs(): ParsedArgs {
  return { flags: new Set(), options: new Map(), positional: [], paths: [] };
}

export function assertKnownKeys(args: ParsedArgs, knownFlags: ReadonlySet<string>, knownOptions: ReadonlySet<string>): void {
  const unknownFlag = [...args.flags].find((flag) => !knownFlags.has(flag));
  if (unknownFlag !== undefined) throw new Error(`unknown flag --${unknownFlag}`);
  const unknownOption = [...args.options.keys()].find((option) => !knownOptions.has(option));
  if (unknownOption !== undefined) throw new Error(`unknown option --${unknownOption}=`);
}

export function numericOption(options: ReadonlyMap<string, string>, key: string): number | undefined {
  const raw = options.get(key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${key} expects a positive integer, got "${raw}"`);
  }
  return value;
}

export function compileRegExp(pattern: string, optionName: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new Error(`--${optionName} is not a valid regular expression: ${(error as Error).message}`);
  }
}
