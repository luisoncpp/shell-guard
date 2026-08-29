// @Architecture(type=Module, descriptionShort="Runs the project's quality gates", descriptionLong="Reads .shgd.json when present (else RootGates or workspaceGates), filters by --only/--quick/--test, and spawns each admitted gate with the correct cwd and spawn path (npm shell, PATH tool, or repo script). --list prints the resolved table without spawning. Exists so agents stop composing an unparseable multi-command shell line that always triggers a permission prompt.")
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ParsedArgs } from '../lib/argv';
import { applyTestSelector, formatGateListing, type Gate } from '../lib/checkConfig';
import { Limits } from '../lib/constants';
import { RootGates, assertTestPath, assertWorkspaceName, workspaceGates } from '../lib/gatePlan';
import { tryReadRootShgdConfig, tryReadShgdConfig } from '../lib/loadShgdConfig';
import { repoRoot } from '../lib/paths';
import { resolveInsideRepo } from '../lib/repoFile';
import { runPathTool, runRepoTool, runTool } from '../lib/run';
import type { VerbResult } from '../lib/verb';

function packageScripts(directory: string): string[] {
  const manifest = path.join(directory, 'package.json');
  if (!existsSync(manifest)) return [];
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { scripts?: Record<string, unknown> };
    return Object.keys(parsed.scripts ?? {});
  } catch {
    return [];
  }
}

function gatesForWorkspace(name: string): { gates: readonly Gate[]; cwd: string } {
  assertWorkspaceName(name);
  const directory = resolveInsideRepo(name, 'read');
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`unknown --project "${name}" (no such directory in the repository)`);
  }
  const config = tryReadShgdConfig(`${name}/.shgd.json`);
  if (config) return { gates: config.gates, cwd: directory };
  return {
    gates: workspaceGates(name, {
      hasTsconfig: existsSync(path.join(directory, 'tsconfig.json')),
      scripts: packageScripts(directory),
    }),
    cwd: directory,
  };
}

function resolveProject(args: ParsedArgs): { gates: readonly Gate[]; cwd: string } {
  const projectName = args.options.get('project') ?? 'root';
  if (projectName === 'root') {
    const config = tryReadRootShgdConfig();
    if (config) return { gates: config.gates, cwd: repoRoot() };
    return { gates: RootGates, cwd: repoRoot() };
  }
  return gatesForWorkspace(projectName);
}

function selectGates(args: ParsedArgs): { gates: readonly Gate[]; cwd: string } {
  const { gates, cwd } = resolveProject(args);
  const projectName = args.options.get('project') ?? 'root';
  const only = args.options.get('only');
  if (only && !gates.some((gate) => gate.name === only)) {
    throw new Error(`--only=${only} is not a gate of --project=${projectName}`);
  }
  const requested = args.options.get('test');
  const testPath = requested === undefined ? undefined : assertTestPath(requested);
  const named = only ? gates.filter((gate) => gate.name === only) : gates;
  const focused = testPath ? named.map((gate) => applyTestSelector(gate, testPath)) : named;
  const filtered = focused.filter((gate) => !args.flags.has('quick') || gate.inQuickRun);
  return { gates: filtered, cwd };
}

function tail(text: string): string[] {
  return text.split('\n').filter((line) => line.trim().length > 0).slice(-Limits.TailLines);
}

function runGate(gate: Gate, cwd: string) {
  switch (gate.spawn.kind) {
    case 'npm':
      return runTool(gate.spawn.command, gate.args, cwd);
    case 'path':
      return runPathTool(gate.spawn.command, gate.args, cwd);
    case 'repo': {
      const absolute = resolveInsideRepo(gate.spawn.command, 'read');
      if (!existsSync(absolute) || !statSync(absolute).isFile()) {
        throw new Error(`gate "${gate.name}" command is not a file: ${gate.spawn.command}`);
      }
      return runRepoTool(absolute, gate.args, cwd);
    }
  }
}

export function check(args: ParsedArgs): VerbResult {
  const { gates, cwd } = selectGates(args);
  if (args.flags.has('list')) {
    return { lines: formatGateListing(gates), code: 0 };
  }
  const lines: string[] = [];
  const failed: string[] = [];
  for (const gate of gates) {
    const result = runGate(gate, cwd);
    const passed = result.code === 0;
    lines.push('', `--- ${gate.name}: ${passed ? 'PASS' : `FAIL (exit ${result.code})`} ---`);
    if (passed) continue;
    failed.push(gate.name);
    lines.push(...tail(`${result.stdout}\n${result.stderr}`));
  }
  lines.push('', `=== ${failed.length === 0 ? 'all gates passed' : `failed: ${failed.join(', ')}`} ===`);
  return { lines, code: failed.length === 0 ? 0 : 1 };
}
