import { ExpectedFallowSchemaVersion } from "../lib/constants";
import {
  deadCodeLines,
  newGroupLines,
  parseSection,
  reduceAudit,
  reduceDupes,
  schemaWarning,
  type AuditReport,
  type DupesReport,
} from "../lib/fallowReport";

function auditFixture(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    schema_version: ExpectedFallowSchemaVersion,
    verdict: "pass",
    base_ref: "origin/develop",
    changed_files_count: 3,
    attribution: {
      gate: "new-only",
      dead_code_introduced: 0,
      dead_code_inherited: 0,
      complexity_introduced: 0,
      complexity_inherited: 1,
    },
    complexity: { findings: [] },
    ...overrides,
  };
}

describe("schemaWarning", () => {
  it("stays silent on the pinned version", () => {
    expect(schemaWarning(ExpectedFallowSchemaVersion)).toBeNull();
  });

  it("warns on any other version, including undefined", () => {
    expect(schemaWarning(ExpectedFallowSchemaVersion + 1)).toContain("expected");
    expect(schemaWarning(undefined)).toContain("expected");
  });
});

describe("reduceAudit", () => {
  it("passes only when the verdict passes and nothing was introduced", () => {
    expect(reduceAudit(auditFixture()).passed).toBe(true);
  });

  it("fails when the verdict fails", () => {
    expect(reduceAudit(auditFixture({ verdict: "fail" })).passed).toBe(false);
  });

  it("fails when the verdict passes but something was introduced", () => {
    const introduced = auditFixture({
      attribution: { gate: "new-only", complexity_introduced: 2, complexity_inherited: 0 },
    });
    const reduced = reduceAudit(introduced);
    expect(reduced.passed).toBe(false);
    expect(reduced.lines.some((line) => line.includes("introduced total: 2"))).toBe(true);
  });

  it("pairs each introduced counter with its inherited counterpart", () => {
    const line = reduceAudit(auditFixture()).lines.find((row) => row.includes("complexity "));
    expect(line).toContain("introduced=0");
    expect(line).toContain("inherited=1");
  });

  it("lists complexity findings with severity first", () => {
    const withFinding = auditFixture({
      complexity: {
        findings: [
          { path: "a.ts", name: "fn", line: 4, cyclomatic: 7, cognitive: 9, severity: "high" },
        ],
      },
    });
    const lines = reduceAudit(withFinding).lines;
    expect(lines.some((line) => line.includes("high a.ts:4 fn cyclomatic=7 cognitive=9"))).toBe(true);
  });

  it("omits the findings block entirely when there are none", () => {
    expect(reduceAudit(auditFixture()).lines.some((line) => line.includes("complexity findings"))).toBe(false);
  });

  it("surfaces a schema warning as the first line", () => {
    const stale = reduceAudit(auditFixture({ schema_version: 999 }));
    expect(stale.lines[0]).toContain("WARNING");
  });

  it("survives a report missing attribution and complexity", () => {
    const reduced = reduceAudit({ schema_version: ExpectedFallowSchemaVersion, verdict: "pass" });
    expect(reduced.passed).toBe(true);
    expect(reduced.lines.some((line) => line.includes("introduced total: 0"))).toBe(true);
  });
});

describe("reduceDupes", () => {
  it("reports stats and each clone group's instances", () => {
    const reduced = reduceDupes({
      schema_version: ExpectedFallowSchemaVersion,
      stats: { clone_groups: 1, duplicated_lines: 12, duplication_percentage: 2.294 },
      clone_groups: [
        { fingerprint: "dup:abc", line_count: 6, instances: [{ file: "a.ts", start_line: 3 }, { file: "b.ts", start_line: 9 }] },
      ],
    });
    expect(reduced.lines[0]).toContain("clone groups: 1");
    expect(reduced.lines[0]).toContain("2.29%");
    expect(reduced.lines[1]).toContain("dup:abc 6L  a.ts:3 | b.ts:9");
  });

  it("survives a report with no stats or groups", () => {
    const reduced = reduceDupes({ schema_version: ExpectedFallowSchemaVersion });
    expect(reduced.passed).toBe(true);
    expect(reduced.lines[0]).toContain("clone groups: 0");
  });
});

