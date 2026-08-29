// @Architecture(type=Module, descriptionShort="Confined reader for .shgd.json", descriptionLong="IO wrapper around parseCheckConfig: exists-check then readRepoText so a symlink out of the tree cannot feed check, fallow, diffstat or history. Missing file is undefined (callers keep compile-time defaults); a present but invalid file is a refusal, not a silent fallback.")
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseCheckConfig, type ShgdConfig } from './checkConfig';
import { repoRoot } from './paths';
import { readRepoText } from './repoFile';

export function tryReadShgdConfig(relativePath: string): ShgdConfig | undefined {
  const absolute = path.resolve(repoRoot(), relativePath);
  if (!existsSync(absolute)) return undefined;
  const text = readRepoText(relativePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid ${relativePath}: ${(error as Error).message}`);
  }
  try {
    return parseCheckConfig(parsed);
  } catch (error) {
    throw new Error(`invalid ${relativePath}: ${(error as Error).message}`);
  }
}

export function tryReadRootShgdConfig(): ShgdConfig | undefined {
  return tryReadShgdConfig('.shgd.json');
}
