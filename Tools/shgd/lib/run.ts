// @Architecture(type=Module, descriptionShort="Child process capture for git and npm/npx", descriptionLong="Two deliberately separate spawn helpers: runGit never uses a shell because it receives caller-supplied file paths, while runTool must use one because Node refuses to spawn npm.cmd/npx.cmd directly on Windows. runPathTool and runRepoTool spawn with shell:false and accept spaces and semicolons as data. All resolve their program to an absolute path from PATH first, because Windows searches the current directory before PATH, and runTool allowlists every argument because Node quotes nothing in shell mode. Do not merge them.")
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { Limits } from './constants';
import { assertShellSafeArguments } from './shellSafety';

export interface CapturedRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

const WindowsPlatform = 'win32';
const DefaultPathExt = '.COM;.EXE;.BAT;.CMD';
const SurroundingQuotes = /^"|"$/g;
const executableCache = new Map<string, string>();

function isWindows(): boolean {
  return process.platform === WindowsPlatform;
}

function searchDirectories(): string[] {
  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.replace(SurroundingQuotes, '').trim())
    // A relative PATH entry — `.` above all — reintroduces exactly the cwd search
    // this function exists to remove.
    .filter((entry) => entry.length > 0 && path.isAbsolute(entry));
}

function candidateNames(command: string): string[] {
  if (!isWindows()) return [command];
  return (process.env.PATHEXT ?? DefaultPathExt)
    .split(';')
    .filter((extension) => extension.length > 0)
    .map((extension) => `${command}${extension}`);
}

function isFile(candidate: string): boolean {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * Windows CreateProcess and cmd.exe both search the **current directory before PATH**,
 * so a `git.exe` or an `npm.cmd` committed to a hostile repository root would run
 * instead of the real program — and `npm.cmd` is plain text, so it survives a clone.
 * Resolving to an absolute path from PATH, with relative entries skipped, is what
 * takes the cwd out of the search. Refusing outright beats falling back to the bare
 * name: the fallback is the vulnerable case.
 */
export function resolveExecutable(command: string): string {
  const cached = executableCache.get(command);
  if (cached) return cached;
  for (const directory of searchDirectories()) {
    for (const name of candidateNames(command)) {
      const candidate = path.join(directory, name);
      if (!isFile(candidate)) continue;
      executableCache.set(command, candidate);
      return candidate;
    }
  }
  throw new Error(`${command} was not found on PATH; shgd will not run it by bare name because the current directory would be searched first`);
}

/** Belt and braces for whatever the child spawns in turn: cmd.exe honours this. */
function childEnvironment(): NodeJS.ProcessEnv {
  if (!isWindows()) return process.env;
  return { ...process.env, NoDefaultCurrentDirectoryInExePath: '1' };
}

function spawnCaptured(
  command: string,
  args: readonly string[],
  useShell: boolean,
  cwd?: string,
): CapturedRun {
  const result = spawnSync(command, args as string[], {
    encoding: 'utf8',
    maxBuffer: Limits.MaxOutputBytes,
    shell: useShell,
    windowsHide: true,
    env: childEnvironment(),
    cwd,
  });
  if (result.error) return { code: null, stdout: '', stderr: result.error.message };
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export function runGit(args: readonly string[]): CapturedRun {
  return spawnCaptured(resolveExecutable('git'), args, /*useShell=*/false);
}

export function runTool(command: 'npm' | 'npx', args: readonly string[], cwd?: string): CapturedRun {
  // Node performs no quoting in shell mode, so an argument carrying `&` or `|` is a
  // second command. Every caller-supplied value already passes its own grammar
  // (assertWorkspaceName, assertTestPath, assertShellSafeRef); this is the choke
  // point that makes forgetting one at a call site a refusal rather than a shell.
  assertShellSafeArguments(args, `argument to ${command}`);
  const executable = resolveExecutable(command);
  if (!isWindows()) return spawnCaptured(executable, args, /*useShell=*/false, cwd);
  // The resolved path routinely contains a space (`C:\Program Files\nodejs\npm.cmd`)
  // and Node will not quote it either.
  return spawnCaptured(`"${executable}"`, args, /*useShell=*/true, cwd);
}

export function runPathTool(command: string, args: readonly string[], cwd?: string): CapturedRun {
  return spawnCaptured(resolveExecutable(command), args, /*useShell=*/false, cwd);
}

export function runRepoTool(absolutePath: string, args: readonly string[], cwd?: string): CapturedRun {
  return spawnCaptured(absolutePath, args, /*useShell=*/false, cwd);
}

export function gitLines(args: readonly string[]): string[] {
  const { code, stdout } = runGit(args);
  if (code !== 0) return [];
  return stdout.split('\n').map((line) => line.trimEnd()).filter((line) => line.length > 0);
}
