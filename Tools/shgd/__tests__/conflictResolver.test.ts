import { classifyLine, countHunks, parseSpec, resolveLines } from "../lib/conflictResolver";

const TwoHunks = [
  "intro",
  "<<<<<<< HEAD",
  "ours-one",
  "=======",
  "theirs-one",
  ">>>>>>> develop",
  "middle",
  "<<<<<<< HEAD",
  "ours-two",
  "=======",
  "theirs-two",
  ">>>>>>> develop",
  "outro",
];

describe("countHunks", () => {
  it("counts one per opening marker", () => {
    expect(countHunks(TwoHunks)).toBe(2);
  });

  it("returns zero for a clean file", () => {
    expect(countHunks(["a", "b"])).toBe(0);
  });
});

describe("resolveLines", () => {
  it("keeps our side for every hunk", () => {
    expect(resolveLines(TwoHunks, () => "ours")).toEqual([
      "intro", "ours-one", "middle", "ours-two", "outro",
    ]);
  });

  it("keeps their side for every hunk", () => {
    expect(resolveLines(TwoHunks, () => "theirs")).toEqual([
      "intro", "theirs-one", "middle", "theirs-two", "outro",
    ]);
  });

  it("chooses per hunk index, one-based", () => {
    const chooser = (index: number) => (index === 1 ? "theirs" as const : "ours" as const);
    expect(resolveLines(TwoHunks, chooser)).toEqual([
      "intro", "theirs-one", "middle", "ours-two", "outro",
    ]);
  });

  it("drops a diff3 base section regardless of the chosen side", () => {
    const diff3 = [
      "<<<<<<< HEAD",
      "ours",
      "||||||| merged common ancestors",
      "base-should-vanish",
      "=======",
      "theirs",
      ">>>>>>> develop",
    ];
    expect(resolveLines(diff3, () => "ours")).toEqual(["ours"]);
    expect(resolveLines(diff3, () => "theirs")).toEqual(["theirs"]);
  });

  it("treats a bare ======= outside a hunk as ordinary content", () => {
    const withUnderline = ["Title", "=======", "<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> develop"];
    expect(resolveLines(withUnderline, () => "theirs")).toEqual(["Title", "=======", "theirs"]);
  });

  it("leaves a file with no markers byte-identical", () => {
    const clean = ["one", "two", "", "three"];
    expect(resolveLines(clean, () => "ours")).toEqual(clean);
  });

  it("keeps an empty chosen side as an empty side, not a dropped hunk", () => {
    const emptyOurs = ["a", "<<<<<<< HEAD", "=======", "theirs", ">>>>>>> develop", "b"];
    expect(resolveLines(emptyOurs, () => "ours")).toEqual(["a", "b"]);
  });
});

describe("parseSpec", () => {
  it("accepts a bare side and applies it to every hunk", () => {
    expect(parseSpec("ours", 2)(1)).toBe("ours");
    expect(parseSpec("theirs", 2)(2)).toBe("theirs");
  });

  it("maps each listed hunk to its side", () => {
    const chooser = parseSpec("1=theirs,2=ours", 2);
    expect(chooser(1)).toBe("theirs");
    expect(chooser(2)).toBe("ours");
  });

  it("refuses a spec that does not name every hunk", () => {
    expect(() => parseSpec("1=ours", 2)).toThrow("missing 2 of 2");
    expect(() => parseSpec("2=ours", 3)).toThrow("missing 1, 3 of 3");
  });

  it("refuses an unparseable segment", () => {
    expect(() => parseSpec("1=mine", 1)).toThrow("bad spec segment");
    expect(() => parseSpec("x=ours", 1)).toThrow("bad spec segment");
  });

  it("ignores an out-of-range index only after coverage is satisfied", () => {
    expect(parseSpec("1=ours,9=theirs", 1)(1)).toBe("ours");
  });
});

describe("classifyLine", () => {
  it("reports the opening marker as opening a hunk", () => {
    expect(classifyLine("<<<<<<< HEAD", "none")).toEqual({ section: "ours", isMarker: true, opensHunk: true });
  });

  it("does not treat separators as markers outside a hunk", () => {
    expect(classifyLine("=======", "none")).toEqual({ section: "none", isMarker: false, opensHunk: false });
    expect(classifyLine(">>>>>>> x", "none")).toEqual({ section: "none", isMarker: false, opensHunk: false });
  });

  it("closes the hunk on the closing marker", () => {
    expect(classifyLine(">>>>>>> develop", "theirs")).toEqual({ section: "none", isMarker: true, opensHunk: false });
  });
});
