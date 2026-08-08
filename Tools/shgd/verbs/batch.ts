// @Architecture(type=Module, descriptionShort="Runs several shgd verbs in one invocation", descriptionLong="Collapses N tool calls into one round-trip with labelled, independently-shaped output. It once existed for permissions — a semicolon joining two allowed commands used to prompt — but Claude Code now allows a compound line when every part matches a rule, so that argument has expired and the round-trip saving is what remains. Steps are dispatched through shgd's own verb table (injected to avoid importing index.ts), labelled, and concatenated. Steps are sequential and independent — there is deliberately no data flow between them, because a substitution syntax would make batch a programming language.")
import { parseArgs, type ParsedArgs } from '../lib/argv';
import { planSteps, type BatchStep } from '../lib/batchPlan';
import { parseShaping, shapeLines } from '../lib/outputShaping';
import type { StepDispatch, VerbResult } from '../lib/verb';

export interface BatchContext {
  dispatch: StepDispatch;
  knownVerbs: ReadonlySet<string>;
}

interface StepOutcome {
  lines: string[];
  code: number;
}

function runStep(step: BatchStep, dispatch: StepDispatch): StepOutcome {
  try {
    const stepArgs = parseArgs(step.argv);
    const result = dispatch(step.verb, stepArgs);
    return { lines: shapeLines(result.lines, parseShaping(stepArgs.options)), code: result.code };
  } catch (error) {
    return { lines: [`shgd: ${(error as Error).message}`], code: 1 };
  }
}

function header(step: BatchStep, index: number, total: number, code: number): string {
  const label = [step.verb, ...step.argv].join(' ');
  return `=== step ${index + 1}/${total}: ${label} (exit ${code}) ===`;
}

export function runBatch(args: ParsedArgs, context: BatchContext): VerbResult {
  const steps = planSteps(args.positional, context.knownVerbs);
  const stopOnFail = args.flags.has('stop-on-fail');
  const lines: string[] = [];
  let firstFailure = 0;
  let completed = 0;
  for (const [index, step] of steps.entries()) {
    const outcome = runStep(step, context.dispatch);
    completed += 1;
    lines.push(header(step, index, steps.length, outcome.code), ...outcome.lines, '');
    if (outcome.code !== 0 && firstFailure === 0) firstFailure = outcome.code;
    if (outcome.code !== 0 && stopOnFail) break;
  }
  const skipped = steps.length - completed;
  lines.push(`=== ${completed}/${steps.length} step(s) run${skipped > 0 ? `, ${skipped} skipped after failure` : ''} ===`);
  return { lines, code: firstFailure };
}
