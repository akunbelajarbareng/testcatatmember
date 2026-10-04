# Panduan Pencadangan (Backup) & Pemulihan (Restore) — Oriental CRM

Dokumen ini merupakan panduan resmi Standar Operasional Prosedur (SOP) sesuai **PRD Bagian 10** (*Keamanan dan Backup*).

---

## 1. Opsi 1: Unduh Cadangan Seketika (One-Click Backup di Web)

Fitur ini dapat digunakan kapan saja oleh **Administrator / Owner**:
1. Masuk ke aplikasi web CRM menggunakan akun Admin.
2. Buka menu **Pengaturan** di bilah navigasi kiri.
3. Gulir ke kartu **Database & Audit Status**.
4. Klik tombol biru **"Unduh Database (.db)"**.
5. File database utuh dengan format `oriental_crm_backup_YYYY-MM-DD_HHmmss.db` akan langsung tersimpan di folder *Downloads* komputer Anda.

---

## 2. Opsi 2: Cadangan Otomatis Harian (Auto-Backup Scheduler)

Sistem telah dilengkapi dengan skrip cadangan otomatis [`scripts/backup-db.js`](file:///c:/01.%20Chandra/01.%20Project%20Vibe%20Code/03.%20Mini%20Webapp%20Untuk%20CRM%20cetak%20Statement/scripts/backup-db.js):
- **Cara Kerja:** Melakukan snapshot aman (*atomic backup*) langsung dari mesin SQLite tanpa mengganggu kasir yang sedang bertransaksi.
- **Lokasi Penyimpanan Default:** `C:\Oriental_CRM_Backups\`
- **Retensi 30 Hari:** Cadangan yang berusia lebih dari 30 hari otomatis dibersihkan agar penyimpanan disk tidak penuh.
- **Riwayat Log:** Seluruh aktivitas pencadangan tercatat pada file `C:\Oriental_CRM_Backups\backup.log`.

### Cara Mengaktifkan Jadwal Harian Otomatis (Pukul 23:00):
1. Buka **PowerShell** sebagai **Administrator** (*Klik kanan Start Menu → Terminal / PowerShell (Admin)*).
2. Jalankan perintah berikut:
   ```powershell
   powershell -ExecutionPolicy Bypass -File "scripts\setup-windows-task.ps1"
   ```
3. Selesai! Windows Task Scheduler akan otomatis mencadangkan database setiap malam pukul 23:00.

> [!TIP]
> **Pencadangan Multi-Lokasi (Off-Site Backup):**
> Agar memenuhi standar keamanan terbaik, Anda dapat mengarahkan aplikasi sinkronisasi seperti **Google Drive for Desktop** atau **OneDrive** untuk menyinkronkan folder `C:\Oriental_CRM_Backups\`. Dengan begitu, jika terjadi kerusakan fisik pada laptop/komputer toko, salinan database tetap aman di cloud pribadi Anda.

---

## 3. Prosedur Pemulihan Data (Disaster Recovery / Restore SOP)

Jika database lokal mengalami kendala atau Anda ingin memindahkan sistem ke komputer baru:

1. **Hentikan Aplikasi:**
   - Tutup jendela terminal tempat aplikasi berjalan (atau jalankan `pm2 stop oriental-crm` jika menggunakan PM2).
2. **Siapkan File Cadangan:**
   - Ambil file cadangan terbaru yang valid dari `C:\Oriental_CRM_Backups\` atau folder Google Drive Anda (contoh: `oriental_crm_backup_2026-10-04_230000.db`).
3. **Gantikan File Database:**
   - Buka folder proyek: `data\`
   - Hapus atau ganti nama file `oriental_crm.db` yang lama/rusak.
   - Hapus file sementara `oriental_crm.db-wal` dan `oriental_crm.db-shm` jika ada.
   - Salin file cadangan Anda ke folder `data\` dan ubah namanya tepat menjadi:
     ```
     oriental_crm.db
     ```
4. **Nyalakan Kembali Aplikasi:**
   - Jalankan `npm run start` (mode production) atau `npm run dev`.
   - Buka browser di `http://localhost:3000` dan verifikasi bahwa data pelanggan serta transaksi telah pulih sempurna.
