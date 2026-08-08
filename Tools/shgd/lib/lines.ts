// @Architecture(type=Module, descriptionShort="Line-ending-safe splitting of file contents", descriptionLong="readFileSync(...).split('\\n') leaves a trailing \\r on every line of a CRLF file, and JavaScript treats \\r as a line terminator that `.` will not match — so any $-anchored regex silently fails against Windows files. Every read-only verb splits here instead. Deliberately NOT used by the conflict resolver, which rejoins with \\n and must leave existing line endings alone.")
const LineBreak = /\r?\n/;

export function splitLines(contents: string): string[] {
  return contents.split(LineBreak);
}
