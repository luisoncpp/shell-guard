@echo off
rem Delayed expansion is off by default but can be forced on machine-wide through a
rem cmd.exe AutoRun; with it on, a `!VAR!` inside a forwarded argument would expand
rem here rather than reaching tl as text.
setlocal DisableDelayedExpansion
rem cmd.exe searches the *current directory* before PATH, so a node.exe dropped into a
rem repository root would run instead of the real one. This variable removes the cwd
rem from that search for this process and everything it spawns; lib/run.ts does the
rem same job for git/npm/npx by resolving them to absolute paths.
set "NoDefaultCurrentDirectoryInExePath=1"
rem PATH shim. Resolves tsx from Tools\tl\node_modules first so the folder can be
rem dropped into any repo without touching the host package.json; `--import tsx`
rem resolves from the *cwd*, which is exactly what breaks in a host that has no
rem tsx of its own. Falls back to the bare specifier when a host does provide one.
if exist "%~dp0node_modules\tsx\dist\cli.mjs" goto local
node --import tsx "%~dp0index.ts" %*
exit /b %errorlevel%
:local
node "%~dp0node_modules\tsx\dist\cli.mjs" "%~dp0index.ts" %*
exit /b %errorlevel%
