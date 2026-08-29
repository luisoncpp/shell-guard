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
    expect(findProtectedSegment("src/package.json.md")).toBeNull();
  });

  it("blocks the manifests and lockfiles that feed shgd check", () => {
    // The write→execute chain: `replace --take` rewrites a script, `shgd check` runs it,
    // and both calls are pre-approved by the same blanket rule.
    expect(findProtectedSegment("package.json")).toBe("package.json");
    expect(findProtectedSegment("server/package-lock.json")).toBe("package-lock.json");
    expect(findProtectedSegment("pnpm-lock.yaml")).toBe("pnpm-lock.yaml");
    expect(findProtectedSegment("MyGame/.shgd.json")).toBe(".shgd.json");
    expect(findProtectedSegment(".shgd.json")).toBe(".shgd.json");
    expect(findProtectedSegment(".github/workflows/ci.yml")).toBe(".github");
  });

  it("blocks a protected segment however the filesystem would spell it", () => {
    // NTFS and APFS are case-insensitive and Win32 strips trailing dots, so these
    // three all open .git — a case-sensitive Set lookup walked past the whole list.
    expect(findProtectedSegment(".GIT/config")).toBe(".git");
    expect(findProtectedSegment(".Git/hooks/pre-commit")).toBe(".git");
    expect(findProtectedSegment(".git./config")).toBe(".git");
    expect(findProtectedSegment("NODE_MODULES/pkg/index.js")).toBe("node_modules");
    expect(findProtectedSegment("server/.NPMRC")).toBe(".npmrc");
  });

  it("does not block on a substring of a protected name", () => {
    expect(findProtectedSegment("src/.gitkeep")).toBeNull();
    expect(findProtectedSegment("docs/gitconfig.md")).toBeNull();
    expect(findProtectedSegment("src/claude/notes.md")).toBeNull();
  });
});

describe("isWriteEnabled", () => {
  const original = { write: process.env.SHGD_WRITE, noWrite: process.env.SHGD_NO_WRITE };

  afterEach(/* restoreWriteToggleEnv */ () => {
    process.env.SHGD_WRITE = original.write;
    process.env.SHGD_NO_WRITE = original.noWrite;
  });

  it("defaults to enabled when neither variable is set", () => {
    delete process.env.SHGD_WRITE;
    delete process.env.SHGD_NO_WRITE;
    expect(isWriteEnabled()).toBe(true);
  });

  it("is disabled by SHGD_WRITE=0", () => {
    process.env.SHGD_WRITE = "0";
    expect(isWriteEnabled()).toBe(false);
  });

  it("is disabled by SHGD_NO_WRITE=1", () => {
    delete process.env.SHGD_WRITE;
    process.env.SHGD_NO_WRITE = "1";
    expect(isWriteEnabled()).toBe(false);
  });

  it("stays enabled for any other SHGD_WRITE value", () => {
    delete process.env.SHGD_NO_WRITE;
    process.env.SHGD_WRITE = "1";
    expect(isWriteEnabled()).toBe(true);
  });
});
