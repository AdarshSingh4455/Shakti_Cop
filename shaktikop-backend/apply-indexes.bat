@echo off
REM ============================================================
REM  Performance indexes lagane wali script
REM
REM  Kya karti hai: 10 indexes banati hai jinse shikayat-suchi
REM  tez chalti hai. Koi data nahi badalta — sirf padhne ki
REM  raftaar badhti hai.
REM
REM  Live system par chalana surakshit hai (CONCURRENTLY laga hai,
REM  isliye shikayat darj hona nahi rukega). Dobara chalane par
REM  bhi kuch nahi tootega (IF NOT EXISTS).
REM
REM  Chalane se pehle: environment variable PGURL ya DATABASE_URL set karein
REM  Udaharan: set PGURL=postgresql://user:password@host:port/dbname
REM ============================================================

if "%PGURL%"=="" (
  if not "%DATABASE_URL%"=="" (
    set "PGURL=%DATABASE_URL%"
  ) else (
    echo.
    echo   [!] PGURL ya DATABASE_URL set nahi hai.
    echo       Udaharan: set PGURL=postgresql://user:password@host:port/dbname
    echo.
    pause
    exit /b 1
  )
)

echo.
echo ============================================================
echo   Step 1 of 3 -- Connection jaanch rahe hain
echo ============================================================
psql "%PGURL%" -c "SELECT 1;" >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [X] Database se connect nahi ho paya.
  echo       - Upar PGURL mein password sahi bhara hai?
  echo       - Railway se password copy karein: Postgres service - Variables
  echo.
  pause
  exit /b 1
)
echo   [OK] Connection theek hai
echo.

echo ============================================================
echo   Step 2 of 3 -- Indexes bana rahe hain (1-3 minute)
echo ============================================================
echo   (Is dauraan app chalta rahega, shikayat darj hona nahi rukega)
echo.
psql "%PGURL%" -f src/db/scale_indexes.sql
if errorlevel 1 (
  echo.
  echo   [X] Kuch gadbad hui. Upar ka error sandesh copy karke bhejein.
  echo.
  pause
  exit /b 1
)
echo.

echo ============================================================
echo   Step 3 of 3 -- Jaanch: kitne indexes bane
echo ============================================================
psql "%PGURL%" -c "SELECT count(*) AS naye_indexes FROM pg_indexes WHERE indexname IN ('idx_complaints_active_recent','idx_complaints_district_recent','idx_complaints_station_recent','idx_complaints_officer_recent','idx_complaints_citizen_recent','idx_complaints_sos_active','idx_complaints_open_oldest','idx_trail_recorded_at','idx_notifications_recipient_recent','idx_activity_logs_created');"

echo.
echo   Upar 10 aana chahiye. Agar 10 hai to kaam pura hua.
echo.
echo ============================================================
echo   Asar dekhna chahein to (vaikalpik):
echo ============================================================
psql "%PGURL%" -c "EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM complaints WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 200;"
echo.
echo   Upar 'Index Scan' likha dikhe to index istemal ho raha hai (sahi).
echo   'Seq Scan' + 'Sort' dikhe to index nahi laga -- bataiye.
echo.
pause
