// @Architecture(type=Module, descriptionShort="Single choke point for every tl file write", descriptionLong="Enforces the write toggle, repository containment and a protected-path list before writing, and copies the current file to TL_TMP/backups first. The protected list re-implements Claude Code's own, because a blanket Bash(tl:*) allow rule bypasses that permission layer; any verb writing with bare writeFileSync silently defeats this guard.")
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { backupDir, isInsideRepo, toRepoRelative } from './paths';

const ProtectedDirectories = new Set([
  '.git', '.claude', '.vscode', '.idea', '.husky', '.cargo',
  '.devcontainer', '.yarn', '.mvn', 'node_modules',
]);

const ProtectedFiles = new Set([
  '.gitconfig', '.gitmodules', '.npmrc', '.yarnrc', '.yarnrc.yml',
  '.mcp.json', '.claude.json', '.envrc', '.pre-commit-config.yaml',
]);

export interface WriteResult {
  relativePath: string;
  backupPath: string | null;
}

export function isWriteEnabled(): boolean {
  return process.env.TL_WRITE !== '0' && process.env.TL_NO_WRITE !== '1';
}

export function findProtectedSegment(relativePath: string): string | null {
  const segments = relativePath.split('/');
  const protectedDirectory = segments.find((segment) => ProtectedDirectories.has(segment));
  if (protectedDirectory) return protectedDirectory;
  const basename = segments[segments.length - 1];
  return ProtectedFiles.has(basename) ? basename : null;
}

export function assertWritable(target: string): string {
  if (!isWriteEnabled()) {
    throw new Error('tl writes are disabled (TL_WRITE=0 / TL_NO_WRITE=1). Re-run without it to allow edits.');
  }
  if (!isInsideRepo(target)) {
    throw new Error(`refusing to write outside the repository: ${target}`);
  }
  const relativePath = toRepoRelative(target);
  const blocked = findProtectedSegment(relativePath);
  if (blocked) {
    throw new Error(`refusing to write protected path (${blocked}): ${relativePath}`);
  }
  return relativePath;
}

function savePreImage(target: string, relativePath: string): string | null {
  if (!existsSync(target)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const flattened = relativePath.replace(/[\\/]/g, '__');
  const backupPath = path.join(backupDir(), `${stamp}__${flattened}`);
  copyFileSync(target, backupPath);
  return backupPath;
}

export function writeRepoFile(target: string, contents: string): WriteResult {
  const relativePath = assertWritable(target);
  const backupPath = savePreImage(target, relativePath);
  writeFileSync(target, contents, 'utf8');
  return { relativePath, backupPath };
}
