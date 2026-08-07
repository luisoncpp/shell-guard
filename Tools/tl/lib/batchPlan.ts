// @Architecture(type=Module, descriptionShort="Pure parsing and admission rules for tl batch steps", descriptionLong="Turns each quoted step string into an argv array and admits it only if the verb exists, is not batch itself, and carries no write flag. This is the boundary that keeps batch from becoming a shell: a step names a verb from tl's own table, never a program, a script or a pipeline.")
import { Limits } from './constants';

export interface BatchStep {
  verb: string;
  argv: string[];
}

/** Nesting would make the step cap meaningless and the output unreadable. */
const DeniedVerbs = new Set(['batch']);

/** `--take` is tl's only write path; a destructive step must stay a visible, standalone call. */
const DeniedFlags = new Set(['--take']);

const Quotes = new Set(['"', "'"]);

export function tokenizeStep(raw: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let openQuote: string | null = null;
  let hasToken = false;
  for (const character of raw) {
    if (openQuote !== null) {
      if (character === openQuote) openQuote = null;
      else current += character;
      continue;
    }
    if (Quotes.has(character)) {
      openQuote = character;
      hasToken = true;
      continue;
    }
    if (!/\s/.test(character)) {
      current += character;
      hasToken = true;
      continue;
    }
    if (hasToken) tokens.push(current);
    current = '';
    hasToken = false;
  }
  if (openQuote !== null) throw new Error(`unterminated ${openQuote} quote in step: ${raw}`);
  if (hasToken) tokens.push(current);
  return tokens;
}

function admitStep(tokens: readonly string[], knownVerbs: ReadonlySet<string>, raw: string): BatchStep {
  const [verb, ...argv] = tokens;
  if (verb === undefined) throw new Error('empty batch step');
  if (DeniedVerbs.has(verb)) throw new Error(`"${verb}" may not be a batch step (batch does not nest)`);
  if (!knownVerbs.has(verb)) throw new Error(`unknown verb "${verb}" in step: ${raw}`);
  const denied = argv.find((token) => DeniedFlags.has(token));
  if (denied) throw new Error(`"${denied}" writes and may not run inside batch — call it on its own`);
  return { verb, argv };
}

export function planSteps(rawSteps: readonly string[], knownVerbs: ReadonlySet<string>): BatchStep[] {
  if (rawSteps.length === 0) throw new Error('usage: tl batch "<verb args>" "<verb args>" ...');
  if (rawSteps.length > Limits.BatchMaxSteps) {
    throw new Error(`too many steps (${rawSteps.length}); the cap is ${Limits.BatchMaxSteps}`);
  }
  return rawSteps.map((raw) => admitStep(tokenizeStep(raw), knownVerbs, raw));
}
