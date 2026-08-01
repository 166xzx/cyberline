@echo off
REM Cyberline launcher -- shows the cyber banner, then starts Claude Code.
REM
REM KEEP THIS FILE PURE ASCII. cmd.exe parses each line using the OEM codepage
REM (936 on this machine) BEFORE `chcp 65001` takes effect, so UTF-8 Chinese
REM bytes get mis-decoded into stray & and | characters that break parsing --
REM even inside REM comments. That caused the profile to exit instantly.
REM
REM Called by the Windows Terminal "Claude Code" profile; also runnable by hand.
REM Usage: cc.cmd [any claude arguments]

setlocal
chcp 65001 >nul 2>&1

REM Avoid inheriting System32 as cwd when launched from a shortcut
if /i "%CD%"=="C:\Windows\System32" cd /d "%USERPROFILE%"

REM --clear wipes the screen and scrollback first. This maximizes the rows the
REM banner has to work with, so Claude Code's first frame fits the viewport --
REM see the RESERVE_ROWS comment in banner.js for why overflow leaves a gap.
node "%~dp0banner.js" --clear %CYBERLINE_BANNER_ARGS%

REM Pass every argument through to claude
call claude %*
set EXITCODE=%ERRORLEVEL%

REM Stay open after claude exits so output stays readable
if not "%CYBERLINE_NO_PAUSE%"=="1" (
  echo.
  echo   Claude Code exited ^(code %EXITCODE%^). Press any key to close.
  pause >nul
)
exit /b %EXITCODE%
