// @Architecture(type=Module, descriptionShort="Pure start/end regex range extraction", descriptionLong="Replaces sed -n '/start/,/end/p'. Inclusive of both boundary lines, matching sed, so a markdown section slice includes the heading that terminates it — the caller can drop it. An unmatched end runs to EOF rather than returning nothing.")
export interface SectionSlice {
  lines: string[];
  startLine: number | null;
  endLine: number | null;
}

const NotFound = -1;

export function sliceSection(lines: readonly string[], start: RegExp, end: RegExp): SectionSlice {
  const startIndex = lines.findIndex((line) => start.test(line));
  if (startIndex === NotFound) return { lines: [], startLine: null, endLine: null };
  const rest = lines.slice(startIndex + 1);
  const relativeEnd = rest.findIndex((line) => end.test(line));
  const endIndex = relativeEnd === NotFound ? lines.length - 1 : startIndex + 1 + relativeEnd;
  return {
    lines: lines.slice(startIndex, endIndex + 1),
    startLine: startIndex + 1,
    endLine: endIndex + 1,
  };
}