describe("parseSection", () => {
  it.each([
    ["complexity", "complexity"],
    ["all", "all"],
    ["dead-exports", "dead-exports"],
    ["dead-code", "dead-exports"],
  ])("accepts %s", (raw, expected) => {
    expect(parseSection(raw)).toBe(expected);
  });

  it("names the valid sections when given a bad one", () => {
    expect(() => parseSection("dupes")).toThrow("expected complexity | dead-exports | all");
  });
});

// Field names below are taken from a real fallow 2.91.0 audit document, not invented —
// they are what pins this module against a schema change.
const DeadCodeFixture = {
  schema_version: ExpectedFallowSchemaVersion,
  total_issues: 3,
  entry_points: { total: 245 },
  summary: { unused_exports: 1 },
  unused_files: [],
  unused_exports: [{ path: "a.ts", export_name: "helper", line: 40, introduced: true }],
  unresolved_imports: [{ path: "b.ts", specifier: "../missing", line: 5, introduced: false }],
};

describe("deadCodeLines", () => {
  it("prints one block per non-empty section, marking introduced entries", () => {
    const lines = deadCodeLines(DeadCodeFixture);
    expect(lines).toContain("  unused_exports (1):");
    expect(lines.some((line) => line.includes("introduced a.ts:40 helper"))).toBe(true);
    expect(lines.some((line) => line.includes("inherited  b.ts:5 ../missing"))).toBe(true);
  });

  it("skips empty sections and the metadata keys that are not sections", () => {
    const lines = deadCodeLines(DeadCodeFixture).join("\n");
    expect(lines).not.toContain("unused_files");
    expect(lines).not.toContain("entry_points");
    expect(lines).not.toContain("summary");
    expect(lines).not.toContain("total_issues");
  });

  it("returns nothing when every section is empty", () => {
    expect(deadCodeLines({ unused_exports: [], summary: {} })).toEqual([]);
  });

  it("returns nothing when dead_code is absent", () => {
    expect(deadCodeLines(undefined)).toEqual([]);
  });
});

describe("reduceAudit sections", () => {
  const withBoth = auditFixture({
    complexity: { findings: [{ path: "a.ts", name: "fn", line: 4, cyclomatic: 7, cognitive: 9, severity: "high" }] },
    dead_code: DeadCodeFixture,
  });

  it("shows only complexity by default", () => {
    const text = reduceAudit(withBoth).lines.join("\n");
    expect(text).toContain("complexity findings");
    expect(text).not.toContain("dead code:");
  });

  it("shows only dead code for --section=dead-exports", () => {
    const text = reduceAudit(withBoth, "dead-exports").lines.join("\n");
    expect(text).toContain("dead code:");
    expect(text).not.toContain("complexity findings");
  });

  it("shows both for --section=all", () => {
    const text = reduceAudit(withBoth, "all").lines.join("\n");
    expect(text).toContain("complexity findings");
    expect(text).toContain("dead code:");
  });
});

function dupesWith(fingerprints: readonly string[]): DupesReport {
  return {
    schema_version: ExpectedFallowSchemaVersion,
    clone_groups: fingerprints.map((fingerprint) => ({
      fingerprint,
      line_count: 6,
      instances: [{ file: "a.ts", start_line: 1 }],
    })),
  };
}

describe("newGroupLines", () => {
  it("passes and lists nothing when no group is new", () => {
    const reduced = newGroupLines(dupesWith(["dup:a"]), dupesWith(["dup:a", "dup:b"]));
    expect(reduced.passed).toBe(true);
    expect(reduced.lines[0]).toContain("new: 0");
  });

  it("fails and names only the groups absent from the baseline", () => {
    const reduced = newGroupLines(dupesWith(["dup:a", "dup:new"]), dupesWith(["dup:a"]));
    expect(reduced.passed).toBe(false);
    expect(reduced.lines[0]).toContain("new: 1");
    expect(reduced.lines[1]).toContain("dup:new");
    expect(reduced.lines.join("\n")).not.toContain("dup:a ");
  });

  it("counts groups that disappeared since the baseline", () => {
    expect(newGroupLines(dupesWith([]), dupesWith(["dup:a", "dup:b"])).lines[0]).toContain("gone: 2");
  });
});
