@echo off
:: Renegade Core Model Manager (RenegadeCMM)
:: Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
::
:: Licensed under the Business Source License 1.1 (BUSL-1.1).
:: Single-user evaluation model with fully functional features.
:: Commercial enterprise license required for organizations with > 5 persons.
:: Inquiries: licensing@renegadeinc.net
:: Converts to GNU General Public License v3.0 or later (GPL-3.0-or-later) after 4 years.
:: See LICENSE for full terms and conditions.
setlocal
cd /d "%~dp0"

title Renegade Core Model Manager

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cmm.ps1" %*
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% neq 0 (
    echo.
    echo [!] Application exited with code %EXIT_CODE%
    echo Press any key to close this window...
    pause >nul
)

exit /b %EXIT_CODE%

