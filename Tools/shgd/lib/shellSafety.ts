// @Architecture(type=Module, descriptionShort="Allowlist grammars for values that reach a shell", descriptionLong="runTool spawns through cmd.exe on Windows and Node quotes nothing in that mode, so every argument reaching it must match an allowlist before it is spawned. Holds the two grammars that guard it: the general shell-safe argument, and the repo-relative path shape that --project and --test both narrow to. Pure, so the admission rules are unit-testable without spawning anything.")

/**
 * The characters a shell would treat as syntax are all absent by construction: no
 * `& | ; < > ^ % ! $ ( ) " ' ` * ?`, no whitespace, no newline. What remains is what
 * npm/npx arguments actually need — paths, flags, script names, package specifiers.
 */
const ShellSafeArgument = /^[A-Za-z0-9_@.:,=+/\\~-]*$/;

export function isShellSafeArgument(value: string): boolean {
  return ShellSafeArgument.test(value);
}

export function assertShellSafeArgument(value: string, label: string): string {
  if (!isShellSafeArgument(value)) {
    throw new Error(`refusing ${label} "${value}": it contains a character a shell would read as syntax`);
  }
  return value;
}

export function assertShellSafeArguments(values: readonly string[], label: string): readonly string[] {
  for (const value of values) assertShellSafeArgument(value, label);
  return values;
}

/**
 * Path segments of word characters, dots, dashes and underscores, joined by forward
 * slashes. No leading dash (an npm/npx option), no `..` segment (an escape from the
 * repository), nothing a shell would expand. Both `--project` and `--test` land here:
 * a caller-supplied value bound for runTool needs an allowlist, not a denylist.
 */
const RepoRelativePath = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_.][A-Za-z0-9_.-]*)*$/;

export function isRepoRelativePath(value: string): boolean {
  return RepoRelativePath.test(value) && !value.split('/').includes('..') && isShellSafeArgument(value);
}
