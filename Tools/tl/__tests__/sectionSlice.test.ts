import { splitLines } from "../lib/lines";
import { sliceSection } from "../lib/sectionSlice";

const Doc = ["intro", "# Start", "body one", "body two", "## End", "after"];

describe("sliceSection", () => {
  it("includes both boundary lines, matching sed -n '/a/,/b/p'", () => {
    const slice = sliceSection(Doc, /^# Start/, /^## End/);
    expect(slice.lines).toEqual(["# Start", "body one", "body two", "## End"]);
    expect(slice.startLine).toBe(2);
    expect(slice.endLine).toBe(5);
  });

  it("runs to the end of the file when the end pattern never matches", () => {
    const slice = sliceSection(Doc, /^# Start/, /^ZZZ/);
    expect(slice.lines[slice.lines.length - 1]).toBe("after");
    expect(slice.endLine).toBe(Doc.length);
  });

  it("reports no match when the start pattern is absent", () => {
    expect(sliceSection(Doc, /^ZZZ/, /^## End/)).toEqual({ lines: [], startLine: null, endLine: null });
  });

  it("does not let the end pattern match the start line itself", () => {
    const slice = sliceSection(Doc, /^#/, /^#/);
    expect(slice.lines).toEqual(["# Start", "body one", "body two", "## End"]);
  });

  it("handles a one-line section where the next line ends it", () => {
    expect(sliceSection(["a", "b"], /a/, /b/).lines).toEqual(["a", "b"]);
  });
});

describe("splitLines", () => {
  it("strips the carriage return a CRLF file would otherwise leave on every line", () => {
    expect(splitLines("one\r\ntwo\r\n")).toEqual(["one", "two", ""]);
  });

  it("splits LF content identically", () => {
    expect(splitLines("one\ntwo\n")).toEqual(["one", "two", ""]);
  });

  it("returns a single element for content with no break", () => {
    expect(splitLines("solo")).toEqual(["solo"]);
  });
});
