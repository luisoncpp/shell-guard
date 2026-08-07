// @Architecture(type=Module, descriptionShort="Pathspec expansion through git ls-files, shared by the file-walking verbs", descriptionLong="The one place a pathspec becomes a concrete file list, so `each` and `replace` cannot drift apart on which files they consider. Discovery goes through git rather than a filesystem walk: pathspecs stay git pathspecs and .gitignored files are excluded for free, which is what keeps node_modules out of a glob. The cap is a caller-supplied argument because a read-only sweep and a rewrite tolerate different blast radii.")
import { Limits } from './constants';
import { assertSafePathspecs } from './gitArgs';
import { gitLines } from './run';

export interface FileScan {
  usage: string;
  cap?: number;
}

export function listRepoFiles(pathspecs: readonly string[], scan: FileScan): string[] {
  const safe = assertSafePathspecs(pathspecs);
  if (safe.length === 0) throw new Error(scan.usage);
  const files = gitLines(['ls-files', '--cached', '--others', '--exclude-standard', '--', ...safe]);
  const cap = scan.cap ?? Limits.EachMaxFiles;
  if (files.length > cap) {
    throw new Error(`${files.length} files match; the cap is ${cap} — narrow the pathspec`);
  }
  return files;
}
