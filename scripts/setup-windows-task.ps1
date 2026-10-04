# setup-windows-task.ps1 - Registrasi Otomatis Jadwal Backup CRM Oriental ke Windows Task Scheduler
# Jalankan PowerShell sebagai Administrator:
# powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-task.ps1

$TaskName = "OrientalCRM_DailyBackup"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$ScriptPath = Join-Path $ProjectDir "scripts\backup-db.js"
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $NodeExe) {
    Write-Host "[ERROR] Node.js tidak ditemukan di PATH sistem!" -ForegroundColor Red
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Registrasi Windows Task Scheduler: Backup Harian CRM    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Direktori Proyek: $ProjectDir"
Write-Host "Skrip Backup   : $ScriptPath"
Write-Host "Node.js Path   : $NodeExe"

# Action & Trigger (Setiap malam pukul 23:00)
$Action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$ScriptPath`"" -WorkingDirectory $ProjectDir
$Trigger = New-ScheduledTaskTrigger -Daily -At "23:00"
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Register or Update Task
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Cadangan harian database SQLite Oriental CRM pukul 23:00 dengan retensi 30 hari" | Out-Null
    Write-Host ""
    Write-Host "[OK] Tugas $TaskName berhasil didaftarkan di Windows Task Scheduler." -ForegroundColor Green
    Write-Host "Jadwal: Berjalan otomatis setiap hari pukul 23:00." -ForegroundColor Green
    Write-Host "Folder cadangan: C:\Oriental_CRM_Backups" -ForegroundColor Yellow
} catch {
    Write-Host ""
    Write-Host "[ERROR] Gagal mendaftarkan tugas: $_" -ForegroundColor Red
    Write-Host "Pastikan Anda menjalankan PowerShell sebagai Run as Administrator." -ForegroundColor Yellow
}
