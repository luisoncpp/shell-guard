// @Architecture(type=Module, descriptionShort="The verb contract every tl verb implements", descriptionLong="Verbs return lines and an exit code instead of printing, so index.ts can apply output shaping and tl batch can label and concatenate several verbs in one invocation. A verb that calls console.log is invisible to both. Declared in its own module so verbs and batch never import index.ts, which would be circular.")
import type { ParsedArgs } from './argv';

export interface VerbResult {
  lines: string[];
  code: number;
}

export type VerbHandler = (args: ParsedArgs) => VerbResult;

/** Injected into `batch` by index.ts so the verb table stays in one place without a cycle. */
export type StepDispatch = (verb: string, args: ParsedArgs) => VerbResult;

export function ok(lines: string[]): VerbResult {
  return { lines, code: 0 };
}
