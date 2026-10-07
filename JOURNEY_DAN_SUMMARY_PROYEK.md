# DOKUMENTASI HISTORIS & RANGKUMAN PERJALANAN PROYEK (PROJECT JOURNEY & SUMMARY)
## Oriental CRM & Customer Monthly Statement System
*PT. Oriental Bakery & Swalayan — Watampone, Bone, Sulawesi Selatan*

---

## DAFTAR ISI
1. [Ringkasan Eksekutif (Project Summary)](#1-ringkasan-eksekutif-project-summary)
2. [Latar Belakang Permasalahan & Solusi Inovatif](#2-latar-belakang-permasalahan--solusi-inovatif)
3. [Evolusi & Rekam Jejak Pengerjaan (Sprint Roadmap)](#3-evolusi--rekam-jejak-pengerjaan-sprint-roadmap)
4. [Arsitektur Sistem, Database, & Logika Bisnis](#4-arsitektur-sistem-database--logika-bisnis)
5. [Infrastruktur, Keamanan, & Deployment Produksi](#5-infrastruktur-keamanan--deployment-produksi)
6. [SOP Operasional Bulanan (Monthly Closing Playbook)](#6-sop-operasional-bulanan-monthly-closing-playbook)
7. [Status Saat Ini & Catatan Pengembangan Masa Depan](#7-status-saat-ini--catatan-pengembangan-masa-depan)

---

## 1. RINGKASAN EKSEKUTIF (PROJECT SUMMARY)

### 1.1 Visi & Tujuan Proyek
Proyek **Oriental CRM & Monthly Statement System** adalah sebuah platform webapp operasional internal yang dirancang khusus untuk memodernisasi program loyalitas pelanggan, tata kelola data transaksi, penyerahan kupon undian fisik, serta penerbitan lembar rekening koran pelanggan (*Monthly Customer Statement*) di **Oriental Bakery & Swalayan (Watampone)**.

Sistem ini mentransformasi proses manual dan data kasir POS (*Point of Sale*) lama yang terfragmentasi menjadi satu ekosistem terpadu berbasis **"Oriental One Identity"**. Melalui platform ini, manajemen dan kasir memiliki visibilitas penuh atas omzet gabungan pelanggan di seluruh cabangnya, hak poin reward, distribusi nomor kupon undian, riwayat audit kredit/piutang 13 bulan, serta dampak penghematan biaya yang dirasakan konsumen.

### 1.2 Profil Pengguna & Lingkungan Operasional
* **Entitas Bisnis**: Retail, Grosir Bahan Kue, Roti/Bakery, Perlengkapan UKM, dan Pengepul Minyak Jelantah (*Used Cooking Oil* / UCO).
* **Lokasi Operasional**: Jl. Besse Kajuara / Masjid Raya, Watampone, Kab. Bone, Sulawesi Selatan.
* **Pengguna Utama**:
  1. *Kasir / Front Desk*: Verifikasi serah terima kupon undian fisik, cetak statement pelanggan.
  2. *Supervisor / Admin Operasional*: Impor data penjualan harian/bulanan dari POS, pemetaan alias toko baru, pencatatan limbah UCO.
  3. *Owner / General Manager*: Otorisasi sanksi/penalti kecurangan, pengawasan tren omzet 13 bulan, audit integritas kupon undian, dan pengaturan sistem.

---

## 2. LATAR BELAKANG PERMASALAHAN & SOLUSI INOVATIF

Sebelum aplikasi ini dibangun, operasional program loyalitas dan pencetakan statement menghadapi kendala signifikan di lapangan:

### 2.1 Permasalahan di Lapangan (Pain Points)

| No | Masalah Operasional Lama | Dampak Bisnis / Risiko |
|:--:|:---|:---|
| **1** | **Data POS Terfragmentasi (`131-XXXXXX`)**<br>Satu pelanggan riil (misal pemilik 3 warung/cabang martabak) tercatat di POS dengan kode berbeda-beda dan nama yang tidak konsisten (contoh: "MARTABAK 88", "MTBK 88 CABANG", "BAPAK BUDI"). | Total omzet pelanggan tidak terkonsolidasi. Pelanggan kehilangan hak tier reward, dan manajemen tidak mengetahui nilai riil (*Customer Lifetime Value*) dari mitra grosirnya. |
| **2** | **Kalkulasi Reward Manual & Rentan Sengketa**<br>Perhitungan poin promo memiliki aturan berbeda antar kategori (Retail Rp 100k, Grosir Rp 200k, UKM Rp 50k, Kupon Rp 150k) dengan sistem pembulatan bawah (*floor*) per struk. | Staf kasir sering salah hitung jika dilakukan manual. Pelanggan komplain saat menukarkan reward atau menuntut hak kupon undian. |
| **3** | **Distribusi Kupon Undian Tidak Terlacak**<br>Kupon fisik bernomor seri dicetak ribuan lembar, dibagikan ke kasir tanpa pencatatan digital nomor seri berapa yang diberikan kepada siapa. | Risiko kecurangan (kupon ganda, nomor kupon fiktif, staf memberikan kupon ke pihak yang tidak berhak, atau kupon hilang tanpa jejak). |
| **4** | **Tidak Ada Visibilitas Penghematan Konsumen**<br>Konsumen sering membandingkan harga dengan kompetitor tanpa menyadari subsidi biaya parkir dan kurir yang diberikan Oriental. | Loyalitas pelanggan fluktuatif karena mereka tidak melihat nilai riil keuntungan belanja di Oriental. |
| **5** | **Penyalahgunaan Harga Grosir (Fraud/Pelanggaran)**<br>Ada mitra nakal yang membeli bahan dengan harga grosir khusus UKM tetapi menjual kembali bahan mentah ke pihak ketiga tanpa memproduksi kue. | Manajemen kesulitan menjatuhkan sanksi devaluasi poin/kupon secara sah dan transparan tanpa ada Berita Acara resmi. |
| **6** | **Pencatatan Pembelian Jelantah (UCO) Terpisah**<br>Pembelian limbah jelantah dari mitra UKM dicatat di buku terpisah, tidak berkontribusi pada poin loyalitas pelanggan. | Mitra UKM enggan menyetor limbah jelantah ke Oriental. |

---

### 2.2 Solusi yang Dihadirkan oleh Sistem CRM

```
        ┌─────────────────────────────────────────────────────────┐
        │       FILE EXCEL DARI MESIN KASIR POS LAMA              │
        │   (Format: 131-XXXXXX, Format Tanggal Acak, Header Beda)│
        └────────────────────────────┬────────────────────────────┘
                                     │
                                     ▼
      ┌─────────────────────────────────────────────────────────────┐
      │          RESILIENT EXCEL PARSER & FUZZY MATCHER             │
      │    • Kebal format XML rusak (tag 'biltinId' Excel lama)     │
      │    • Auto-detect format tanggal DD/MM/YYYY vs MM/DD/YYYY    │
      └──────────────────────────────┬──────────────────────────────┘
                                     │
                                     ▼
      ┌─────────────────────────────────────────────────────────────┐
      │         HIRARKI DATA "ORIENTAL ONE IDENTITY"                │
      │           Format Unik: 102-YYMMDD-NN (1 KTP/Owner)          │
      │       ├── Outlet / POS Alias 1 (Toko Utama)                 │
      │       ├── Outlet / POS Alias 2 (Cabang Pasar)               │
      │       └── Outlet / POS Alias 3 (Pangkalan UKM)              │
      └──────────────────────────────┬──────────────────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
┌────────────────────────────────┐                     ┌────────────────────────────────┐
│   CORE CALCULATION ENGINE      │                     │   MODUL PENDUKUNG OPERASIONAL  │
│ • Retail: Rp 100.000 / poin    │                     │ • Serah Terima Kupon Fisik     │
│ • Grosir: Rp 200.000 / poin    │                     │ • Waste Purchasing (UCO 10k=1p)│
│ • UKM:    Rp  50.000 / poin    │                     │ • Sanksi & Berita Acara Audit  │
│ • Kupon:  Rp 150.000 / kupon   │                     │ • Antrean Approval Anomali     │
│ • Math.floor() per invoice     │                     │ • Log Aktivitas & Security Salt│
└────────────────┬───────────────┘                     └────────────────┬───────────────┘
                 │                                                      │
                 └───────────────────────────┬──────────────────────────┘
                                             │
                                             ▼
       ┌─────────────────────────────────────────────────────────────┐
       │             E-STATEMENT ELEGAN 2 HALAMAN (A4)               │
       │  HALAMAN 1 (Untuk Customer):                                │
       │  • Omzet, Poin Promo, Penghematan Parkir & Kurir           │
       │  • Rincian Nomor Kupon Fisik (Rentang Berurutan + Pecahan)  │
       │  • Tanpa blok TTD Customer (Proses Kasir Cepat)             │
       │                                                             │
       │  HALAMAN 2 (Untuk Internal Audit / Owner):                  │
       │  • Riwayat Transaksi & Rasio Cash vs Piutang 13 Bulan       │
       │  • Audit Trail Penerbitan Kupon & Berita Acara Sanksi       │
       └─────────────────────────────────────────────────────────────┘
```

---

## 3. EVOLUSI & REKAM JEJAK PENGERJAAN (SPRINT ROADMAP)

Pembangunan platform ini dijalankan secara bertahap dan terukur melalui **10 Sprint Pengembangan**:

### 🎯 Sprint 0: Inisiasi Data & Engine Impor POS Resilien
* **Fokus**: Merancang fondasi arsitektur data dan membaca ekspor data transaksi POS lama tanpa error.
* **Tantangan Teknis**: File Excel dari POS Watampone sering rusak saat dibaca pustaka standar akibat atribut `biltinId` dan perbedaan format lokal tanggal (`DD/MM/YYYY` vs `MM/DD/YYYY`).
* **Hasil Pengerjaan**:
  - Implementasi schema SQLite menggunakan `better-sqlite3` dengan mode Write-Ahead Logging (`WAL`).
  - Pembuatan parser Excel tangguh (`src/lib/excel-parser.ts`) yang mampu membersihkan tag XML korup sebelum diurai.
  - Skema tabel `customers`, `pos_aliases`, dan `invoices`.

### 🎯 Sprint 1: Core Calc Engine & Statement Rendering 2 Halaman
* **Fokus**: Merumuskan aturan perhitungan poin bisnis dan mencetak statement 2 halaman presisi A4.
* **Tantangan Teknis**: Pembulatan per transaksi vs pembulatan total omzet bulanan. Customer komplain jika hasil tidak sesuai aturan `Math.floor` per struk.
* **Hasil Pengerjaan**:
  - Modul kalkulasi deterministik (`src/lib/calc.ts`) yang menerapkan:
    - Retail: 1 Poin per kelipatan Rp 100.000
    - Grosir: 1 Poin per kelipatan Rp 200.000
    - UKM: 1 Poin per kelipatan Rp 50.000
    - Kupon Undian: 1 Kupon per kelipatan omzet Rp 150.000
  - Halaman 1: Dokumen resmi untuk pelanggan dengan kartu ringkasan omzet, perolehan poin, kupon, dan estimasi hemat.
  - Halaman 2: Lembar audit internal memuat tabel 13 bulan riwayat transaksi, status lunas vs piutang, dan tanda tangan otorisasi internal.
  - CSS Print Media Query presisi A4 tanpa margin bocor antar halaman.

### 🎯 Sprint 2: Modul Kupon Undian & Serah Terima Fisik (`/coupons`)
* **Fokus**: Menghubungkan perhitungan hak kupon digital dengan nomor seri fisik kupon kertas berstempel.
* **Tantangan Teknis**: Mencegah kasir memberikan nomor kupon yang tumpang tindih (*overlap*) antar pelanggan atau antar bulan.
* **Hasil Pengerjaan**:
  - Format standar kode kupon: `ORT-KUPYYMM-NNNN` (contoh: `ORT-KUP2609-0001` s/d `2500`).
  - Kapasitas stok terdaftar: 50 bundel (2.500 lembar) per periode bulanan.
  - Form serah terima kupon fleksibel:
    - Mode Input Bundel Cepat (Pilih Bundel #1 s/d #50).
    - Mode Rentang Nomor Seri (*Start Number* ke *End Number*).
    - Mode Custom (Daftar nomor satuan yang dipisahkan koma).
  - Validasi ketat bentrok nomor seri di tingkat database (`UNIQUE` index).
  - Fitur Lookup Pemenang Kupon Doorprize secara instan berdasarkan nomor tiket.

### 🎯 Sprint 3: Modul Sanksi Pelanggaran & Devaluasi Akun (`/penalties`)
* **Fokus**: Penegakan disiplin kemitraan grosir dan audit kecurangan harga.
* **Tantangan Teknis**: Mengamankan aksi penjatuhan sanksi agar tidak disalahgunakan kasir dan tercatat sah pada lembar statement.
* **Hasil Pengerjaan**:
  - Modul sanksi (`/penalties`) dengan dua tipe sanksi: *Sementara* (periode tertentu) dan *Permanen* (blokir akun).
  - Devaluasi otomatis: Pembatalan (*void*) kupon undian aktif dan pemotongan saldo poin reward.
  - Otorisasi berlapis: Mewajibkan input kata sandi Owner sebelum sanksi dapat disimpan ke sistem.
  - Tampilan otomatis "Berita Acara Pelanggaran" pada Halaman 2 Statement untuk transparansi audit legal.

### 🎯 Sprint 4: Modul Pembelian Limbah Jelantah / UCO (`/waste-purchases`)
* **Fokus**: Diversifikasi bisnis ramah lingkungan dan integrasi loyalitas mitra makanan/gorengan.
* **Tantangan Teknis**: Nilai transaksi limbah adalah *pengeluaran kas* bagi Oriental (pembelian dari mitra), bukan omzet penjualan, namun harus menghasilkan poin reward.
* **Hasil Pengerjaan**:
  - Modul pencatatan timbangan dan pembelian minyak jelantah per outlet mitra (`/waste-purchases`).
  - Aturan konversi reward: Pembelian jelantah Rp 10.000 = 1 Poin Reward (tanpa hak kupon undian penjualan).
  - Pemisahan analitik di Dashboard agar omzet penjualan bersih tidak tercampur dengan biaya pembelian limbah.

### 🎯 Sprint 5: Modul Nilai Penghematan Customer (Customer Savings)
* **Fokus**: Edukasi nilai tambah (*value proposition*) bagi mitra grosir dan retail.
* **Hasil Pengerjaan**:
  - Algoritma estimasi hemat biaya operasional:
    - Penghematan Parkir: Rp 2.000 per transaksi di kasir.
    - Subsidi Ongkos Kirim / Kurir: Rp 15.000 per transaksi pengiriman grosir.
  - Tampilan visual *Customer Savings Summary* di Halaman 1 Statement untuk meningkatkan retensi mitra.

### 🎯 Sprint 6: Antrean Approval & Pemetaan Entitas Dinamis (`/approvals`)
* **Fokus**: Menangani data kotor dari kasir POS secara semi-otomatis tanpa menghentikan proses impor.
* **Hasil Pengerjaan**:
  - Antrean persetujuan (*Approval Queue*) untuk alias POS baru yang belum terdaftar di sistem.
  - Fitur pencocokan fuzzy (*Fuzzy Matching*) untuk merekomendasikan entitas induk yang paling mendekati.
  - Opsi instan: *Tautkan ke Pelanggan Eksisting* atau *Buat Pelanggan Baru One Identity*.

### 🎯 Sprint 7: Deaktivasi Outlet & Proteksi Inaktivitas 3 Bulan
* **Fokus**: Higienitas basis data pelanggan dan proteksi integritas omzet.
* **Hasil Pengerjaan**:
  - Status aktif/nonaktif pada tingkat outlet/alias POS.
  - Logika pendeteksi toko tutup atau vakum $\ge 3$ bulan berturut-turut.
  - Peringatan sistem saat ada invoice baru yang mencoba mengklaim omzet atas nama outlet nonaktif.

### 🎯 Sprint 8: Pengerasan Keamanan, Backup Otomatis, & Cloud VPS Deployment
* **Fokus**: Membawa aplikasi dari komputer lokal ke server produksi cloud VPS yang aman dan selalu aktif.
* **Hasil Pengerjaan**:
  - Penggantian plain-text password dengan algoritma derivasi kunci **scrypt** ber-salt kriptografis 16-byte (`src/lib/auth.ts`).
  - Penambahan proteksi *rate-limiting* dan pencegahan serangan *brute force* pada formulir login dan otorisasi sanksi.
  - Script backup otomatis database SQLite harian jam 23:00 WIB:
    - Task Scheduler di Windows lokal (`setup-windows-task.ps1`).
    - Cron Job di server Linux VPS (`scripts/cron-backup.sh`).
  - Deployment ke Server VPS Cloud Ubuntu 24.04 LTS:
    - Alamat IP: `139.190.98.215` (Port `3000`).
    - Manajemen proses menggunakan **PM2** (`oriental-crm`) dengan auto-restart saat reboot.

### 🎯 Sprint 9: Redesain Halaman 1 Statement & Resolusi Kupon Cross-Period
* **Fokus**: Efisiensi proses antrean kasir dan akurasi bukti penyerahan kupon fisik.
* **Permasalahan Lapangan yang Diselesaikan**:
  1. *Antrean Kasir Terhambat*: Blok tanda tangan customer di Halaman 1 memperlambat penyerahan statement karena kasir harus menunggu customer membubuhkan tanda tangan.
  2. *Kurangnya Transparansi Kupon*: Customer hanya melihat angka jumlah kupon (misal: "Dapat 12 Kupon"), tetapi tidak tahu nomor seri kupon mana yang sah menjadi milik mereka.
  3. *Bug Kupon Lintas Periode (Kasus RS Datu Pancaitana)*: Faktur omzet bulan September diserahkan kupon fisik dari stok bundel bulan Oktober. Akibatnya nomor kupon tidak tampil di cetakan statement September.
* **Hasil Pengerjaan**:
  - Penghapusan total blok tanda tangan customer pada Halaman 1 Statement.
  - Penambahan rincian nomor kupon fisik pada kotak Hak Kupon Undian dengan **Layout Adaptif**:
    - $\le 10$ Kupon: Ditampilkan lengkap satu per satu dalam badge rapi.
    - $> 10$ Kupon: Diringkas cerdas menggunakan rentang berurutan (misal: `ORT-KUP2610-0001 s/d 0050`) dan nomor pecahan ganjil ditampilkan tersendiri di sampingnya.
  - Penyempurnaan query kalkulasi (`src/lib/calc.ts`): Sistem kini secara otomatis mendeteksi kupon fisik yang diserahkan untuk customer tersebut meskipun nomor seri kupon berasal dari stok awal bulan berikutnya (*cross-period booklet fallback*).
  - Pemasangan penanda visual status: Badge hijau `(SUDAH DISERAHKAN FISIK)` atau badge kuning `(BELUM DIAMBIL DI KASIR)`.

---

## 4. ARSITEKTUR SISTEM, DATABASE, & LOGIKA BISNIS

### 4.1 Tech Stack
* **Framework**: Next.js 16 (React 19, TypeScript, App Router).
* **Database**: SQLite 3 via `better-sqlite3` (Zero-latency serverless embedded DB, WAL mode).
* **Styling**: Tailwind CSS + Custom Print CSS (`@media print` A4 engine).
* **Ikonografi**: Lucide React.
* **Keamanan**: Node.js Native Crypto (`scrypt` + Salt).
* **Process Manager**: PM2 Node.js daemon.

### 4.2 Skema Database Inti

```
┌───────────────────────────┐         1:N         ┌───────────────────────────┐
│         customers         │────────────────────<│        pos_aliases        │
│  (One Identity Master)    │                     │  (Kode POS 131-XXXXXX)    │
│  id: 102-YYMMDD-NN        │                     │  alias_name, branch_loc   │
└─────────────┬─────────────┘                     └─────────────┬─────────────┘
              │ 1:N                                             │ 1:N
              │                                                 ▼
              │                                   ┌───────────────────────────┐
              │                                   │         invoices          │
              │                                   │  invoice_no, date, amount │
              │                                   │  channel (Retail/Grosir)  │
              │                                   └───────────────────────────┘
              │
              ├─────────────────< ┌───────────────────────────┐
              │ 1:N               │      coupon_receipts      │
              │                   │  receipt_no, receipt_date │
              │                   │  total_coupons, staff_name│
              │                   └─────────────┬─────────────┘
              │                                 │ 1:N
              │                                 ▼
              │                   ┌───────────────────────────┐
              │                   │          coupons          │
              │                   │  code: ORT-KUPYYMM-NNNN   │
              │                   │  period_month, status     │
              │                   └───────────────────────────┘
              │
              ├─────────────────< ┌───────────────────────────┐
              │ 1:N               │         penalties         │
              │                   │  penalty_type, reason     │
              │                   │  points_deducted, void_cup│
              │                   └───────────────────────────┘
              │
              └─────────────────< ┌───────────────────────────┐
                1:N               │      waste_purchases      │
                                  │  kg_collected, total_cost │
                                  │  points_earned (10k = 1p) │
                                  └───────────────────────────┘
```

### 4.3 Logika Penomoran & Formula Kunci
1. **Identitas Pelanggan (`102-YYMMDD-NN`)**:
   - `102`: Kode cabang Oriental Bone.
   - `YYMMDD`: Tanggal pertama kali pelanggan terdaftar di sistem.
   - `NN`: Nomor urut pendaftaran harian (01, 02, ...).
2. **Kupon Undian (`ORT-KUPYYMM-NNNN`)**:
   - `YYMM`: Periode pencetakan bundel (misal `2609` = September 2026).
   - `NNNN`: Nomor urut 4 digit (0001 s/d 2500 per periode).
3. **Penyusunan Rincian Kupon di Statement**:
   $$\text{Kupon Dihasilkan} = \sum_{\text{faktur}} \left\lfloor \frac{\text{Nilai Faktur}}{\text{Rp 150.000}} \right\rfloor$$
   Jika kupon fisik telah dicatat di `/coupons`, sistem melakukan komparasi nomor seri secara numerik:
   - Bilangan berurutan dengan selisih $= 1$ digabung menjadi: `[Awal] s/d [Akhir]`.
   - Bilangan terpisah/pecahan ditampilkan utuh.

---

## 5. INFRASTRUKTUR, KEAMANAN, & DEPLOYMENT PRODUKSI

### 5.1 Spesifikasi Server Produksi Cloud VPS
* **Provider**: Cloud VPS (Ubuntu 24.04 LTS).
* **Alamat IP**: `139.190.98.215`
* **Port Layanan**: `3000` (dikelola oleh PM2).
* **Direktori Aplikasi**: `/home/oriental/oriental-crm`
* **Nama Layanan PM2**: `oriental-crm` (ID: `1`, status: *online*).
* **Akses SSH**: Menggunakan SSH Key RSA (`$HOME\.ssh\oriental123.pem`) via user `oriental`.

### 5.2 Manajemen Backup & Ketahanan Bencana
Untuk mencegah hilangnya data akibat kerusakan perangkat keras atau kegagalan sistem:
1. **Penyimpanan Lokal**: Backup otomatis dieksekusi setiap malam pukul 23:00 WIB via script PowerShell `scripts/backup-db.ps1` ke direktori `backups/`.
2. **Server Produksi**: Cron job di VPS mengeksekusi script snapshot database SQLite setiap hari dan mengompresnya dalam arsip bertanggal.
3. **Integritas WAL**: Sebelum dicadangkan, SQLite mengeksekusi `PRAGMA wal_checkpoint(TRUNCATE)` untuk memastikan seluruh transaksi memori telah tertulis utuh di file `.db`.

---

## 6. SOP OPERASIONAL BULANAN (MONTHLY CLOSING PLAYBOOK)

Berikut adalah panduan langkah demi langkah yang harus dijalankan staf setiap akhir bulan:

```
    LANGKAH 1               LANGKAH 2               LANGKAH 3               LANGKAH 4
 ┌─────────────┐         ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
 │ EKSPOR POS  │         │ VERIFIKASI  │         │ SERAH TERIMA│         │ CETAK & SERAH│
 │   & IMPOR   │ ─────>  │  APPROVAL   │ ─────>  │ KUPON FISIK │ ─────>  │  STATEMENT  │
 └─────────────┘         └─────────────┘         └─────────────┘         └─────────────┘
  Upload file             Periksa alias           Input bundel            Cetak A4 Hal 1
  Excel POS ke            baru di menu            nomor kupon ke          ke customer,
  menu /invoices          /approvals              menu /coupons           Hal 2 disimpan
```

1. **Langkah 1: Impor Data POS**:
   - Tarik file laporan transaksi bulanan dari mesin kasir POS Watampone.
   - Buka menu **Faktur Penjualan (`/invoices`)** $\rightarrow$ Unggah file Excel.
   - Tunggu parser memproses data dan mengecek duplikasi faktur.
2. **Langkah 2: Verifikasi & Approval Alias Baru**:
   - Buka menu **Approval (`/approvals`)**.
   - Jika terdapat outlet atau nama toko baru yang belum dikenali sistem, tautkan ke pelanggan induk One Identity eksisting atau buat pelanggan baru.
3. **Langkah 3: Serah Terima Kupon Fisik**:
   - Buka menu **Manajemen Kupon (`/coupons`)**.
   - Pilih pelanggan yang berhak mendapatkan kupon undian.
   - Input nomor bundel kupon fisik yang diserahkan kasir kepada pelanggan (misal: Bundel #1 nomor 0001 - 0050).
   - Simpan tanda terima digital.
4. **Langkah 4: Cetak & Distribusi Statement**:
   - Buka menu **Cetak Statement (`/statement`)**.
   - Pilih nama pelanggan dan bulan berjalan.
   - Klik **Cetak Statement**:
     - *Halaman 1*: Berikan kepada customer saat kunjungan toko atau kirim via PDF WhatsApp.
     - *Halaman 2*: Simpan di ordner kasir/owner sebagai arsip audit piutang dan kepatuhan.

---

## 7. STATUS SAAT INI & CATATAN PENGEMBANGAN MASA DEPAN

### 7.1 Status Sistem Saat Ini (Produksi)
* Sistem beroperasi penuh (*fully functional*) di Server VPS `139.190.98.215:3000`.
* Repositori GitHub telah terintegrasi di cabang `main` dengan status commit sinkron.
* Fitur nomor seri kupon fisik adaptif dan eliminasi blok tanda tangan telah aktif di lingkungan live.

### 7.2 Rekomendasi Fitur Lanjutan (Next Roadmap)
1. **WhatsApp Notifikasi Otomatis**: Pengiriman ringkasan statement bulanan dan perolehan kupon langsung ke nomor WA pelanggan via integrasi WA Gateway / Baileys.
2. **Portal Loyalitas Pelanggan Mandiri (Customer Mobile View)**: Memberikan tautan atau scan QR code pada struk belanja agar pelanggan dapat mengecek sisa poin dan tiket undian aktif mereka secara mandiri dari smartphone.
3. **Dashboard Analitik Tren Produk**: Grafik produk yang paling banyak dibeli oleh tier UKM dan Grosir untuk membantu manajemen menentukan strategi promo bahan kue bulanan.

---
*Dokumen ini disusun sebagai catatan resmi jejak pengembangan dan manual tata kelola sistem bagi manajemen PT. Oriental Bakery & Swalayan.*
