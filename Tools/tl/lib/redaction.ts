// @Architecture(type=Module, descriptionShort="Pure secret masking for tl read --redact", descriptionLong="Masks connection-string passwords and the values of secret-looking assignment keys so an .env can be inspected for shape (which keys exist, which host) without printing the credentials into the transcript. Deliberately conservative: it masks values, never keys, so a missing variable is still visible.")
const Mask = '***';

const ConnectionPassword = /(:\/\/[^:@/\s]+:)[^@/\s]+(@)/g;

const SecretKey = /(SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|API_?KEY|_KEY|AUTH)/i;

const Assignment = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*[:=]\s*)(.+)$/;

const CarriageReturn = '\r';

export function redactLine(line: string): string {
  // A CRLF file split on \n leaves this behind, and `.` will not match it, so the
  // assignment pattern below would never match a Windows .env at all.
  const trailer = line.endsWith(CarriageReturn) ? CarriageReturn : '';
  const body = trailer ? line.slice(0, -1) : line;
  const masked = body.replace(ConnectionPassword, `$1${Mask}$2`);
  const assignment = Assignment.exec(masked);
  if (!assignment) return `${masked}${trailer}`;
  const [, prefix, key, separator] = assignment;
  if (!SecretKey.test(key)) return `${masked}${trailer}`;
  return `${prefix}${key}${separator}${Mask}${trailer}`;
}

export function redactLines(lines: readonly string[]): string[] {
  return lines.map(redactLine);
}
