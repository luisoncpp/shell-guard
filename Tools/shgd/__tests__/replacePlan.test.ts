import {
  applyRules,
  buildMatcher,
  describeRule,
  escapeLiteral,
  parseRules,
  resolveReplaceMode,
  type ReplacePlan,
} from "../lib/replacePlan";

const MaxRules = 8;

function plan(rules: Array<[string, string]>, mode: ReplacePlan["mode"] = "literal"): ReplacePlan {
  return { rules: rules.map(([from, to]) => ({ from, to })), mode };
}

describe("parseRules", () => {
  it("pairs positionals into rules in order", () => {
    expect(parseRules(["a", "b", "c", "d"], MaxRules)).toEqual([
      { from: "a", to: "b" },
      { from: "c", to: "d" },
    ]);
  });

  it("refuses an odd count rather than guessing which value is unpaired", () => {
    expect(() => parseRules(["a", "b", "c"], MaxRules)).toThrow(/pairs; got 3/);
  });

  it("refuses no rules at all", () => {
    expect(() => parseRules([], MaxRules)).toThrow(/usage: shgd replace/);
  });

  it("refuses an empty <from>, which would match at every position", () => {
    expect(() => parseRules(["", "b"], MaxRules)).toThrow(/must not be empty/);
  });

  it("refuses a rule that replaces a token with itself", () => {
    expect(() => parseRules(["a", "b", "same", "same"], MaxRules)).toThrow(/rule 2 replaces "same" with itself/);
  });

  it("caps the rule count", () => {
    const many = Array.from({ length: (MaxRules + 1) * 2 }, (_, index) => `token${index}`);
    expect(() => parseRules(many, MaxRules)).toThrow(/too many rules \(9\); the cap is 8/);
  });

  it("allows an empty <to>, which is a deletion", () => {
    expect(parseRules(["noise", ""], MaxRules)).toEqual([{ from: "noise", to: "" }]);
  });
});

describe("resolveReplaceMode", () => {
  it("defaults to literal", () => {
    expect(resolveReplaceMode(new Set())).toBe("literal");
  });

  it("reads --word and --regex", () => {
    expect(resolveReplaceMode(new Set(["word"]))).toBe("word");
    expect(resolveReplaceMode(new Set(["regex"]))).toBe("regex");
  });

  it("refuses both at once instead of silently preferring one", () => {
    expect(() => resolveReplaceMode(new Set(["word", "regex"]))).toThrow(/not both/);
  });
});

describe("buildMatcher", () => {
  it("treats regex metacharacters in a literal rule as text", () => {
    expect(escapeLiteral("a.b(c)")).toBe("a\\.b\\(c\\)");
    expect("a.b(c)".replace(buildMatcher("a.b(c)", "literal"), "X")).toBe("X");
    expect("axbYcZ".replace(buildMatcher("a.b(c)", "literal"), "X")).toBe("axbYcZ");
  });

  it("anchors a word rule at both ends", () => {
    const pattern = buildMatcher("item", "word");
    expect("item items reitem".replace(pattern, "X")).toBe("X items reitem");
  });

  it("omits the boundary on an end that is not a word character, where \\b would invert the test", () => {
    // /\b\.foo\b/ would demand a word character immediately before the dot.
    expect(".foo".replace(buildMatcher(".foo", "word"), "X")).toBe("X");
  });

  it("reports an invalid regex rather than throwing a bare SyntaxError", () => {
    expect(() => buildMatcher("(unclosed", "regex")).toThrow(/is not a valid regular expression/);
  });
});

describe("applyRules", () => {
  it("replaces every occurrence on every line", () => {
    const change = applyRules("a b a\nc a\n", plan([["a", "Z"]]));
    expect(change.contents).toBe("Z b Z\nc Z\n");
    expect(change.perRule).toEqual([3]);
    expect(change.changed.map((line) => line.line)).toEqual([1, 2]);
  });

  it("applies rules in order, so a later rule sees the earlier one's output", () => {
    const change = applyRules("one", plan([["one", "two"], ["two", "three"]]));
    expect(change.contents).toBe("three");
    expect(change.perRule).toEqual([1, 1]);
  });

  it("preserves CRLF terminators instead of rewriting the whole file", () => {
    const change = applyRules("a\r\nb\r\n", plan([["a", "Z"]]));
    expect(change.contents).toBe("Z\r\nb\r\n");
    expect(change.changed).toEqual([{ line: 1, before: "a", after: "Z" }]);
  });

  it("reports no changed lines when nothing matches", () => {
    const change = applyRules("nothing here\n", plan([["absent", "X"]]));
    expect(change.changed).toEqual([]);
    expect(change.perRule).toEqual([0]);
    expect(change.contents).toBe("nothing here\n");
  });

  it("keeps $& in a literal replacement as text rather than the matched substring", () => {
    expect(applyRules("a", plan([["a", "$&$1"]])).contents).toBe("$&$1");
  });

  it("expands $1 in regex mode", () => {
    expect(applyRules("get(x)", plan([["get\\((\\w+)\\)", "read($1)"]], "regex")).contents).toBe("read(x)");
  });

  it("renames an identifier without touching a longer name containing it", () => {
    const change = applyRules(
      "`activeItems`/`pendingItems` and activeItemsCount\n",
      plan([["activeItems", "liveItems"], ["pendingItems", "staleItems"]], "word"),
    );
    expect(change.contents).toBe("`liveItems`/`staleItems` and activeItemsCount\n");
    expect(change.perRule).toEqual([1, 1]);
  });

  it("counts a line once however many rules touch it", () => {
    const change = applyRules("a b", plan([["a", "X"], ["b", "Y"]]));
    expect(change.changed).toEqual([{ line: 1, before: "a b", after: "X Y" }]);
  });

  it("leaves a file with no trailing newline without one", () => {
    expect(applyRules("a", plan([["a", "Z"]])).contents).toBe("Z");
  });
});

describe("describeRule", () => {
  it("names the mode only when it is not the literal default", () => {
    expect(describeRule({ from: "a", to: "b" }, "literal")).toBe("a -> b");
    expect(describeRule({ from: "a", to: "b" }, "word")).toBe("a -> b (word)");
  });
});
