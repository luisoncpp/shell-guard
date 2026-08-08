// @Architecture(type=Module, descriptionShort="Pure validation and construction of git argument lists", descriptionLong="runGit spawns without a shell, but that only stops shell injection — git itself has file-writing flags (git diff --output=<file>), so a caller-supplied ref or pathspec beginning with a dash would still be honoured as an option. Every caller-supplied value passes assertSafeGitArgument, and pathspecs are always pushed after a literal -- separator.")
export type DiffMode = 'name-status' | 'stat' | 'patch' | 'numstat';

export interface DiffSpec {
  refs: readonly string[];
  paths: readonly string[];
  mode: DiffMode;
  cached: boolean;
}

const ModeFlags: Readonly<Record<DiffMode, readonly string[]>> = Object.freeze({
  'name-status': ['--name-status'],
  stat: ['--stat'],
  patch: ['--patch'],
  numstat: ['--numstat'],
});

export function assertSafeGitArgument(value: string, label: string): string {
  if (value.length === 0) throw new Error(`${label} must not be empty`);
  if (value.startsWith('-')) {
    throw new Error(`refusing ${label} "${value}": a leading dash would be read by git as an option, not a value`);
  }
  return value;
}

/**
 * A ref that reaches `runTool` is bound for a shell on Windows, where Node quotes
 * nothing — so `assertSafeGitArgument` is the wrong guard there. Refusing a leading
 * dash says nothing about `&`, and a denylist of shell metacharacters is a guess;
 * this is the allowlist: what a ref name actually needs and nothing cmd.exe reads as
 * syntax. `HEAD^` is refused rather than escaped — `^` is cmd's escape character.
 */
const ShellSafeRef = /^[A-Za-z0-9][A-Za-z0-9._/~-]*$/;

export function assertShellSafeRef(value: string, label: string): string {
  if (!ShellSafeRef.test(value)) {
    throw new Error(`refusing ${label} "${value}": a ref reaching a shell must start with a letter or digit and use only letters, digits and . _ / ~ -`);
  }
  return value;
}

export function assertSafePathspecs(paths: readonly string[]): string[] {
  return paths.map((pathspec) => assertSafeGitArgument(pathspec, 'pathspec'));
}

export function resolveDiffMode(flags: ReadonlySet<string>): DiffMode {
  const requested = (Object.keys(ModeFlags) as DiffMode[]).filter((mode) => flags.has(mode));
  if (requested.length > 1) throw new Error(`pick one of --${requested.join(' / --')}, not several`);
  return requested[0] ?? 'stat';
}

export function buildDiffArgs(spec: DiffSpec): string[] {
  const refs = spec.refs.map((ref) => assertSafeGitArgument(ref, 'ref'));
  const paths = assertSafePathspecs(spec.paths);
  const args = ['diff', ...ModeFlags[spec.mode]];
  if (spec.cached) args.push('--cached');
  args.push(...refs);
  if (paths.length > 0) args.push('--', ...paths);
  return args;
}

export interface LogSpec {
  format: string;
  /** Hardcoded here, never caller-supplied, so these are the only args allowed to start with a dash. */
  options?: readonly string[];
  refRange?: string;
  paths?: readonly string[];
}

export function buildLogArgs(spec: LogSpec): string[] {
  const args = ['log', `--format=${spec.format}`, ...(spec.options ?? [])];
  if (spec.refRange !== undefined) args.push(assertSafeGitArgument(spec.refRange, 'ref range'));
  const paths = assertSafePathspecs(spec.paths ?? []);
  if (paths.length > 0) args.push('--', ...paths);
  return args;
}
