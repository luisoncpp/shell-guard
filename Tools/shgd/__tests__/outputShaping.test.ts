import { capLines, parseShaping, shapeLines } from "../lib/outputShaping";

const Sample = ["alpha", "beta", "gamma", "delta"];

describe("parseShaping", () => {
  it("reads every shaping option", () => {
    const shaping = parseShaping(new Map([["head", "3"], ["tail", "2"], ["grep", "a$"], ["max-cols", "4"]]));
    expect(shaping.head).toBe(3);
    expect(shaping.tail).toBe(2);
    expect(shaping.maxCols).toBe(4);
    expect(shaping.grep?.test("beta")).toBe(true);
  });

  it("leaves everything undefined when nothing is asked for", () => {
    expect(parseShaping(new Map())).toEqual({ head: undefined, tail: undefined, grep: undefined, maxCols: undefined });
  });
});

describe("shapeLines", () => {
  it("returns the input unchanged with no shaping", () => {
    expect(shapeLines(Sample, {})).toEqual(Sample);
  });

  it("filters by grep", () => {
    expect(shapeLines(Sample, { grep: /a$/ })).toEqual(["alpha", "beta", "gamma", "delta"]);
    expect(shapeLines(Sample, { grep: /^d/ })).toEqual(["delta"]);
  });

  it("truncates to maxCols and marks the cut", () => {
    expect(shapeLines(["abcdefgh"], { maxCols: 3 })).toEqual(["abc..."]);
  });

  it("leaves a short line unmarked", () => {
    expect(shapeLines(["ab"], { maxCols: 3 })).toEqual(["ab"]);
  });

  it("takes the head", () => {
    expect(shapeLines(Sample, { head: 2 })).toEqual(["alpha", "beta"]);
  });

  it("takes the tail", () => {
    expect(shapeLines(Sample, { tail: 2 })).toEqual(["gamma", "delta"]);
  });

  it("applies head before tail, so both together mean the last of the first", () => {
    expect(shapeLines(Sample, { head: 3, tail: 2 })).toEqual(["beta", "gamma"]);
  });

  it("filters before slicing, so head counts matching lines only", () => {
    expect(shapeLines(Sample, { grep: /a$/, head: 1 })).toEqual(["alpha"]);
  });

  it("does not fail when tail exceeds the line count", () => {
    expect(shapeLines(["one"], { tail: 10 })).toEqual(["one"]);
  });
});

describe("capLines", () => {
  it("passes through when under the limit", () => {
    expect(capLines(Sample, 10)).toEqual(Sample);
  });

  it("truncates and states how many were dropped", () => {
    const capped = capLines(Sample, 2);
    expect(capped.slice(0, 2)).toEqual(["alpha", "beta"]);
    expect(capped[2]).toContain("2 more line(s) omitted");
  });
});
