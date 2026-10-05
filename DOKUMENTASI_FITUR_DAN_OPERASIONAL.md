# DOKUMENTASI LENGKAP SISTEM & FITUR — ORIENTAL CRM CUSTOMER STATEMENT

Dokumen ini memuat rangkuman menyeluruh mengenai seluruh pekerjaan pengembangan, arsitektur sistem, fitur-fitur yang telah dibangun, aturan bisnis (*business rules*), serta panduan operasional teknis untuk **Oriental CRM Customer Statement**.

---

## 📌 1. RINGKASAN EKSEKUTIF & TUJUAN SISTEM

**Oriental CRM Customer Statement** adalah sistem aplikasi web manajemen loyalitas pelanggan (*Loyalty CRM*) yang dirancang khusus untuk memproses kalkulasi poin dan kupon undian secara otomatis dari data transaksi multi-outlet (Retail, Grosir, UKM), menerbitkan lembar pernyataan (*customer statement*) resmi dua halaman siap cetak (A4 presisi), serta menangani skenario evaluasi khusus / sanksi pelanggaran (*devaluasi akun*).

### Arsitektur Deployment:
1. **Cloud VPS Ubuntu (`139.190.98.215:3000`)**: Lingkungan **Produksi Aktif 24/7** yang dikelola via PM2 dan dapat diakses oleh kasir dan manajemen dari mana saja.
2. **Komputer Kantor Lokal (`http://localhost:3000`)**: Lingkungan simulasi, audit lokal, dan pengujian internal.
3. **Database SQLite Terisolasi**: Database `data/oriental_crm.db` berjalan mandiri di masing-masing mesin dan dikecualikan dari Git (`.gitignore`), sehingga sinkronisasi kode via GitHub aman tanpa risiko data transaksi tertimpa.

---

## 🚀 2. DAFTAR FITUR UTAMA YANG TELAH SELESAI DIBANGUN

### A. Manajemen Master Data & Identitas Terpadu (One Identity)
- **Oriental One Identity (`identities`)**: Menyatukan multi-outlet milik satu pelanggan ke dalam satu identitas terpadu (format: `102-YYMMDD-XX`).
- **Outlet Mapping & Aliasing**: Setiap outlet diklasifikasikan ke dalam tipe bisnis tertentu (`retail`, `grosir`, `ukm`) dengan rate konversi poin masing-masing.
- **Pembersihan Data (Cleansing)**: Fitur deteksi outlet tanpa relasi (*unmapped outlets*) dan penggabungan profil pelanggan (*Merge Customer*).

### B. Modul Impor Data Transaksi & Master (Excel .xlsx)
- Import otomatis file Excel faktur penjualan POS.
- Validasi cerdas: deteksi duplikasi nomor faktur, pemetaan tanggal fleksibel, dan validasi otomatis nominal transaksi belanja.

### C. Engine Kalkulasi Poin & Kupon Otomatis (`src/lib/calc.ts`)
- **Perhitungan Poin Sesuai Kategori**:
  - **Retail**: 1 Poin per kelipatan Rp 100.000.
  - **Grosir**: 1 Poin per kelipatan Rp 250.000.
  - **UKM Kuliner**: 1 Poin per kelipatan Rp 50.000.
- **Perhitungan Kupon Undian**: 1 Lembar Kupon per kelipatan Rp 150.000 belanja di seluruh tipe outlet.
- **Kalkulasi Pembulatan ke Bawah (`Math.floor`)**: Transaksi tidak digabung antar-faktur untuk mencegah manipulasi pecahan.

### D. Manajemen Kupon Undian & Nomor Seri (`/coupons`)
- **Generator Nomor Seri Acak**: Nomor kupon dibuat acak anti-tebak berdasar algoritma kriptografis (`crypto.randomInt`).
- **Pelacakan Fisik & Serah Terima**: Menu pencatatan serah terima fisik kupon (*Handover*) kepada pelanggan dengan nomor batch dan tanggal distribusi.
- **Lookup Kupon**: Fasilitas pencarian status keabsahan kupon (Aktif / Digunakan / Void) secara instan.

### E. Modul Sanksi Pelanggaran & Devaluasi Akun (`/penalties`)
- **Penjatuhan Sanksi (Penalty Application)**:
  - Jenis sanksi: *Sementara (Temporary)* atau *Permanen (Permanent)*.
  - Opsi reset saldo kupon dan pemotongan poin akumulasi.
  - Otorisasi ganda menggunakan **Password Owner/Management**.
- **Pencatatan Berita Acara Sanksi**: Riwayat pelanggaran dicatat ke tabel `member_penalties` lengkap dengan alasan, petugas pelaksana, dan waktu eksekusi.
- **Pencabutan Sanksi**: Mengembalikan status keaktifan akun member. Transaksi belanja yang tercatat selama masa penalti tetap dihanguskan sesuai kesepakatan (*Permanent Void*).

