// @Architecture(type=Module, descriptionShort="Pure fallow JSON to report-line reduction", descriptionLong="Turns a parsed `fallow --format json` document into printable lines plus a pass/fail decision, warning when schema_version drifts from the pinned expectation. IO-free so the field names it depends on are pinned by unit tests rather than discovered by hand-parsing in a shell one-liner. Covers the complexity findings, the dead-code sections, and a baseline comparison that reports only newly appeared clone groups.")
import { ExpectedFallowSchemaVersion } from './constants';

export interface ComplexityFinding {
  path: string;
  name: string;
  line: number;
  cyclomatic: number;
  cognitive: number;
  severity: string;
  introduced?: boolean;
}

/** Shared shape of every dead_code section entry; each section fills a different subset. */
interface DeadCodeEntry {
  path?: string;
  line?: number;
  export_name?: string;
  specifier?: string;
  introduced?: boolean;
}

export interface AuditReport {
  schema_version?: number;
  verdict?: string;
  base_ref?: string;
  changed_files_count?: number;
  attribution?: Record<string, string | number>;
  complexity?: { findings?: ComplexityFinding[] };
  dead_code?: Record<string, unknown>;
}

export interface DupesReport {
  schema_version?: number;
  stats?: { clone_groups: number; duplicated_lines: number; duplication_percentage: number };
  clone_groups?: { fingerprint: string; line_count: number; instances: { file: string; start_line: number }[] }[];
}

export interface ReducedReport {
  lines: string[];
  passed: boolean;
}

export type AuditSection = 'complexity' | 'dead-exports' | 'all';

const NonSectionKeys = new Set(['schema_version', 'version', 'elapsed_ms', 'total_issues', 'entry_points', 'summary']);

export function parseSection(raw: string): AuditSection {
  if (raw === 'complexity' || raw === 'all') return raw;
  if (raw === 'dead-exports' || raw === 'dead-code') return 'dead-exports';
  throw new Error(`unknown --section "${raw}" (expected complexity | dead-exports | all)`);
}

export function schemaWarning(schemaVersion: number | undefined): string | null {
  if (schemaVersion === ExpectedFallowSchemaVersion) return null;
  return `WARNING: fallow schema_version ${schemaVersion}, expected ${ExpectedFallowSchemaVersion}. Field names below may be stale.`;
}

function attributionLines(attribution: Record<string, string | number>): { lines: string[]; introduced: number } {
  const introducedEntries = Object.entries(attribution).filter(([key]) => key.endsWith('_introduced'));
  const introduced = introducedEntries.reduce((sum, [, value]) => sum + Number(value), 0);
  const lines = [`gate: ${attribution.gate} | introduced total: ${introduced}`];
  for (const [key, value] of introducedEntries) {
    const label = key.replace('_introduced', '');
    const inherited = attribution[`${label}_inherited`];
    lines.push(`  ${label.padEnd(12)} introduced=${value} inherited=${inherited}`);
  }
  return { lines, introduced };
}

function marker(introduced: boolean | undefined): string {
  return introduced ? 'introduced' : 'inherited ';
}

function complexityLines(findings: readonly ComplexityFinding[]): string[] {
  if (findings.length === 0) return [];
  const lines = ['', 'complexity findings (read severity, not the count — see docs/lessons-learned/fallow-crap-penalises-extraction.md):'];
  for (const finding of findings) {
    lines.push(`  ${marker(finding.introduced)} ${finding.severity} ${finding.path}:${finding.line} ${finding.name} cyclomatic=${finding.cyclomatic} cognitive=${finding.cognitive}`);
  }
  return lines;
}

function describeEntry(entry: DeadCodeEntry): string {
  const name = entry.export_name ?? entry.specifier ?? '';
  return `  ${marker(entry.introduced)} ${entry.path}:${entry.line} ${name}`.trimEnd();
}

export function deadCodeLines(deadCode: Record<string, unknown> | undefined): string[] {
  if (!deadCode) return [];
  const lines: string[] = [];
  for (const [section, value] of Object.entries(deadCode)) {
    if (NonSectionKeys.has(section) || !Array.isArray(value) || value.length === 0) continue;
    lines.push(`  ${section} (${value.length}):`);
    for (const entry of value as DeadCodeEntry[]) lines.push(`  ${describeEntry(entry)}`);
  }
  return lines.length === 0 ? [] : ['', 'dead code:', ...lines];
}

export function reduceAudit(report: AuditReport, section: AuditSection = 'complexity'): ReducedReport {
  const lines: string[] = [];
  const warning = schemaWarning(report.schema_version);
  if (warning) lines.push(warning);
  lines.push(`verdict: ${report.verdict} | base: ${report.base_ref} | changed files: ${report.changed_files_count}`);
  const attribution = attributionLines(report.attribution ?? {});
  lines.push(...attribution.lines);
  if (section !== 'dead-exports') lines.push(...complexityLines(report.complexity?.findings ?? []));
  if (section !== 'complexity') lines.push(...deadCodeLines(report.dead_code));
  return { lines, passed: report.verdict === 'pass' && attribution.introduced === 0 };
}

function groupLine(group: NonNullable<DupesReport['clone_groups']>[number]): string {
  const files = group.instances.map((instance) => `${instance.file}:${instance.start_line}`).join(' | ');
  return `  ${group.fingerprint} ${group.line_count}L  ${files}`;
}

export function reduceDupes(report: DupesReport): ReducedReport {
  const lines: string[] = [];
  const warning = schemaWarning(report.schema_version);
  if (warning) lines.push(warning);
  const stats = report.stats;
  const percentage = stats ? stats.duplication_percentage.toFixed(2) : '?';
  lines.push(`clone groups: ${stats?.clone_groups ?? 0} | duplicated lines: ${stats?.duplicated_lines ?? 0} | ${percentage}%`);
  for (const group of report.clone_groups ?? []) lines.push(groupLine(group));
  return { lines, passed: true };
}

/** Replaces the hand-written fingerprint set an agent would otherwise paste into `node -e`. */
export function newGroupLines(current: DupesReport, baseline: DupesReport): ReducedReport {
  const known = new Set((baseline.clone_groups ?? []).map((group) => group.fingerprint));
  const appeared = (current.clone_groups ?? []).filter((group) => !known.has(group.fingerprint));
  const resolved = known.size - ((current.clone_groups ?? []).length - appeared.length);
  const lines = [
    `baseline groups: ${known.size} | current: ${current.clone_groups?.length ?? 0} | new: ${appeared.length} | gone: ${resolved}`,
    ...appeared.map(groupLine),
  ];
  return { lines, passed: appeared.length === 0 };
}
