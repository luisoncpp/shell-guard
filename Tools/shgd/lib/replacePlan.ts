// @Architecture(type=Module, descriptionShort="Pure rule parsing and per-line substitution for shgd replace", descriptionLong="Holds everything sed -i would have done: pairing the from/to positionals, escaping a literal into a matcher, wrapping a word-mode rule in boundaries, and rewriting one file's contents while recording which lines changed. Substitution is per line and rejoins with the original terminators, so a CRLF file does not come back as an all-lines-changed diff. Takes and returns strings; the verb does the reading and writing.")
export type ReplaceMode = 'literal' | 'word' | 'regex';

export interface ReplaceRule {
  from: string;
  to: string;
}

export interface ReplacePlan {
  rules: readonly ReplaceRule[];
  mode: ReplaceMode;
}

export interface ChangedLine {
  line: number;
  before: string;
  after: string;
}

export interface FileChange {
  contents: string;
  /** Match count per rule, positionally aligned with `plan.rules`. */
  perRule: number[];
  changed: ChangedLine[];
}

/** Keeps the terminators as capture groups so line endings survive the rejoin untouched. */
const LineSplit = /(\r?\n)/;
const RegexMetacharacters = /[.*+?^${}()|[\]\\]/g;
const WordCharacter = /\w/;

export function escapeLiteral(value: string): string {
  return value.replace(RegexMetacharacters, '\\$&');
}

/**
 * `\b` is a boundary between a word and a non-word character, so anchoring a token that
 * already starts with punctuation asserts the opposite of what the caller meant:
 * /\b\.foo\b/ demands a word character immediately before the dot. Only the ends that
 * are word characters get a boundary.
 */
function boundaryFor(character: string | undefined): string {
  return character !== undefined && WordCharacter.test(character) ? '\\b' : '';
}

export function buildMatcher(from: string, mode: ReplaceMode): RegExp {
  if (mode === 'regex') {
    try {
      return new RegExp(from, 'g');
    } catch (error) {
      throw new Error(`"${from}" is not a valid regular expression: ${(error as Error).message}`);
    }
  }
  const body = escapeLiteral(from);
  if (mode === 'literal') return new RegExp(body, 'g');
  return new RegExp(`${boundaryFor(from[0])}${body}${boundaryFor(from[from.length - 1])}`, 'g');
}

export function resolveReplaceMode(flags: ReadonlySet<string>): ReplaceMode {
  const requested = (['word', 'regex'] as const).filter((mode) => flags.has(mode));
  if (requested.length > 1) throw new Error('pick one of --word / --regex, not both');
  return requested[0] ?? 'literal';
}

/**
 * Rules are `<from> <to>` positional pairs rather than a `from=>to` string because `=>`
 * is ordinary TypeScript: a separator character inside the rule would make arrow
 * functions unrenameable and, worse, split one silently in the wrong place.
 */
export function parseRules(positional: readonly string[], maxRules: number): ReplaceRule[] {
  if (positional.length === 0) {
    throw new Error('usage: shgd replace <from> <to> [<from> <to> ...] -- <pathspec...>');
  }
  if (positional.length % 2 !== 0) {
    throw new Error(`replace takes <from> <to> pairs; got ${positional.length} value(s): ${positional.join(' ')}`);
  }
  const pairs = positional.length / 2;
  if (pairs > maxRules) throw new Error(`too many rules (${pairs}); the cap is ${maxRules}`);
  const rules: ReplaceRule[] = [];
  for (let index = 0; index < positional.length; index += 2) {
    const [from, to] = [positional[index], positional[index + 1]];
    if (from.length === 0) throw new Error('a rule\'s <from> must not be empty');
    if (from === to) throw new Error(`rule ${rules.length + 1} replaces "${from}" with itself`);
    rules.push({ from, to });
  }
  return rules;
}

interface CompiledRule {
  pattern: RegExp;
  to: string;
  /** Literal and word modes replace through a function so `$&`/`$1` in `to` stay inert text. */
  isLiteral: boolean;
}

export function compileRules(plan: ReplacePlan): CompiledRule[] {
  return plan.rules.map((rule) => ({
    pattern: buildMatcher(rule.from, plan.mode),
    to: rule.to,
    isLiteral: plan.mode !== 'regex',
  }));
}

function applyToLine(line: string, compiled: readonly CompiledRule[], perRule: number[]): string {
  let current = line;
  compiled.forEach((rule, index) => {
    const hits = current.match(rule.pattern);
    if (hits === null) return;
    perRule[index] += hits.length;
    current = current.replace(rule.pattern, rule.isLiteral ? () => rule.to : rule.to);
  });
  return current;
}

/**
 * Rules apply in order within a line, exactly like a `sed` script with several `s///g`
 * expressions: a later rule sees what an earlier one produced.
 */
export function applyRules(contents: string, plan: ReplacePlan): FileChange {
  const compiled = compileRules(plan);
  const parts = contents.split(LineSplit);
  const perRule = plan.rules.map(() => 0);
  const changed: ChangedLine[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const before = parts[index];
    const after = applyToLine(before, compiled, perRule);
    if (after === before) continue;
    parts[index] = after;
    changed.push({ line: index / 2 + 1, before, after });
  }
  return { contents: parts.join(''), perRule, changed };
}

export function describeRule(rule: ReplaceRule, mode: ReplaceMode): string {
  return `${rule.from} -> ${rule.to}${mode === 'literal' ? '' : ` (${mode})`}`;
}
