// @Architecture(type=Module, descriptionShort="Child process capture for git and npm/npx", descriptionLong="Two deliberately separate spawn helpers: runGit never uses a shell because it receives caller-supplied file paths, while runTool must use one because Node refuses to spawn npm.cmd/npx.cmd directly on Windows and therefore only accepts argument lists hardcoded in this repo. Do not merge them.")
import { spawnSync } from 'node:child_process';
import { Limits } from './constants';

export interface CapturedRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

function spawnCaptured(command: string, args: readonly string[], useShell: boolean): CapturedRun {
  const result = spawnSync(command, args as string[], {
    encoding: 'utf8',
    maxBuffer: Limits.MaxOutputBytes,
    shell: useShell,
    windowsHide: true,
  });
  if (result.error) return { code: null, stdout: '', stderr: result.error.message };
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export function runGit(args: readonly string[]): CapturedRun {
  return spawnCaptured('git', args, /*useShell=*/false);
}

export function runTool(command: 'npm' | 'npx', args: readonly string[]): CapturedRun {
  const isWindowsBatch = process.platform === 'win32';
  const executable = isWindowsBatch ? `${command}.cmd` : command;
  return spawnCaptured(executable, args, /*useShell=*/isWindowsBatch);
}

export function gitLines(args: readonly string[]): string[] {
  const { code, stdout } = runGit(args);
  if (code !== 0) return [];
  return stdout.split('\n').map((line) => line.trimEnd()).filter((line) => line.length > 0);
}
