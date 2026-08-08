// @Architecture(type=Module, descriptionShort="Gate table construction for check", descriptionLong="Pure rules behind `tl check --project`: the Gate shape, the strict workspace-name and test-path grammars, and the fixed gate template a workspace directory expands into. Kept dependency-free so the admission rules are unit-testable; verbs/check.ts supplies the filesystem answers this module takes as booleans.")
import { isRepoRelativePath } from './shellSafety';

export interface Gate {
  name: string;
  command: 'npm' | 'npx';
  args: string[];
  inQuickRun: boolean;
}

/**
 * Both of these reach runTool, which uses a shell on Windows, so both are allowlists
 * rather than denylists — `isRepoRelativePath` in lib/shellSafety.ts holds the shared
 * grammar. `--test` was the miss: it was appended to the jest gate's argument list
 * raw, which made one pre-approved `tl check` an arbitrary command.
 */
export function assertWorkspaceName(name: string): string {
  if (!isRepoRelativePath(name)) {
    throw new Error(`unsafe --project "${name}" (expected a repo-relative directory)`);
  }
  return name;
}

export function assertTestPath(value: string): string {
  if (!isRepoRelativePath(value)) {
    throw new Error(`unsafe --test "${value}" (expected a repo-relative test file path)`);
  }
  return value;
}

export const RootGates: readonly Gate[] = Object.freeze([
  { name: 'tsc', command: 'npx', args: ['tsc', '--noEmit'], inQuickRun: true },
  { name: 'lint', command: 'npm', args: ['run', 'lint', '--silent'], inQuickRun: true },
  { name: 'jest', command: 'npm', args: ['run', 'test:jest', '--silent'], inQuickRun: false },
]);

export interface WorkspaceFacts {
  hasTsconfig: boolean;
  scripts: readonly string[];
}

/**
 * The gate template every non-root workspace expands into. The programs (`npx tsc`,
 * `npm run`) stay compile-time constants — only the directory and the script name vary,
 * and the script must already exist in that workspace's package.json. A workspace's
 * test runner is kept under the `jest` gate name so --only= is the same word everywhere.
 */
export function workspaceGates(name: string, facts: WorkspaceFacts): readonly Gate[] {
  const gates: Gate[] = [];
  if (facts.hasTsconfig) {
    gates.push({
      name: 'tsc',
      command: 'npx',
      args: ['tsc', '--noEmit', '-p', `${name}/tsconfig.json`],
      inQuickRun: true,
    });
  }
  if (facts.scripts.includes('lint')) {
    gates.push({
      name: 'lint',
      command: 'npm',
      args: ['--prefix', name, 'run', 'lint', '--silent'],
      inQuickRun: true,
    });
  }
  const testScript = ['test:jest', 'test'].find((script) => facts.scripts.includes(script));
  if (testScript) {
    gates.push({
      name: 'jest',
      command: 'npm',
      args: ['--prefix', name, 'run', testScript, '--silent'],
      inQuickRun: false,
    });
  }
  if (gates.length === 0) {
    throw new Error(`--project "${name}" has no tsconfig.json and no lint/test script`);
  }
  return Object.freeze(gates);
}