### F. Dokumen E-Statement 2 Halaman (Sesuai Standar Audit & Cetak A4)
Komponen cetak presisi pada [`StatementDocument.tsx`](file:///c:/01.%20Chandra/01.%20Project%20Vibe%20Code/03.%20Mini%20Webapp%20Untuk%20CRM%20cetak%20Statement/src/components/StatementDocument.tsx):
- **Halaman 1 (Customer Facing)**:
  - Header resmi Oriental + Periode bulan berjalan.
  - Banner peringatan status: `STATUS : SUSPEND/DEVALUASI AKUN` jika akun terkena evaluasi.
  - 4 Kartu KPI: Total Poin Bulan Berjalan, Total Poin Dimiliki, Total Kupon Bulan Berjalan, Total Kupon Dimiliki.
  - Callout Box Peringatan Resmi bertanda tangan *Management*.
  - Rincian akumulasi per-outlet dan catatan kaki operasional.
- **Halaman 2 (Internal Audit & Arsip Akuntansi)**:
  - Subtitle: `ARSIP & RIWAYAT TRANSAKSI 13 BULAN (INTERNAL AUDIT)`.
  - Badge: `STATUS EVALUASI KHUSUS`.
  - KPI Box dengan rincian potensi vs penalti: `(Potensi: XX − Penalti: XX)` dan badge `DIBEKUKAN`.
  - **Tabel 1 (Riwayat 13 Bulan)**: Baris bulan terkena sanksi disorot latar merah muda (`#fef2f2`) dengan badge `[SANKSI VOID]` dan nilai `0 [VOID XX]`, serta total baris **`TOTAL AKUMULASI DIAKUI`**.
  - **Tabel 2 (Rekapan Status Outlet)**: Menampilkan rincian status per-outlet `0 [VOID: XX]`, sementara omzet belanja faktur tetap utuh apa adanya.
  - **Klausul Berita Acara Legal**: Kotak `BERITA ACARA AUDIT & PENGESAHAN SALDO`.
  - **Dual Signature Block**: Kolom tanda tangan ganda untuk `MANAGEMENT` dan `CUSTOMER`.

### G. Keamanan & Multi-Role User
- **Role Admin / Owner**: Hak akses tak terbatas (Master data, pembatalan/void, penjatuhan sanksi, ubah pengaturan).
- **Role Kasir / Petugas CRM**: Hak akses operasional (Cetak statement, lookup kupon, serah terima kupon).
- **Enkripsi Password**: Standar keamanan tinggi dengan **scrypt + random salt**.
- **Proteksi Rute & Cookie Sesi**: Menggunakan middleware Next.js berbasis cookie sesi HTTP terenkripsi.

### H. Sistem Otomatisasi Pencadangan Harian (Automated Backup @ 23:00 WIB)
- **Komputer Lokal (Windows)**:
  - Dikelola oleh **Windows Task Scheduler** bernama `OrientalCRM_DailyBackup`.
  - Folder target: `C:\Oriental_CRM_Backups\`.
  - Menggunakan atomic SQLite snapshot via [`scripts/backup-db.js`](file:///c:/01.%20Chandra/01.%20Project%20Vibe%20Code/03.%20Mini%20Webapp%20Untuk%20CRM%20cetak%20Statement/scripts/backup-db.js).
- **Cloud VPS (Linux Ubuntu)**:
  - Dikelola oleh **Linux Cron Daemon** (`0 23 * * *`).
  - Folder target: `/home/oriental/oriental-crm-backups/`.
- **Rotasi Otomatis 30 Hari**: File cadangan yang berusia lebih dari 30 hari otomatis dibersihkan agar kapasitas disk tidak penuh.
- **One-Click Download**: Fasilitas pengunduhan file `.db` langsung dari bilah antarmuka web (Menu Pengaturan).

### I. Modul Pencatatan Pembelian Limbah (Waste Purchasing — UCO)
- **Pencatatan per Outlet Fisik**: Setiap transaksi pembelian minyak jelantah dicatat spesifik per outlet member (`outlet_id`), yang secara otomatis terhubung ke akun One Identity pemiliknya.
- **Konversi Reward Point**:
  - Setiap **Rp 10.000** nilai pembelian waste menghasilkan **1 Oriental Point**.
  - Transaksi waste **TIDAK menghasilkan kupon undian fisik** (kupon = 0).
- **Harga Acuan Dinamis**: Standar harga pembelian minyak jelantah per Kg dapat dikonfigurasi melalui Menu **Pengaturan** (`harga_uco_per_kg`), namun kasir/petugas tetap dapat menyesuaikan harga jika ada kesepakatan harga khusus per transaksi.
- **Pemisahan Tegas di Dashboard**:
  - Metrik omzet penjualan ditampilkan terpisah sebagai **"Total Transaksi Penjualan"**.
  - Metrik pembelian limbah ditampilkan sebagai **"Total Pembelian Waste (UCO)"** lengkap dengan volume Kg, tanpa mencampur omzet penjualan belanja kasir.
- **Sub-Menu Input Cepat (`/waste-purchases`)**: Form pencatatan lengkap dengan pilihan outlet, tanggal, berat (kg), harga/kg, kalkulasi otomatis total rupiah & estimasi poin, nomor bukti timbangan, catatan drum/kualitas, serta nama petugas.

### J. Modul Nilai Penghematan Belanja Customer (Customer Savings)
- **Tujuan**: Memberikan reminder psikologis dan transparansi manfaat loyalitas berbelanja di Oriental pada Lembar Statement Customer (Halaman 1).
- **Formula Perhitungan**:
  $$\text{Total Penghematan} = \text{Jumlah Transaksi (Nota/Invoice) Bulan Berjalan} \times (\text{Estimasi Parkir} + \text{Estimasi Subsidi Kurir})$$
- **Parameter Konfigurasi Dinamis**:
  - `saving_parkir_per_trx` : Default Rp 2.000 / transaksi (dapat diubah di Menu Pengaturan).
  - `saving_kurir_per_trx`  : Default Rp 15.000 / transaksi (dapat diubah di Menu Pengaturan).
- **Penyajian pada Statement Customer**:
  - **Halaman 1 (Customer Facing)**: Menampilkan 2 kartu sorotan manfaat finansial berdampingan:
    1. *Nilai Penghematan Belanja Bulan Ini*: Total transaksi nota, rincian hemat parkir, rincian subsidi kurir, dan total rupiah yang dihemat.
    2. *Pendapatan Tambahan Waste (UCO)*: Total Kg minyak jelantah disetor, dana tunai yang diterima, serta bonus poin Oriental.
  - **Halaman 2 (Internal Audit)**: Dilengkapi tabel *Pencatatan Pembelian Limbah (Waste UCO)* per outlet untuk verifikasi pembukuan kas keluar.

---

## 🔑 3. POIN-POIN PENTING & LOGIKA BISNIS KRUSIAL

1. **Omzet Belanja Tidak Boleh Dihapus Saat Terkena Sanksi**:
   - Pelanggan yang dikenakan status evaluasi/devaluasi **tetap memiliki omzet transaksi belanja riil** di pembukuan Oriental.
   - Yang di-nolkan dan dicabut haknya hanyalah **Poin Loyalty** dan **Kupon Undian**.
   - Dokumen Halaman 1 dan Halaman 2 secara transparan menampilkan nilai omzet belanja apa adanya (misal `Rp 10.555.000`), tetapi nilai perolehan poin dan kupon tertulis `0 [VOID: XX]`.

2. **Perhitungan Devaluasi Bersifat Dinamis**:
   - Angka void dihitung secara otomatis oleh sistem dari nilai transaksi dibagi rate outlet masing-masing (`floor(jumlah / rate)`). Operator kasir tidak perlu menginput angka minus secara manual.

3. **Keamanan Database Terhadap Git Push / Git Pull**:
   - File database SQLite (`data/oriental_crm.db`) diabaikan oleh `.gitignore`.
   - Melakukan `git push` dari komputer lokal dan `git pull` di VPS hanya memperbarui kode program webapp (tampilan, fitur, kalkulator) dan **tidak akan menimpa data yang telah diinput di server VPS**.

4. **Standar Node.js di Cloud VPS**:
   - Server VPS menggunakan **Node.js LTS v22.23.3** via NVM.
   - Kompilasi produksi Next.js 16 (`npm run build`) wajib menggunakan path binary Node.js v22 ini agar worker Turbopack tidak mengalami benturan memori (*SIGSEGV*).

5. **Integrasi Poin Waste Purchasing pada Kalkulasi Statement & Sanksi Void**:
   - **Akun Normal / Aktif**:
     - $\text{Total Point Bulan Berjalan} = \text{Point Belanja} + \text{Point Waste Purchasing}$
     - $\text{Total Point Yang Dimiliki} = \text{Kumulatif Belanja} + \text{Kumulatif Waste Purchasing}$
   - **Akun Status Suspend / Evaluasi Khusus (Hasil Tetap VOID)**:
     - Potensi Poin Bulan Berjalan mencakup: $\text{Potensi Belanja} + \text{Potensi Waste Purchasing}$ (contoh: 668 + 28 = **696 Point**).
     - **Nilai VOID Sanksi = 696 Point** (Semua hak poin belanja dan poin limbah bulan berjalan dibatalkan/divoid).
     - **Poin Diakui Bulan Berjalan = 0 Point** (hasil tetap void sesuai ketentuan sanksi).
     - Pada Statement Halaman 1: Card 1 tertulis `0 Oriental Point (DEVALUASI/VOID: -696 POINT)`. Box Waste tertulis `0 Point [VOID: +28 Pt]`.
     - Pada Statement Halaman 2: Card 1 tertulis `(Potensi: 696 − Penalti: 696)`. Tabel Histori 13 Bulan baris bulan terkait menampilkan `0 [VOID 696]`. Tabel 3 Pembelian Limbah mencantumkan status `0 [VOID: +28]`. Berita Acara Audit menegaskan void sebesar 696 Poin.

6. **Mekanisme Deduplikasi Antrean Approval pada Re-Import Customer**:
   - Import berkala data master customer (misal tiap awal bulan) tidak akan menduplikasi antrean persetujuan (`approvals`).
   - Sistem memeriksa riwayat approval pada **seluruh status** (`menunggu`, `disetujui`, `ditolak`, `diabaikan`). Keputusan yang telah ditetapkan Owner di masa lalu tidak akan dimunculkan kembali ke antrean menunggu.
   - Untuk kode lama POS (131), sistem secara cerdas memeriksa apakah kode tersebut sudah terdaftar di tabel `outlets` atau `pos_aliases`. Kode yang sudah terpetakan di CRM otomatis dilewati (skip).

7. **Fitur Pencarian & Paginasi Antrean Approval**:
   - Menu Antrean Approval (`/approvals`) dilengkapi bilah pencarian cerdas untuk memfilter antrean secara instan berdasarkan: kode (102 / 131), nama customer / nama POS, ID approval, nama file Excel asal, maupun alasan anomali.
   - Dilengkapi sistem paginasi 20 antrean per halaman (`Pagination`) dengan indikator jumlah item yang cocok serta tombol reset cepat (✕) untuk memudahkan navigasi saat terdapat ratusan antrean.

---

## 🌐 4. INFORMASI AKSES & KREDENSIAL SISTEM

### Akses Server Produksi (Cloud VPS)
- **URL Webapp**: [http://139.190.98.215:3000](http://139.190.98.215:3000)
- **IP VPS**: `139.190.98.215`
- **SSH Login**: `ssh -i ~/.ssh/oriental123.pem oriental@139.190.98.215`
- **Direktori Aplikasi**: `/home/oriental/oriental-crm-statement`
- **Service Manager**: PM2 (`oriental-crm`)

### Kredensial Pengguna Default:
| Akun | Username | Password Default | Hak Akses |
|---|---|---|---|
| **Owner / Manajemen** | `admin` | `oriental2026` | Akses Penuh (Otorisasi Sanksi, Config, Cleansing) |
| **Kasir / Petugas CRM** | `kasir` | `kasir123` | Akses Operasional (Input, Cetak, Serah Terima) |

---

## 🛠️ 5. PANDUAN PROSEDUR OPERASIONAL (SOP)

### A. Prosedur Pembaruan Kode dari Lokal ke VPS
Setiap kali ada perbaikan atau fitur baru di komputer lokal:
```bash
# 1. Dari Komputer Lokal (PowerShell):
git add .
git commit -m "pesan pembaruan"
git push origin main

# 2. Masuk ke VPS dan Terapkan Pembaruan:
ssh -i ~/.ssh/oriental123.pem oriental@139.190.98.215
cd ~/oriental-crm-statement
git pull origin main
export PATH=/home/oriental/.nvm/versions/node/v22.23.3/bin:/usr/local/bin:/usr/bin:/bin
npm run build
pm2 restart oriental-crm
```

### B. Prosedur Pemulihan Database Darurat (Disaster Recovery)
Jika terjadi insiden salah hapus atau kegagalan data di VPS:
1. Matikan sementara aplikasi:
   ```bash
   pm2 stop oriental-crm
   ```
2. Salin salah satu snapshot cadangan terbaru dari folder `/home/oriental/oriental-crm-backups/`:
   ```bash
   cp /home/oriental/oriental-crm-backups/oriental_crm_backup_YYYY-MM-DD_HHMMSS.db /home/oriental/oriental-crm-statement/data/oriental_crm.db
   ```
3. Nyalakan kembali aplikasi:
   ```bash
   pm2 start oriental-crm
   ```
4. Data transaksi dan statement langsung pulih ke kondisi tanggal cadangan tersebut.

---

*Dokumen ini disusun sebagai panduan resmi arsitektur, fitur, dan tata kelola sistem Oriental CRM Customer Statement.*
