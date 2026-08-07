import { findProtectedSegment, isWriteEnabled } from "../lib/writeGuard";

describe("findProtectedSegment", () => {
  it("blocks a protected directory at any depth", () => {
    expect(findProtectedSegment(".git/config")).toBe(".git");
    expect(findProtectedSegment("src/.claude/notes.md")).toBe(".claude");
    expect(findProtectedSegment("node_modules/pkg/index.js")).toBe("node_modules");
  });

  it("blocks a protected filename wherever it sits", () => {
    expect(findProtectedSegment(".npmrc")).toBe(".npmrc");
    expect(findProtectedSegment("server/.npmrc")).toBe(".npmrc");
    expect(findProtectedSegment("a/b/.mcp.json")).toBe(".mcp.json");
  });

  it("allows ordinary repository paths", () => {
    expect(findProtectedSegment("src/logic/CombatActor.ts")).toBeNull();
    expect(findProtectedSegment("docs/live/file-map.md")).toBeNull();
    expect(findProtectedSegment("package.json")).toBeNull();
  });

  it("does not block on a substring of a protected name", () => {
    expect(findProtectedSegment("src/.gitkeep")).toBeNull();
    expect(findProtectedSegment("docs/gitconfig.md")).toBeNull();
    expect(findProtectedSegment("src/claude/notes.md")).toBeNull();
  });
});

describe("isWriteEnabled", () => {
  const original = { write: process.env.TL_WRITE, noWrite: process.env.TL_NO_WRITE };

  afterEach(/* restoreWriteToggleEnv */ () => {
    process.env.TL_WRITE = original.write;
    process.env.TL_NO_WRITE = original.noWrite;
  });

  it("defaults to enabled when neither variable is set", () => {
    delete process.env.TL_WRITE;
    delete process.env.TL_NO_WRITE;
    expect(isWriteEnabled()).toBe(true);
  });

  it("is disabled by TL_WRITE=0", () => {
    process.env.TL_WRITE = "0";
    expect(isWriteEnabled()).toBe(false);
  });

  it("is disabled by TL_NO_WRITE=1", () => {
    delete process.env.TL_WRITE;
    process.env.TL_NO_WRITE = "1";
    expect(isWriteEnabled()).toBe(false);
  });

  it("stays enabled for any other TL_WRITE value", () => {
    delete process.env.TL_NO_WRITE;
    process.env.TL_WRITE = "1";
    expect(isWriteEnabled()).toBe(true);
  });
});
