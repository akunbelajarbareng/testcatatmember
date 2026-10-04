' start-silent.vbs — Jalankan Server Produksi di Latar Belakang Tanpa Jendela Terminal
' Tempatkan pintasan (shortcut) file ini di folder shell:startup agar otomatis jalan saat PC boot
Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath
WshShell.Run "cmd /c npm run start", 0, False
Set WshShell = Nothing
