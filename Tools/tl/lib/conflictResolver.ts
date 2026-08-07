// @Architecture(type=Module, descriptionShort="Pure git conflict marker state machine", descriptionLong="Classifies conflict markers and rewrites a conflicted file's lines by keeping a chosen side per hunk. Deliberately IO-free so the resolution rules are unit-testable in-process; writeGuard performs the actual write. Drops diff3 base sections unconditionally and refuses a per-hunk spec that does not name every hunk.")
import { ConflictMarkers, type ConflictSide } from './constants';

type Section = ConflictSide | 'base' | 'none';

interface ClassifiedLine {
  section: Section;
  isMarker: boolean;
  opensHunk: boolean;
}

export type SideChooser = (hunkIndex: number) => ConflictSide;

// `currentSection === 'none'` means we are outside a conflict, where a bare
// `=======` is ordinary content (a markdown underline) rather than a marker.
export function classifyLine(line: string, currentSection: Section): ClassifiedLine {
  if (line.startsWith(ConflictMarkers.Ours)) return { section: 'ours', isMarker: true, opensHunk: true };
  if (currentSection === 'none') return { section: 'none', isMarker: false, opensHunk: false };
  if (line.startsWith(ConflictMarkers.Base)) return { section: 'base', isMarker: true, opensHunk: false };
  if (line.startsWith(ConflictMarkers.Separator)) return { section: 'theirs', isMarker: true, opensHunk: false };
  if (line.startsWith(ConflictMarkers.Theirs)) return { section: 'none', isMarker: true, opensHunk: false };
  return { section: currentSection, isMarker: false, opensHunk: false };
}

export function countHunks(lines: readonly string[]): number {
  return lines.filter((line) => line.startsWith(ConflictMarkers.Ours)).length;
}

// diff3/zdiff3 base sections are always dropped — keeping them was the silent
// corruption mode of hand-rolled awk resolvers.
export function resolveLines(lines: readonly string[], chooseSide: SideChooser): string[] {
  const output: string[] = [];
  let hunkIndex = 0;
  let section: Section = 'none';
  for (const line of lines) {
    const step = classifyLine(line, section);
    section = step.section;
    if (step.opensHunk) hunkIndex += 1;
    if (step.isMarker || section === 'base') continue;
    if (section !== 'none' && section !== chooseSide(hunkIndex)) continue;
    output.push(line);
  }
  return output;
}

function parseSpecPairs(spec: string): Map<number, ConflictSide> {
  const chosen = new Map<number, ConflictSide>();
  for (const pair of spec.split(',')) {
    const [rawIndex, rawSide] = pair.split('=');
    const index = Number(rawIndex);
    const isValid = Number.isInteger(index) && (rawSide === 'ours' || rawSide === 'theirs');
    if (!isValid) throw new Error(`bad spec segment "${pair}" (expected N=ours or N=theirs)`);
    chosen.set(index, rawSide as ConflictSide);
  }
  return chosen;
}

function assertFullCoverage(chosen: Map<number, ConflictSide>, hunkCount: number): void {
  const missing: number[] = [];
  for (let index = 1; index <= hunkCount; index += 1) {
    if (!chosen.has(index)) missing.push(index);
  }
  if (missing.length === 0) return;
  throw new Error(`spec must cover every hunk; missing ${missing.join(', ')} of ${hunkCount}`);
}

export function parseSpec(spec: string, hunkCount: number): SideChooser {
  if (spec === 'ours' || spec === 'theirs') return () => spec;
  const chosen = parseSpecPairs(spec);
  assertFullCoverage(chosen, hunkCount);
  return (index) => chosen.get(index) as ConflictSide;
}
