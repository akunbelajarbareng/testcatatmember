# 📄 Dokumentasi Proyek: Oriental CRM Customer Statement & Loyalty System

Sistem manajemen loyalitas pelanggan, pelacakan kupon undian, pengolahan transaksi POS multi-outlet, dan pencetakan dokumen *Customer Statement* resmi untuk **PT Oriental Retail / Grosir**.

---

## 📌 Daftar Isi
1. [Ringkasan Proyek](#1-ringkasan-proyek)
2. [Tech Stack](#2-tech-stack)
3. [Fitur Utama Sistem](#3-fitur-utama-sistem)
4. [Arsitektur Database & Koleksi Firestore](#4-arsitektur-database--koleksi-firestore)
5. [Struktur Direktori Proyek](#5-struktur-direktori-proyek)
6. [Panduan Instalasi & Menjalankan Proyek Lokal](#6-panduan-instalasi--menjalankan-proyek-lokal)
7. [Autentikasi & Hak Akses Pengguna](#7-autentikasi--hak-akses-pengguna)
8. [Aturan Bisnis & Logika Perhitungan Poin/Kupon](#8-aturan-bisnis--logika-perhitungan-poin-kupon)
9. [Migrasi Database (SQLite ke Firebase Firestore)](#9-migrasi-database-sqlite-ke-firebase-firestore)
10. [Panduan Deployment (Vercel & VPS)](#10-panduan-deployment-vercel--vps)

---

## 1. Ringkasan Proyek

Aplikasi **Oriental CRM Customer Statement** dibangun untuk menyelesaikan tantangan operasional:
* Konsolidasi multi-outlet (Retail, Grosir, UKM) di bawah konsep **One Identity** (1 KTP/Identitas Pemilik).
* Mengimpor ribuan data transaksi belanja bulanan dari file Excel ekspor mesin kasir POS.
* Menghitung perolehan poin belanja, kupon undian doorprize, akumulasi limbah minyak jelantah (UCO), serta estimasi penghematan biaya kurir dan parkir.
* Menerbitkan dan mencetak lembar fisik **Customer Statement A4** berkualitas vektor siap cetak.
* Manajemen fisik kupon undian berhadiah (penyerahan kupon fisik, kuota sisa, dan pelacakan pemenang doorprize).

---

## 2. Tech Stack

| Lapisan (Layer) | Teknologi yang Digunakan | Keterangan |
|---|---|---|
| **Frontend Framework** | **Next.js 16 (App Router)** | Rendering hybrid SSR, Server Components & Client Components |
| **UI Library** | **React 19** (`react`, `react-dom` v19.2) | Versi stabil terbaru dengan Hooks modern |
| **Styling & CSS** | **Tailwind CSS v4** | Framework utilitas CSS modern ultra cepat |
| **Komponen UI** | **Radix UI** | Dialog modal, Select dropdown, Tooltip aksesibel |
| **Ikon** | **Lucide React** | Ikon modern dan ringan |
| **Bahasa Pemrograman**| **TypeScript 5** | Strict type-safety untuk kestabilan kode |
| **Database Cloud** | **Google Cloud Firestore (Firebase)** | NoSQL Database terpusat via `firebase-admin` SDK |
| **Database Lokal** | **SQLite 3 (`better-sqlite3`)** | Engine lokal berkecepatan tinggi dengan mode WAL |
| **Excel Parser** | **SheetJS (`xlsx`)** | Pembaca file laporan kasir POS (`.xlsx`) |
| **Deployment Cloud** | **Vercel** / **Ubuntu VPS (PM2)** | Siap untuk platform serverless maupun dedicated server |

---

## 3. Fitur Utama Sistem

### A. One Identity & Multi-Outlet Management
* **Satu KTP Banyak Toko**: Mengelompokkan berbagai toko/cabang fisik pelanggan ke dalam satu profil pemilik induk.
* **Alias POS Otomatis**: Memetakan variasi penulisan nama kasir POS lama (misal: "Bpk. Budi", "Toko Budi Jaya") ke outlet yang tepat.
* **Penggabungan Member (Merge Identity)**: Menggabungkan dua identitas ganda beserta riwayat transaksi dan poinnya tanpa data hilang.

### B. Otomasi Impor Transaksi POS (Excel)
* Unggah berkas Excel ekspor kasir POS bulanan.
* Normalisasi data, filter transaksi retur/batal, dan deteksi otomatis anomali nama toko baru.
* Sistem antrean persetujuan (*Approvals Queue*) untuk transaksi yang membutuhkan konfirmasi Owner.

### C. Mesin Kalkulasi Poin & Kupon Undian
* Perhitungan otomatis berdasarkan rasio belanja per kategori:
  * **Retail**: Rp 100.000 = 1 Poin
  * **UKM**: Rp 50.000 = 1 Poin
  * **Grosir**: Rp 200.000 = 1 Poin
  * **Kupon Undian**: Setiap 1 Poin = 1 Kupon Undian (atau sesuai rasio `nilai_kupon`).
* Integrasi pembelian minyak jelantah (**Used Cooking Oil / UCO**): Berat (kg) dikonversi menjadi poin tambahan.
* Fitur penangguhan (*Member Penalty/Suspension*): Pembekuan hak poin atau hangus saldo bagi member yang melanggar ketentuan.

### D. Manajemen Kupon Undian Doorprize
* **Format Kupon Standar**: `ORT-KUPYYMM-NNNN` (contoh: `ORT-KUP2610-0001`).
* **Serah Terima Kupon Kasir**: Validasi kuota sisa member sebelum menyerahkan tumpukan kupon fisik.
* **Kupon Pelanggan Walk-In (Non-Member)**: Pencatatan kupon untuk pembeli tunai langsung di kasir toko.
* **Lookup Pemenang Doorprize**: Kasir/panitia cukup mengetikkan nomor kupon untuk mengetahui nama pemilik, alamat, dan nomor WhatsApp secara instan.

### E. Cetak Dokumen Statement Resmi (A4 Vector)
* Tampilan visual elegan dengan header kop resmi, logo Oriental, rincian outlet, grafik poin kumulatif, dan catatan penghematan.
* Desain responsif print media dengan pemisahan halaman otomatis (*page-break*).

---

## 4. Arsitektur Database & Koleksi Firestore

Data disimpan di **Google Cloud Firestore** dengan koleksi-koleksi berikut:

```
oriental-crm (Firestore Database)
├── identities        -> Master profil member (1 KTP)
├── outlets           -> Unit usaha cabang di bawah identities
├── pos_aliases       -> Mapping nama customer POS -> ID outlet
├── import_batches    -> Riwayat log unggah berkas Excel transaksi
├── invoices          -> Baris transaksi belanja POS
├── statements        -> Rekapitulasi bulanan per member (Doc ID: {identityId}_{bulan})
├── rules_config      -> Konfigurasi rate konversi poin & kupon
├── approvals         -> Antrean persetujuan perubahan data oleh Owner
├── audit_log         -> Jejak audit aktivitas pengguna sistem
├── coupon_batches    -> Riwayat serah terima fisik kupon kasir
├── coupons           -> Data status setiap lembar kupon undian (Doc ID: nomor_kupon)
├── member_penalties  -> Catatan sanksi / penangguhan member
├── waste_purchases   -> Transaksi timbangan minyak jelantah (UCO)
├── app_users         -> Akun pengguna (admin & kasir)
└── app_sessions      -> Token sesi login aktif
```

---

## 5. Struktur Direktori Proyek

```text
├── data/                         # Berkas database SQLite lokal & backup
├── public/                       # Aset publik statis (logo, favicon)
├── scripts/                      # Skrip operasional & migrasi data
│   ├── migrate-sqlite-to-firestore.js # Skrip migrasi data SQLite -> Firestore
│   └── backup-db.js              # Skrip pencadangan otomatis harian
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (pages)               # Halaman UI (identities, coupons, statements, settings, dll.)
│   │   ├── api/                  # 58 Route Handler API backend
│   │   │   ├── auth/             # Login, logout, verify owner, session
│   │   │   ├── coupons/          # Lookup, serah terima, void kupon
│   │   │   ├── identities/       # Master member & merge data
│   │   │   ├── outlets/          # Master outlet & transfer toko
│   │   │   ├── settings/         # Konfigurasi aturan konversi
│   │   │   └── statements/       # Generate & cetak laporan bulanan
│   │   ├── layout.tsx            # Root layout & styling
│   │   └── page.tsx              # Halaman Beranda (Dashboard Statistik)
│   ├── components/               # Komponen antarmuka yang dapat digunakan ulang
│   │   ├── Sidebar.tsx           # Navigasi utama
│   │   ├── StatementDocument.tsx # Template dokumen cetak A4
│   │   └── Pagination.tsx        # Kontrol penomoran halaman tabel
│   └── lib/                      # Utilitas bisnis & koneksi database
│       ├── firebase.ts           # Koneksi singleton Firebase Admin SDK
│       ├── firestore-service.ts  # Service layer pembacaan data Firestore + in-memory cache
│       ├── auth.ts               # Autentikasi, hashing Scrypt, rate limiting
│       ├── calc.ts               # Engine kalkulasi poin, kupon & penghematan
│       ├── coupon-manager.ts     # Manajemen kupon & alokasi nomor seri
│       ├── importer.ts           # Logika pemroses berkas Excel POS
│       └── db.ts                 # Adapter SQLite dengan proteksi Vercel /tmp
├── .env.example                  # Template variabel lingkungan
├── next.config.ts                # Konfigurasi Next.js
├── package.json                  # Daftar dependensi & script runner
└── tsconfig.json                 # Konfigurasi TypeScript
```

---

## 6. Panduan Instalasi & Menjalankan Proyek Lokal

### Prasyarat
* **Node.js**: Versi `v20.x` atau lebih baru.
* **Git**: Terpasang di komputer.
* Berkas kredensial Firebase: `serviceAccountKey.json`.

### Langkah-Langkah Menjalankan
1. **Clone Repositori**:
   ```bash
   git clone https://github.com/akunbelajarbareng/testcatatmember.git
   cd testcatatmember
   ```

2. **Pasang Dependensi**:
   ```bash
   npm install
   ```

3. **Konfigurasi Kredensial Firebase**:
   Letakkan file `serviceAccountKey.json` dari Firebase Console langsung di folder root proyek ini.
   *(Atau buat file `.env.local` berdasarkan contoh `.env.example`).*

4. **Jalankan Mode Pengembangan (Development)**:
   ```bash
   npm run dev
   ```
   Buka peramban di: **[http://localhost:3000](http://localhost:3000)**.

5. **Kompilasi Versi Produksi**:
   ```bash
   npm run build
   npm run start
   ```

---

## 7. Autentikasi & Hak Akses Pengguna

Sistem menggunakan **Scrypt Hashing** dan **HttpOnly Cookie** yang kedap dari serangan XSS.

### Kredensial Login Bawaan:
| Peran (Role) | Username | Password Default | Hak Akses |
|---|---|---|---|
| **Administrator (Owner)** | `admin` | `oriental2026` | Hak penuh: Ubah aturan poin, persetujuan anomali, hapus data, kelola member |
| **Petugas CRM / Kasir** | `kasir` | `kasir2026` | Hak operasional: Input data, serah terima kupon, lookup pemenang, cetak statement |

> [!NOTE]
> Proteksi Brute-Force aktif otomatis: Jika pengguna gagal login 5 kali berturut-turut, akun dan IP akan diblokir sementara selama 15 menit.

---

## 8. Aturan Bisnis & Logika Perhitungan Poin/Kupon

| Aturan / Rule | Nilai Default | Keterangan |
|---|---|---|
| `rate_retail` | **Rp 100.000** | Belanja outlet retail per 1 poin |
| `rate_ukm` | **Rp 50.000** | Belanja outlet UKM per 1 poin |
| `rate_grosir` | **Rp 200.000** | Belanja outlet grosir per 1 poin |
| `nilai_kupon` | **Rp 150.000** | Nilai transaksi untuk mendapatkan 1 kupon undian |
| `harga_uco_per_kg` | **Rp 8.000** | Harga pembelian minyak jelantah dari mitra |
| `rate_waste_poin` | **Rp 10.000** | Konversi rupiah pembelian limbah menjadi 1 poin reward |
| `saving_parkir_per_trx` | **Rp 2.000** | Estimasi penghematan parkir yang didapat member |
| `saving_kurir_per_trx` | **Rp 15.000** | Estimasi penghematan biaya kurir per transaksi |

*Nilai aturan di atas dapat diubah sewaktu-waktu oleh Administrator melalui menu **Pengaturan (Settings)**.*

---

## 9. Migrasi Database (SQLite ke Firebase Firestore)

Jika Anda memiliki database SQLite lokal (`data/oriental_crm.db`) dan ingin memperbarui data ke cloud Firestore, cukup jalankan:

```bash
node scripts/migrate-sqlite-to-firestore.js
```

Skrip ini akan secara otomatis:
1. Membaca seluruh baris dari SQLite lokal.
2. Membagi proses upload menjadi beberapa batch (400 dokumen per batch).
3. Mengunggah data member, outlet, transaksi, kupon, aturan, dan log audit ke Firestore tanpa batasan kuota.

---

## 10. Panduan Deployment (Vercel & VPS)

### Opsi A: Deploy ke Vercel (Serverless Cloud - Rekomendasi)
1. Push kode ke GitHub:
   ```bash
   git push -u origin main
   ```
2. Buka [Vercel Dashboard](https://vercel.com/) > Klik **Add New Project** > Pilih repositori GitHub Anda.
3. Di bagian **Environment Variables**, tambahkan:
   * `FIREBASE_PROJECT_ID`: `oriental-crm-221e3`
   * `FIREBASE_CLIENT_EMAIL`: `firebase-adminsdk-fbsvc@oriental-crm-221e3.iam.gserviceaccount.com`
   * `FIREBASE_PRIVATE_KEY`: *(Salin seluruh isi private key dari file `serviceAccountKey.json`)*
4. Klik **Deploy**. Aplikasi akan online dan aktif dalam 1-2 menit.

### Opsi B: Deploy ke Cloud VPS Ubuntu (PM2)
Jika dioperasikan di VPS mandiri:
```bash
# Masuk ke folder proyek di VPS
cd /home/oriental/oriental-crm-statement

# Tarik kode terbaru
git pull origin main

# Build aplikasi
npm run build

# Restart service dengan PM2
pm2 restart oriental-crm
```

---

## 📞 Pemeliharaan & Kontak Pengembang
* **Pemilik Proyek**: PT Oriental Retail / Grosir
* **Status Build**: Production Ready (Next.js 16 + Firebase Firestore)
* **Lisensi**: Hak Cipta Dilindungi Undang-Undang.
