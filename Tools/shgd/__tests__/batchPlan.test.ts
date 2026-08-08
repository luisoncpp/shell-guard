import { planSteps, tokenizeStep } from "../lib/batchPlan";
import { Limits } from "../lib/constants";

const Known = new Set(["status", "grep", "diff", "conflicts", "check"]);

describe("tokenizeStep", () => {
  it("splits on whitespace", () => {
    expect(tokenizeStep("diff origin/develop --stat")).toEqual(["diff", "origin/develop", "--stat"]);
  });

  it("collapses runs of whitespace", () => {
    expect(tokenizeStep("  diff   --stat  ")).toEqual(["diff", "--stat"]);
  });

  it("keeps a single-quoted argument containing spaces as one token", () => {
    expect(tokenizeStep("section a.md '^# Deep Modules' '^## Next'")).toEqual([
      "section",
      "a.md",
      "^# Deep Modules",
      "^## Next",
    ]);
  });

  it("keeps a double-quoted argument as one token", () => {
    expect(tokenizeStep('grep "two words" src/')).toEqual(["grep", "two words", "src/"]);
  });

  it("preserves an empty quoted argument", () => {
    expect(tokenizeStep("grep ''")).toEqual(["grep", ""]);
  });

  it("treats the other quote character as ordinary inside a quoted run", () => {
    expect(tokenizeStep(`grep "it's"`)).toEqual(["grep", "it's"]);
  });

  it("rejects an unterminated quote rather than guessing", () => {
    expect(() => tokenizeStep(`grep "open`)).toThrow("unterminated");
  });

  it("returns nothing for an empty string", () => {
    expect(tokenizeStep("   ")).toEqual([]);
  });
});

describe("planSteps", () => {
  it("plans each step into a verb and its argv", () => {
    expect(planSteps(["status", "diff --stat"], Known)).toEqual([
      { verb: "status", argv: [] },
      { verb: "diff", argv: ["--stat"] },
    ]);
  });

  it("refuses to nest, which would defeat the step cap", () => {
    expect(() => planSteps(["batch 'status'"], Known)).toThrow("does not nest");
  });

  it("refuses the only write flag shgd has", () => {
    expect(() => planSteps(["conflicts --take a.md ours"], Known)).toThrow("writes and may not run inside batch");
  });

  it("refuses an unknown verb", () => {
    expect(() => planSteps(["deploy --prod"], Known)).toThrow('unknown verb "deploy"');
  });

  it("refuses an empty step", () => {
    expect(() => planSteps(["   "], Known)).toThrow("empty batch step");
  });

  it("refuses no steps at all", () => {
    expect(() => planSteps([], Known)).toThrow("usage: shgd batch");
  });

  it("caps the number of steps", () => {
    const tooMany = Array.from({ length: Limits.BatchMaxSteps + 1 }, () => "status");
    expect(() => planSteps(tooMany, Known)).toThrow(`the cap is ${Limits.BatchMaxSteps}`);
  });

  it("allows exactly the cap", () => {
    const atCap = Array.from({ length: Limits.BatchMaxSteps }, () => "status");
    expect(planSteps(atCap, Known)).toHaveLength(Limits.BatchMaxSteps);
  });
});
