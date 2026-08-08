import { redactLine, redactLines } from "../lib/redaction";

describe("redactLine", () => {
  it("masks the password inside a connection string", () => {
    const line = "MONGODB_URI=mongodb://user:s3cret@host.example.com:27017/db?authSource=db";
    expect(redactLine(line)).toBe("MONGODB_URI=mongodb://user:***@host.example.com:27017/db?authSource=db");
  });

  it.each([
    "JWT_SECRET=7e82333cb748d8b812e9ef2228b358b8747ecb7483918cd2",
    "REFRESH_SECRET=abc123",
    "EOS_DEV_TOKEN_SECRET=1111",
    "STEAM_API_KEY=deadbeef",
    "export AUTH_PASSWORD=hunter2",
    "  apiToken: swordfish",
  ])("masks the value of secret-looking key in %s", (line) => {
    const redacted = redactLine(line);
    expect(redacted).toContain("***");
    expect(redacted).not.toMatch(/7e82333|abc123|1111|deadbeef|hunter2|swordfish/);
  });

  it.each([
    "PORT=3000",
    "NODE_ENV=production",
    "EOS_JWKS_URI=https://api.epicgames.dev/auth/v1/oauth/jwks",
    "# a comment",
    "",
  ])("leaves the non-secret line %s untouched", (line) => {
    expect(redactLine(line)).toBe(line);
  });

  it("keeps the key visible so a missing variable is still detectable", () => {
    expect(redactLine("JWT_SECRET=abc")).toBe("JWT_SECRET=***");
  });

  it("masks a CRLF line, whose trailing \\r survives split('\\n')", () => {
    expect(redactLine("JWT_SECRET=abc123def\r")).toBe("JWT_SECRET=***\r");
  });

  it("masks every line of a file", () => {
    expect(redactLines(["PORT=1", "JWT_SECRET=x"])).toEqual(["PORT=1", "JWT_SECRET=***"]);
  });

  it.each([
    "DB_PASS=hunter2",
    "MYSQL_PWD=hunter2",
    "AWS_ACCESS_KEY_ID=hunter2",
    "signingSalt: hunter2",
  ])("masks the shapes the first key list missed, in %s", (line) => {
    expect(redactLine(line)).toContain("***");
    expect(redactLine(line)).not.toContain("hunter2");
  });

  it("masks a bearer token wherever it appears in the line", () => {
    expect(redactLine("curl -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc'"))
      .toBe("curl -H 'Authorization: Bearer ***'");
  });

  it("keeps a masked JSON value valid JSON", () => {
    expect(redactLine('  "private_key": "-----BEGIN KEY-----",')).toBe('  "private_key": "***",');
  });

  it("masks the anonymous body of a PEM block, which no per-line rule can spot", () => {
    expect(redactLines([
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEAx7Gk8Q==",
      "bGlrZSB0aGlzIG9uZQ==",
      "-----END RSA PRIVATE KEY-----",
      "PORT=3000",
    ])).toEqual([
      "-----BEGIN RSA PRIVATE KEY-----",
      "***",
      "***",
      "-----END RSA PRIVATE KEY-----",
      "PORT=3000",
    ]);
  });
});
