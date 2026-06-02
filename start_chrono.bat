@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
echo ========================================
echo   Laverie de la residence - Bootstrap ^& Run
ECHO ========================================

if not exist "venv\Scripts\python.exe" (
  echo [1/7] Creation de l'environnement virtuel...
  py -3 -m venv venv
  if errorlevel 1 (
    echo [ERREUR] Impossible de creer le venv.
    pause
    exit /b 1
  )
) else (
  echo [1/7] venv existe deja.
)

echo [2/7] Activation du venv...
call "venv\Scripts\activate.bat"
if errorlevel 1 (
  echo [ERREUR] Activation du venv echouee.
  pause
  exit /b 1
)

echo [3/7] Installation des dependances Python...
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
  echo [ERREUR] Installation des dependances Python echouee.
  pause
  exit /b 1
)

echo [4/7] Migrations Django...
python manage.py makemigrations
if errorlevel 1 (
  echo [ERREUR] makemigrations a echoue.
  pause
  exit /b 1
)
python manage.py migrate
if errorlevel 1 (
  echo [ERREUR] migrate a echoue.
  pause
  exit /b 1
)

echo [5/7] Lancement du serveur Django...
start "Laverie Django" cmd /k "cd /d "%~dp0" && call venv\Scripts\activate.bat && python manage.py runserver"

echo [6/7] Service WhatsApp Cloud (Meta)...
start "Laverie WhatsApp Cloud" cmd /k "cd /d "%~dp0whatsapp_cloud" && if not exist node_modules npm install && npm start"

echo [7/7] Lancement du Frontend Vite...
start "Chrono DZ Frontend" cmd /k "cd /d "%~dp0" && npm run dev"
echo.
echo Services demarres:
echo - Django: http://127.0.0.1:8000
echo - WhatsApp Cloud API: http://127.0.0.1:5000/health
echo - Frontend Vite: http://localhost:5173
echo.
echo Configurez .env avec WHATSAPP_ACCESS_TOKEN et WHATSAPP_PHONE_NUMBER_ID (Meta).
echo.
echo Appuyez sur une touche pour fermer cette fenetre...
pause >nul
exit /b 0
