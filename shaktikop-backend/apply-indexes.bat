@echo off
REM ============================================================
REM  ShaktiCop — Performance indexes lagane wali script
REM
REM  Kya karti hai: 10 indexes banati hai jinse shikayat-suchi
REM  tez chalti hai (CONCURRENTLY mode).
REM
REM  Node.js ya psql dono se chal sakti hai (Zero setup).
REM ============================================================

setlocal enabledelayedexpansion

if "%PGURL%"=="" (
  if not "%DATABASE_URL%"=="" (
    set "PGURL=%DATABASE_URL%"
  )
)

echo.
echo ============================================================
echo   ShaktiCop -- Scale Indexes Lagane Ka Tool
echo ============================================================

where node >nul 2>&1
if not errorlevel 1 (
  echo [OK] Node.js mila, runMigrations.js se index lagaye ja rahe hain...
  if not "%PGURL%"=="" (
    node src/scripts/runMigrations.js --file=scale_indexes.sql --url="%PGURL%"
  ) else (
    node src/scripts/runMigrations.js --file=scale_indexes.sql
  )
  goto :done
)

if "%LOCALAPPDATA%\Programs\NodeJS\node.exe" NEQ "" (
  if exist "%LOCALAPPDATA%\Programs\NodeJS\node.exe" (
    echo [OK] Local NodeJS mila, runMigrations.js se index lagaye ja rahe hain...
    if not "%PGURL%"=="" (
      "%LOCALAPPDATA%\Programs\NodeJS\node.exe" src/scripts/runMigrations.js --file=scale_indexes.sql --url="%PGURL%"
    ) else (
      "%LOCALAPPDATA%\Programs\NodeJS\node.exe" src/scripts/runMigrations.js --file=scale_indexes.sql
    )
    goto :done
  )
)

where psql >nul 2>&1
if not errorlevel 1 (
  if "%PGURL%"=="" (
    echo   [!] PGURL ya DATABASE_URL set nahi hai.
    echo       Udaharan: set PGURL=postgresql://user:password@host:port/dbname
    echo.
    pause
    exit /b 1
  )
  echo [OK] psql mila, psql se index lagaye ja rahe hain...
  psql "%PGURL%" -f src/db/scale_indexes.sql
  goto :done
)

echo [X] Na to Node.js mila aur na psql mila.
echo     Kripya Node.js install karein ya PGURL set karke dobara chalayein.
pause
exit /b 1

:done
echo.
echo ============================================================
echo   Karyawahi samapt!
echo ============================================================
pause
