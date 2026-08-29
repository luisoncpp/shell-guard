// @Architecture(type=Module, descriptionShort="Admits .shgd.json into a gate table", descriptionLong="Pure parser for the v1 check-config schema: schema version, unique gate names, command and argument admission (PATH basename vs repo-relative path, shell denylist, npm shell-safe args vs no-shell data args), at most one role:test gate, and optional diffBase/sourceExtensions. No filesystem access — verbs/check.ts reads the file and supplies existence facts for repo commands at spawn time.")
import { assertShellSafeRef } from './gitArgs';
import { isRepoRelativePath, isShellSafeArgument } from './shellSafety';

export type GateSpawn =
  | { kind: 'npm'; command: 'npm' | 'npx' }
  | { kind: 'path'; command: string }
  | { kind: 'repo'; command: string };

export interface Gate {
  name: string;
  spawn: GateSpawn;
  args: readonly string[];
  inQuickRun: boolean;
  role?: 'test';
}

export interface ShgdConfig {
  schemaVersion: 1;
  gates: readonly Gate[];
  diffBase?: string;
  sourceExtensions?: readonly string[];
}

const GateName = /^[A-Za-z][A-Za-z0-9_-]*$/;
const PathBasename = /^[A-Za-z0-9._+-]+$/;
const SourceExtension = /^\.[A-Za-z0-9]+$/;
const RefusedShells = new Set(['sh', 'bash', 'zsh', 'fish', 'cmd', 'cmd.exe', 'command', 'powershell', 'pwsh']);
const RefusedFirstArgs = new Set(['-c', '-e', '--eval', '-Command', '-EncodedCommand', '/c']);
const WindowsScriptSuffix = /\.(cmd|bat)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
}

function refuseNulOrNewline(value: string, label: string): void {
  if (value.includes('\0') || value.includes('\n') || value.includes('\r')) {
    throw new Error(`refusing ${label} "${value}": arguments may not contain NUL or raw newlines`);
  }
}

function classifyCommand(command: string): GateSpawn {
  if (command.includes('/')) {
    if (!isRepoRelativePath(command)) {
      throw new Error(`refusing gate command "${command}": expected a repo-relative path`);
    }
    if (WindowsScriptSuffix.test(command)) {
      throw new Error(`refusing gate command "${command}": .cmd/.bat wrappers need a shell in v1`);
    }
    return { kind: 'repo', command };
  }
  if (!PathBasename.test(command) || command.startsWith('-')) {
    throw new Error(`refusing gate command "${command}": expected a PATH basename or repo-relative path`);
  }
  if (RefusedShells.has(command.toLowerCase())) {
    throw new Error(`refusing gate command "${command}": shell interpreters are not allowed`);
  }
  if (command === 'npm' || command === 'npx') {
    return { kind: 'npm', command };
  }
  return { kind: 'path', command };
}

function admitArgs(spawn: GateSpawn, args: readonly string[], gateLabel: string): readonly string[] {
  if (args.length > 0 && RefusedFirstArgs.has(args[0])) {
    throw new Error(`refusing ${gateLabel} first argument "${args[0]}": interpreter flags are not allowed`);
  }
  for (const arg of args) {
    if (spawn.kind === 'npm') {
      if (!isShellSafeArgument(arg)) {
        throw new Error(`refusing ${gateLabel} argument "${arg}": npm/npx arguments must be shell-safe`);
      }
      continue;
    }
    refuseNulOrNewline(arg, `${gateLabel} argument`);
  }
  return Object.freeze([...args]);
}

function parseGate(raw: unknown, index: number): Gate {
  if (!isRecord(raw)) throw new Error(`gates[${index}] must be an object`);
  const name = requireString(raw.name, `gates[${index}].name`);
  if (!GateName.test(name)) {
    throw new Error(`refusing gate name "${name}": expected /^[A-Za-z][A-Za-z0-9_-]*$/`);
  }
  const command = requireString(raw.command, `gates[${index}].command`);
  const spawn = classifyCommand(command);
  if (!Array.isArray(raw.args)) throw new Error(`gates[${index}].args must be an array`);
  const args = raw.args.map((arg, argIndex) => requireString(arg, `gates[${index}].args[${argIndex}]`));
  const inQuickRun = requireBoolean(raw.inQuickRun, `gates[${index}].inQuickRun`);
  const gate: Gate = {
    name,
    spawn,
    args: admitArgs(spawn, args, `gates[${index}]`),
    inQuickRun,
  };
  if (raw.role !== undefined) {
    if (raw.role !== 'test') throw new Error(`gates[${index}].role must be "test" when present`);
    gate.role = 'test';
  }
  return gate;
}

function parseSourceExtensions(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('sourceExtensions must be a non-empty array of strings');
  }
  const extensions = value.map((entry, index) => {
    const extension = requireString(entry, `sourceExtensions[${index}]`);
    if (!SourceExtension.test(extension)) {
      throw new Error(`refusing sourceExtensions entry "${extension}": expected /^\\.[A-Za-z0-9]+$/`);
    }
    return extension;
  });
  return Object.freeze(extensions);
}

export function parseCheckConfig(raw: unknown): ShgdConfig {
  if (!isRecord(raw)) throw new Error('.shgd.json must be a JSON object');
  if (raw.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion ${String(raw.schemaVersion)} (expected 1)`);
  }
  if (!Array.isArray(raw.gates) || raw.gates.length === 0) {
    throw new Error('gates must be a non-empty array');
  }
  const names = new Set<string>();
  let testRole: string | undefined;
  const gates = raw.gates.map((entry, index) => {
    const gate = parseGate(entry, index);
    if (names.has(gate.name)) throw new Error(`duplicate gate name "${gate.name}"`);
    names.add(gate.name);
    if (gate.role === 'test') {
      if (testRole !== undefined) throw new Error(`multiple gates have role "test" (${testRole} and ${gate.name})`);
      testRole = gate.name;
    }
    return gate;
  });
  const config: ShgdConfig = {
    schemaVersion: 1,
    gates: Object.freeze(gates),
  };
  if (raw.diffBase !== undefined) {
    config.diffBase = assertShellSafeRef(requireString(raw.diffBase, 'diffBase'), 'diffBase');
  }
  if (raw.sourceExtensions !== undefined) {
    config.sourceExtensions = parseSourceExtensions(raw.sourceExtensions);
  }
  return Object.freeze(config);
}

export function formatGateListing(gates: readonly Gate[]): string[] {
  const lines: string[] = [];
  for (const gate of gates) {
    const quick = gate.inQuickRun ? 'yes' : 'no';
    const role = gate.role ? `  role=${gate.role}` : '';
    const spawnLabel = gate.spawn.kind === 'repo'
      ? `spawn=repo:${gate.spawn.command}`
      : `spawn=${gate.spawn.command}`;
    lines.push(`${gate.name}  ${spawnLabel}  quick=${quick}${role}`);
    lines.push(`  ${[gate.spawn.command, ...gate.args].join(' ')}`);
  }
  return lines;
}

export function applyTestSelector(gate: Gate, testPath: string): Gate {
  if (gate.role !== 'test') return gate;
  if (gate.spawn.kind === 'npm') {
    return { ...gate, args: Object.freeze([...gate.args, '--', testPath]), inQuickRun: true };
  }
  return { ...gate, args: Object.freeze([...gate.args, testPath]), inQuickRun: true };
}
