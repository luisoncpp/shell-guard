// @Architecture(type=Module, descriptionShort="Single choke point for every tl file write", descriptionLong="Enforces the write toggle, repository containment (through symlinks, via repoFile) and a protected-path list before writing, and copies the current file to TL_TMP/backups first. The protected list re-implements Claude Code's own, because a blanket Bash(tl:*) allow rule bypasses that permission layer; any verb writing with bare writeFileSync silently defeats this guard.")
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { backupDir, repoRoot, toRepoRelative } from './paths';
import { resolveInsideRepo } from './repoFile';

const ProtectedDirectories = new Set([
  '.git', '.github', '.claude', '.vscode', '.idea', '.husky', '.cargo',
  '.devcontainer', '.yarn', '.mvn', 'node_modules',
]);

/**
 * The manifests and lockfiles are here for the write→execute chain: `tl check` runs
 * whatever `package.json` declares, so a rewrite of it under one pre-approved call
 * turns the next pre-approved call into arbitrary execution. Editing them is a job
 * for the edit tools, where the permission layer still applies.
 */
const ProtectedFiles = new Set([
  '.gitconfig', '.gitmodules', '.npmrc', '.yarnrc', '.yarnrc.yml',
  '.mcp.json', '.claude.json', '.envrc', '.pre-commit-config.yaml',
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json',
  'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
]);

const TrailingDotsOrSpaces = /[. ]+$/;

export interface WriteResult {
  relativePath: string;
  backupPath: string | null;
}

export function isWriteEnabled(): boolean {
  return process.env.TL_WRITE !== '0' && process.env.TL_NO_WRITE !== '1';
}

/**
 * Both sides are normalised because the *filesystem* normalises: NTFS and APFS are
 * case-insensitive, so `.GIT/config` is `.git/config` on disk, and Win32 strips
 * trailing dots and spaces from a path component, so `.git./config` is too. A
 * case-sensitive Set lookup let either spelling walk past the entire list.
 */
function normaliseSegment(segment: string): string {
  return segment.toLowerCase().replace(TrailingDotsOrSpaces, '');
}

export function findProtectedSegment(relativePath: string): string | null {
  const segments = relativePath.split('/').map(normaliseSegment);
  const protectedDirectory = segments.find((segment) => ProtectedDirectories.has(segment));
  if (protectedDirectory) return protectedDirectory;
  const basename = segments[segments.length - 1];
  return ProtectedFiles.has(basename) ? basename : null;
}

export function assertWritable(target: string): string {
  if (!isWriteEnabled()) {
    throw new Error('tl writes are disabled (TL_WRITE=0 / TL_NO_WRITE=1). Re-run without it to allow edits.');
  }
  // Containment is decided on what the path resolves to, and the protected-path check
  // runs on that same resolved path: a link named `docs/notes.md` pointing at
  // `.claude/settings.json` is a write to `.claude/`, whatever the caller typed.
  const relativePath = toRepoRelative(resolveInsideRepo(target, 'write'));
  const blocked = findProtectedSegment(relativePath);
  if (blocked) {
    throw new Error(`refusing to write protected path (${blocked}): ${relativePath}`);
  }
  return relativePath;
}

function savePreImage(target: string, relativePath: string): string | null {
  if (!existsSync(target)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Nested under the stamp rather than flattened: flattening `a/b` to `a__b` collided
  // with a real `a__b`, so one pre-image silently overwrote another.
  const backupPath = path.join(backupDir(), stamp, relativePath);
  mkdirSync(path.dirname(backupPath), { recursive: true });
  copyFileSync(target, backupPath);
  return backupPath;
}

export function writeRepoFile(target: string, contents: string): WriteResult {
  const relativePath = assertWritable(target);
  // Reconstructed from the guard's own answer, so the bytes land where the guard
  // looked — not at the caller's path, which may resolve elsewhere.
  const resolved = path.resolve(repoRoot(), relativePath);
  const backupPath = savePreImage(resolved, relativePath);
  writeFileSync(resolved, contents, 'utf8');
  return { relativePath, backupPath };
}
