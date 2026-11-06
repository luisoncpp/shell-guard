import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyChangeDirectory } from "../lib/changeDirectory";

describe("applyChangeDirectory", () => {
  const startingDirectory = process.cwd();
  let scratch: string;

  beforeEach(() => {
    scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), "shgd-cd-")));
  });

  afterEach(() => {
    process.chdir(startingDirectory);
    rmSync(scratch, { recursive: true, force: true });
  });

  it("returns argv untouched when there is no -C", () => {
    expect(applyChangeDirectory(["status", "--quick"])).toEqual(["status", "--quick"]);
    expect(process.cwd()).toBe(startingDirectory);
  });

  it("changes into the directory and strips the pair", () => {
    const rest = applyChangeDirectory(["-C", scratch, "status"]);
    expect(rest).toEqual(["status"]);
    expect(realpathSync.native(process.cwd())).toBe(scratch);
  });

  it("chains repeated -C the way git does, each relative to the last", () => {
    const child = path.join(scratch, "child");
    mkdirSync(child);
    const rest = applyChangeDirectory(["-C", scratch, "-C", "child", "grep", "x"]);
    expect(rest).toEqual(["grep", "x"]);
    expect(realpathSync.native(process.cwd())).toBe(child);
  });

  it("refuses a path that is not a directory", () => {
    expect(() => applyChangeDirectory(["-C", path.join(scratch, "missing"), "status"])).toThrow(/is not a directory/);
  });

  it("refuses -C with no directory", () => {
    expect(() => applyChangeDirectory(["-C"])).toThrow(/-C needs a directory/);
  });

  it("does not treat a -C after the verb as the global option", () => {
    expect(applyChangeDirectory(["grep", "-C", "3"])).toEqual(["grep", "-C", "3"]);
  });
});
