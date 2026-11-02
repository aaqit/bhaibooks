@echo off
setlocal
cd /d "%~dp0"
echo Desktop par "BahiBooks ERP" shortcut bana rahe hain...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $lnk = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\BahiBooks ERP.lnk'); $lnk.TargetPath = '%~dp0start-desktop.bat'; $lnk.WorkingDirectory = '%~dp0'; $lnk.IconLocation = '%SystemRoot%\System32\shell32.dll,167'; $lnk.Description = 'BahiBooks ERP - Tally style accounting software'; $lnk.Save(); Write-Host 'Shortcut ban gaya: Desktop\BahiBooks ERP.lnk'"
echo.
pause
