@echo off
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
