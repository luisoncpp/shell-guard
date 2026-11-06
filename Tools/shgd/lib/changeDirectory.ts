// @Architecture(type=Module, descriptionShort="Leading -C <dir> option, like git -C", descriptionLong="Consumes one or more -C <dir> pairs before the verb and chdirs into each in turn, so every later step (repo root, git children, gate commands) sees the target directory as its cwd. Relative paths chain the way git -C chains them. Runs before verb dispatch and before any repo lookup, which is why it cannot live in argv.ts: the single-dash rule there would reject -C.")
import { statSync } from 'node:fs';

const ChangeDirectoryFlag = '-C';

/**
 * Strips every leading `-C <dir>` pair from argv and changes the process directory
 * into each one in order. Returns the argv that remains, starting at the verb.
 */
export function applyChangeDirectory(argv: readonly string[]): string[] {
  let index = 0;
  while (argv[index] === ChangeDirectoryFlag) {
    const directory = argv[index + 1];
    if (directory === undefined) throw new Error('-C needs a directory, e.g. shgd -C <dir> status');
    assertDirectory(directory);
    process.chdir(directory);
    index += 2;
  }
  return argv.slice(index);
}

function assertDirectory(directory: string): void {
  let isDirectory = false;
  try {
    isDirectory = statSync(directory).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) throw new Error(`-C: "${directory}" is not a directory`);
}
