// @Architecture(type=Module, descriptionShort="Repo root, tmp and backup directory resolution", descriptionLong="Resolves the repository root from git rather than the process cwd (which drifts mid-session), plus the tmp directory used for temporary files and write pre-images, honouring TL_TMP. Also holds the repo-containment predicate the write guard depends on.")
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGit } from './run';

let cachedRepoRoot: string | null = null;

export function repoRoot(): string {
  if (cachedRepoRoot) return cachedRepoRoot;
  const { code, stdout } = runGit(['rev-parse', '--show-toplevel']);
  cachedRepoRoot = code === 0 ? path.resolve(stdout.trim()) : process.cwd();
  return cachedRepoRoot;
}

export function tmpDir(): string {
  const overridden = process.env.TL_TMP;
  const target = overridden && overridden.length > 0 ? overridden : path.join(os.tmpdir(), 'tl');
  mkdirSync(target, { recursive: true });
  return target;
}

export function backupDir(): string {
  const target = path.join(tmpDir(), 'backups');
  mkdirSync(target, { recursive: true });
  return target;
}

export function toRepoRelative(target: string): string {
  return path.relative(repoRoot(), path.resolve(target)).split(path.sep).join('/');
}

export function isInsideRepo(target: string): boolean {
  const relative = path.relative(repoRoot(), path.resolve(target));
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}
