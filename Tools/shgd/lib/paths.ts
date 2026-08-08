// @Architecture(type=Module, descriptionShort="Repo root, tmp and backup directory resolution", descriptionLong="Resolves the repository root from git rather than the process cwd (which drifts mid-session), plus the tmp directory used for temporary files and write pre-images, honouring SHGD_TMP. Also holds the repo-containment predicate the write guard depends on — which resolves symlinks and Windows junctions first, because a lexical check is not containment.")
import { mkdirSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGit } from './run';

const OwnerOnly = 0o700;

let cachedRepoRoot: string | null = null;

/**
 * A containment check on an unresolved path is worthless against a symlink or a
 * Windows junction (which needs no administrator rights to create, and which
 * `git ls-files --others` walks straight into): `path.relative` sees `repo/link/x`
 * inside the repository while the filesystem opens something else entirely, and both
 * readFileSync and writeFileSync follow the reparse point. Every containment decision
 * therefore runs on the resolved path. A target that does not exist yet — the file a
 * write is about to create — is resolved as far as its nearest existing ancestor.
 *
 * `realpathSync.native` rather than the JavaScript one: it asks the filesystem for the
 * canonical name, so an 8.3 short name (`NODE_M~1`) and an aliased case both come back
 * spelled the way the protected-path list spells them. The JS implementation resolves
 * links but hands back whatever the caller typed for everything else.
 */
export function realPath(target: string): string {
  const absolute = path.resolve(target);
  const missing: string[] = [];
  let current = absolute;
  for (;;) {
    try {
      return path.join(realpathSync.native(current), ...missing);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return absolute;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

export function repoRoot(): string {
  if (cachedRepoRoot) return cachedRepoRoot;
  const { code, stdout } = runGit(['rev-parse', '--show-toplevel']);
  cachedRepoRoot = realPath(code === 0 ? stdout.trim() : process.cwd());
  return cachedRepoRoot;
}

export function tmpDir(): string {
  const overridden = process.env.SHGD_TMP;
  const target = overridden && overridden.length > 0 ? overridden : path.join(os.tmpdir(), 'shgd');
  mkdirSync(target, { recursive: true, mode: OwnerOnly });
  return target;
}

export function backupDir(): string {
  const target = path.join(tmpDir(), 'backups');
  mkdirSync(target, { recursive: true, mode: OwnerOnly });
  return target;
}

export function toRepoRelative(target: string): string {
  return path.relative(repoRoot(), realPath(target)).split(path.sep).join('/');
}

export function isInsideRepo(target: string): boolean {
  const relative = toRepoRelative(target);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}
