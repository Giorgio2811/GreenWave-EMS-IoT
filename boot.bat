@echo off
echo ==========================================
echo    AVVIO SISTEMA GREENWAVE EMS IN CORSO
echo ==========================================
echo.

:: 1. Controllo e Avvio InfluxDB
tasklist /FI "IMAGENAME eq influxd.exe" 2>NUL | find /I /N "influxd.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [ OK ] InfluxDB e' gia' in esecuzione.
) else (
    echo [ .. ] Avvio InfluxDB in corso...
    cd "C:\Users\HP\Downloads\influxdb2-2.9.1-windows_amd64"
    start "Database - InfluxDB" influxd.exe
    timeout /t 2 /nobreak > NUL
)

:: 2. Controllo e Avvio Ollama
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I /N "ollama.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [ OK ] Ollama e' gia' in esecuzione.
) else (
    echo [ .. ] Avvio IA Ollama in corso...
    start "AI - Ollama" cmd /k "ollama run llama3.2"
)

:: 3. Controllo e Avvio Node-RED
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [ OK ] Node-RED e' gia' in esecuzione.
) else (
    echo [ .. ] Avvio Core Node-RED in corso...
    start "Server - Node-RED" cmd /k "node-red"
)

echo.
echo ==========================================
echo  TUTTI I SERVIZI SONO PRONTI!
echo  Puoi aprire il browser su:
echo  - http://localhost:1880/#flow/6a73255da9636885 (Node-RED)
echo  - http://127.0.0.1:1880/dashboard/home (Dashboard Node-RED)
echo  - http://127.0.0.1:8086 (InfluxDB)
echo ==========================================
pause