# A CRLF file makes every `$`-anchored regex match nothing, silently

`readFileSync(path, 'utf8').split('\n')` on a Windows CRLF file leaves a trailing `\r`
on every line. That alone is well known. The part that bites:

**JavaScript's `.` does not match `\r`.** `\r` is a line terminator in ECMAScript,
alongside `\n`, ` ` and ` `. So for a line ending in `\r`:

```js
/^(\w+)\s*=\s*(.+)$/.exec("JWT_SECRET=abc123\r")  // → null
```

`(.+)` stops before the `\r`, and `$` without the `m` flag only matches at the very end
of the string. The pattern does not match at all — it does not partially match, and it
does not throw. Whatever the code was going to do with the match simply does not happen.

Discovered when `shgd read --redact` masked the password inside a `mongodb://` URI on one
line (that rule uses no `$` anchor) while leaving `JWT_SECRET=` on the next line
completely unmasked. A unit test with `\n` fixtures passed the whole time; only a
CRLF fixture reproduced it.

Two rules that follow:

- Split file contents on `/\r?\n/`, never on `'\n'`. Here that is `lib/lines.ts`.
- When a fixture-driven test passes but the real file misbehaves on Windows, add a
  fixture with CRLF endings before looking anywhere else. `printf 'a\r\nb\r\n' > file`
  reproduces it.

Exception worth knowing: code that **rewrites** a file must not normalise line endings
as a side effect. `lib/conflictResolver.ts` deliberately keeps the naive split
and rejoins with `\n`, so the `\r` characters ride along inside the line strings and the
file's endings survive a `--take`.
