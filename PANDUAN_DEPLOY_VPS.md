# Panduan & Dokumentasi Deployment VPS Cloud Oriental CRM

Aplikasi **Oriental CRM Customer Statement** telah berhasil dideploy dan berjalan aktif 24/7 di Cloud VPS Ubuntu.

---

## 1. Alamat Akses Aplikasi Live

| Item | Detail |
|---|---|
| **URL Aplikasi** | [http://139.190.98.215:3000](http://139.190.98.215:3000) |
| **Status Service** | Active & Running (Managed by PM2) |
| **Akses Multi-User** | Aktif 24/7 dari jaringan kantor maupun luar kantor |

---

## 2. Kredensial Login

| Peran (Role) | Username | Password Default | Catatan |
|---|---|---|---|
| **Administrator (Owner)** | `admin` | `oriental2026` | Hak akses penuh: Master data, cleanse, kupon, persetujuan, settings |
| **Petugas CRM / Kasir** | `kasir` | `kasir2026` | Hak akses operasional: Input data, lookup kupon, cetak statement |

> [!NOTE]
> Semua password disimpan menggunakan hashing aman standar industri (**scrypt** + random salt).

---

## 3. Detail Konfigurasi Server VPS

- **Host IP**: `139.190.98.215`
- **SSH User**: `oriental`
- **SSH Key**: `~/.ssh/oriental123.pem`
- **Direktori Proyek**: `/home/oriental/oriental-crm-statement`
- **Node.js Runtime**: `v22.23.3` LTS (dikelola via NVM)
- **Database Engine**: SQLite WAL mode (`data/oriental_crm.db`)
- **Virtual Memory / Swap**: 4 GB swapfile aktif di `/swapfile`
- **Process Manager**: PM2 (`oriental-crm`, Port 3000)

---

## 4. Perintah Operasional PM2 di VPS

Jika perlu memeriksa atau mengelola proses aplikasi di VPS:

```bash
# Masuk ke VPS
ssh -i ~/.ssh/oriental123.pem oriental@139.190.98.215

# Cek status proses
pm2 status

# Melihat log aplikasi secara realtime
pm2 logs oriental-crm

# Merestart aplikasi
pm2 restart oriental-crm

# Menghentikan aplikasi
pm2 stop oriental-crm
```

---

## 5. Sinkronisasi Kode dari GitHub ke VPS

Repository GitHub terhubung langsung dengan Deploy Key SSH khusus (`VPS-Ubuntu-Oriental`).

Jika di kemudian hari ada pembaruan kode yang di-push ke GitHub:
```bash
ssh -i ~/.ssh/oriental123.pem oriental@139.190.98.215
cd /home/oriental/oriental-crm-statement

# Tarik update terbaru
git pull origin main

# Build ulang produksi (jika ada perubahan kode src)
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
npm run build

# Restart PM2
pm2 restart oriental-crm
```

---

## 6. Cadangan Otomatis Harian (Automated Backup)

- **Jadwal Eksekusi**: Setiap hari pukul **23:00 WIB** via Linux Cron.
- **Folder Cadangan**: `/home/oriental/oriental-crm-backups/`
- **Metode**: Atomic SQLite Snapshot (`db.backup()`) tanpa downtime.
- **Retensi**: Otomatis mempertahankan cadangan 30 hari terakhir.
- **Unduh Cadangan Manual**: Bisa langsung dilakukan kapan saja dari menu webapp: **Pengaturan (Settings) > Unduh Database (.db)**.
