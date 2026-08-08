// @Architecture(type=Module, descriptionShort="Pure secret masking for shgd read/section --redact", descriptionLong="Masks connection-string passwords, bearer tokens, PEM key bodies and the values of secret-looking assignment keys so an .env or a config file can be inspected for shape (which keys exist, which host) without printing the credentials into the transcript. Deliberately conservative: it masks values, never keys, so a missing variable is still visible.")
const Mask = '***';

const ConnectionPassword = /(:\/\/[^:@/\s]+:)[^@/\s]+(@)/g;

const BearerToken = /\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;

/**
 * `PASS` rather than `PASSWORD` because `DB_PASS` is as common as either, and the
 * quoted-key form because a JSON config spells the same secret `"private_key": "..."`.
 */
const SecretKey = /(SECRET|TOKEN|PASS|PWD|CREDENTIAL|PRIVATE|API_?KEY|ACCESS_?KEY|_KEY|KEY_|^KEY$|AUTH|SALT|SIGNING|SESSION_?ID)/i;

const Assignment = /^(\s*(?:export\s+)?"?)([A-Za-z_][A-Za-z0-9_.-]*)("?\s*[:=]\s*)(.+)$/;

const QuotedValue = /^"[^"]*"(\s*,?)$/;

const PemBegin = /^\s*-----BEGIN [A-Z0-9 ]*-----\s*$/;
const PemEnd = /^\s*-----END [A-Z0-9 ]*-----\s*$/;

const CarriageReturn = '\r';

/** Keeps the surrounding quotes and any trailing comma, so a masked JSON file still reads as JSON. */
function maskValue(value: string): string {
  const quoted = QuotedValue.exec(value);
  return quoted ? `"${Mask}"${quoted[1]}` : Mask;
}

export function redactLine(line: string): string {
  // A CRLF file split on \n leaves this behind, and `.` will not match it, so the
  // assignment pattern below would never match a Windows .env at all.
  const trailer = line.endsWith(CarriageReturn) ? CarriageReturn : '';
  const body = trailer ? line.slice(0, -1) : line;
  const masked = body.replace(ConnectionPassword, `$1${Mask}$2`).replace(BearerToken, `$1${Mask}`);
  const assignment = Assignment.exec(masked);
  if (!assignment) return `${masked}${trailer}`;
  const [, prefix, key, separator, value] = assignment;
  if (!SecretKey.test(key)) return `${masked}${trailer}`;
  return `${prefix}${key}${separator}${maskValue(value)}${trailer}`;
}

/**
 * The PEM pass is the one rule that cannot be decided per line: the body of a private
 * key is anonymous base64, identifiable only by the BEGIN line above it.
 */
export function redactLines(lines: readonly string[]): string[] {
  let insidePem = false;
  return lines.map((line) => {
    if (PemBegin.test(line)) {
      insidePem = true;
      return line;
    }
    if (PemEnd.test(line)) {
      insidePem = false;
      return line;
    }
    return insidePem ? line.replace(/\S.*\S|\S/, Mask) : redactLine(line);
  });
}
