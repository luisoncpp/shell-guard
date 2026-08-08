// @Architecture(type=Module, descriptionShort="The confined reader every file-reading verb goes through", descriptionLong="Resolves a caller-supplied path against the repository root, follows it through any symlink or junction, and refuses it if what it actually points at lies outside the repository — then reads. The read-side twin of writeGuard: a verb calling readFileSync directly re-opens the disclosure hole (conflicts --show ../../secret, fallow --baseline=<any json>), so every read of a caller-named path belongs here.")
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { splitLines } from './lines';
import { isInsideRepo, realPath, repoRoot } from './paths';

export type FileAction = 'read' | 'write';

export function resolveInsideRepo(target: string, action: FileAction): string {
  const absolute = realPath(path.resolve(repoRoot(), target));
  if (!isInsideRepo(absolute)) {
    throw new Error(`refusing to ${action} outside the repository: ${target}`);
  }
  return absolute;
}

export function readRepoText(target: string): string {
  return readFileSync(resolveInsideRepo(target, 'read'), 'utf8');
}

export function readRepoBuffer(target: string): Buffer {
  return readFileSync(resolveInsideRepo(target, 'read'));
}

export function readRepoLines(target: string): string[] {
  return splitLines(readRepoText(target));
}
