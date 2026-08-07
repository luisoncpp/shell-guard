// @Architecture(type=Module, descriptionShort="Runs the project's quality gates", descriptionLong="Executes tsc --noEmit, npm run lint and npm run test:jest in order, returning per-gate PASS/FAIL plus the tail of any failing output. Exists so agents stop composing an unparseable three-command shell line that always triggers a permission prompt. The executable set is a compile-time table: --project names a workspace directory and selects a gate template, it never supplies a command.")
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ParsedArgs } from '../lib/argv';
import { Limits } from '../lib/constants';
import type { Gate } from '../lib/gatePlan';
import { RootGates, assertWorkspaceName, workspaceGates } from '../lib/gatePlan';
import { isInsideRepo, repoRoot } from '../lib/paths';
import { runTool } from '../lib/run';
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

function gatesForWorkspace(name: string): readonly Gate[] {
  assertWorkspaceName(name);
  const directory = path.resolve(repoRoot(), name);
  if (!isInsideRepo(directory) || !existsSync(directory)) {
    throw new Error(`unknown --project "${name}" (no such directory in the repository)`);
  }
  return workspaceGates(name, {
    hasTsconfig: existsSync(path.join(directory, 'tsconfig.json')),
    scripts: packageScripts(directory),
  });
}

function tail(text: string): string[] {
  return text.split('\n').filter((line) => line.trim().length > 0).slice(-Limits.TailLines);
}

function focusedJest(gate: Gate, testPath: string): Gate {
  if (gate.name !== 'jest') return gate;
  return { ...gate, args: [...gate.args, '--', testPath], inQuickRun: true };
}

function selectGates(args: ParsedArgs): readonly Gate[] {
  const projectName = args.options.get('project') ?? 'root';
  const project = projectName === 'root' ? RootGates : gatesForWorkspace(projectName);
  const only = args.options.get('only');
  if (only && !project.some((gate) => gate.name === only)) {
    throw new Error(`--only=${only} is not a gate of --project=${projectName}`);
  }
  const testPath = args.options.get('test');
  const named = only ? project.filter((gate) => gate.name === only) : project;
  const focused = testPath ? named.map((gate) => focusedJest(gate, testPath)) : named;
  return focused.filter((gate) => !args.flags.has('quick') || gate.inQuickRun);
}

export function check(args: ParsedArgs): VerbResult {
  const lines: string[] = [];
  const failed: string[] = [];
  for (const gate of selectGates(args)) {
    const result = runTool(gate.command, gate.args);
    const passed = result.code === 0;
    lines.push('', `--- ${gate.name}: ${passed ? 'PASS' : `FAIL (exit ${result.code})`} ---`);
    if (passed) continue;
    failed.push(gate.name);
    lines.push(...tail(`${result.stdout}\n${result.stderr}`));
  }
  lines.push('', `=== ${failed.length === 0 ? 'all gates passed' : `failed: ${failed.join(', ')}`} ===`);
  return { lines, code: failed.length === 0 ? 0 : 1 };
}
