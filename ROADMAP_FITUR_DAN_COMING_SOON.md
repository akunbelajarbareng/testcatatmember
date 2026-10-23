# 🚀 ROADMAP PENGEMBANGAN FITUR & COMING SOON
## Oriental CRM Customer Statement & Loyalty Operations

Dokumen ini memuat peta jalan (*product roadmap*), spesifikasi konseptual, dan rencana implementasi fitur-fitur baru (*Coming Soon*) untuk mentransformasi sistem **Oriental CRM** dari sekadar *mesin kalkulasi dan cetak statement kertas* menjadi **pusat operasional loyalitas, retensi pelanggan, dan distribusi omnichannel yang proaktif**.

---

## 📌 1. LATAR BELAKANG & VISI TRANSFORMASI

Sistem yang berjalan saat ini telah memiliki fondasi data dan kepatuhan akuntansi yang sangat solid:
1. Engine kalkulasi poin multi-tipe (Retail, Grosir, UKM Kuliner) dan kupon undian berjalan otomatis.
2. Integrasi pembelian limbah minyak jelantah (UCO) ke saldo poin telah berjalan rapi.
3. Manajemen sanksi, devaluasi akun, antrean approval anomali faktur, dan template cetak A4 2-halaman telah teruji presisi.

**Tantangan Operasional Berikutnya:**
* Ketergantungan pada **pencetakan fisik ribuan lembar kertas A4** menimbulkan beban biaya cetak, logistik, dan waktu sortir kasir yang besar.
* Belum tersedianya **jalur penukaran hadiah (*reward redemption*)**, sehingga pelanggan yang telah mengumpulkan ribuan poin belum dapat merasakan manfaat langsung.
* Sistem inaktivitas (3 bulan) bersifat **reaktif** (menunggu toko tutup), bukan **preventif** (mencegah pelanggan pindah ke kompetitor sebelum terlambat).
* Kurangnya alat bantu cepat (*quick-action tools*) di meja kasir untuk mendistribusikan kupon fisik secara real-time saat pelanggan datang berbelanja.

---

## 🗺️ 2. EMPAT PILAR PENGEMBANGAN FITUR UTAMA (*COMING SOON*)

```
┌────────────────────────────────────────────────────────────────────────┐
│             ORIENTAL CRM — NEXT-GEN FEATURE ROADMAP                   │
├─────────────────┬──────────────────┬──────────────────┬────────────────┤
│    PILAR 1      │     PILAR 2      │     PILAR 3      │    PILAR 4     │
│   DISTRIBUSI    │  REWARD & LOOF   │ RETENSI PROAKTIF │  FRONT-DESK    │
│  OMNICHANNEL &  │    REDEMPTION    │ & CHURN WARNING  │   KASIR & CS   │
│  WHATSAPP-FIRST │      SYSTEM      │   INTELLIGENCE   │   EXPERIENCE   │
└─────────────────┴──────────────────┴──────────────────┴────────────────┘
```

---

### 📱 PILAR 1: DISTRIBUSI DIGITAL & OTOMASI WHATSAPP (OMNICHANNEL STATEMENT)

Tujuan: Menghemat biaya cetak hingga 70%, mempercepat penerimaan informasi oleh pemilik toko, dan mempermudah akses riwayat poin langsung dari smartphone pelanggan.

#### 1.1. Fitur "Kirim Ringkasan Statement via WhatsApp" (1-Click Direct Share)
* **Deskripsi:** 
  Pada halaman daftar statement (`/statements`) dan pratinjau per-member (`/statements/[id]/[bulan]`), disediakan tombol aksi cepat **"Kirim ke WhatsApp"**.
* **Mekanisme Kerja:**
  * Mengambil nomor kontak WhatsApp utama pemilik outlet dari master data `identities`.
  * Membuka tautan universal `https://wa.me/{nomor}?text={encoded_message}` yang otomatis mengisi draf pesan resmi.
  * **Template Pesan Standar:**
    ```text
    Yth. Bapak/Ibu [Nama Pemilik] ([Nama Toko/Outlet])
    Oriental One Identity: [ID 102]

    Berikut adalah ringkasan Lembar Pernyataan Resmi Periode [Bulan Tahun]:
    • Total Belanja Bulan Ini : Rp [Total Belanja]
    • Perolehan Poin Baru     : [Poin Bulan Ini] Poin
    • Total Akumulasi Poin    : [Total Poin Aktif] Poin
    • Hak Kupon Undian        : [Kupon Bulan Ini] Lembar
    • Status Kupon Fisik      : [Sudah Diambil / Belum Diambil di Kasir]

    Rincian lengkap dan arsip dokumen resmi Anda dapat dilihat pada tautan berikut:
    👉 [URL Link E-Statement Digital]

    Terima kasih atas loyalitas dan kemitraan Anda bersama Oriental.
    ```

#### 1.2. Halaman Tampilan E-Statement Digital Publik (Mobile-Optimized Viewer)
* **Deskripsi:**
  Tautan pendek resmi yang ramah dibuka di browser smartphone (tanpa perlu download PDF berukuran besar terlebih dahulu).
* **Fitur Keamanan Ringan:**
  * URL unik berbasis token aman (misal: `/view-statement/{token_acak}`).
  * Dilengkapi proteksi verifikasi ringan (masukkan 4 digit terakhir nomor telepon member) agar data pembukuan tidak terbuka bebas ke publik.

#### 1.3. Manajemen Status Pelacakan Distribusi Statement
* **Deskripsi:**
  Menambahkan kolom status distribusi di tabel `/statements`:
  * `Draft` : Belum divalidasi akhir.
  * `Tercetak Fisik` : Sudah dicetak ke kertas A4 oleh tim admin.
  * `Terkirim WA` : Pesan notifikasi WhatsApp sudah dikirim oleh petugas.
  * `Terkonfirmasi` : Pelanggan sudah membuka tautan / menandatangani tanda terima.
* **Filter Operasional:** Kemampuan memfilter daftar statement berdasarkan: *"Hanya yang Belum Terkirim WA"* atau *"Hanya yang Belum Dicetak"*.

#### 1.4. Filter Cetak Batch Selektif (*Targeted Batch Print*)
* **Deskripsi:**
  Memperbarui halaman `/print/batch` agar tidak hanya mencetak *semua member*, melainkan dapat difilter berdasarkan:
  * Kota / Wilayah pengiriman kurir.
  * Klasifikasi Lini Bisnis (Khusus Grosir, Khusus Retail, atau Khusus UKM).
  * Status pengambilan kupon fisik (Hanya member yang punya kupon aktif).

---

### 🎁 PILAR 2: SISTEM REWARD & PENUKARAN POIN (REDEMPTION ENGINE)

Tujuan: Menutup siklus loyalitas (*loyalty loop*) sehingga poin yang dikumpulkan memiliki nilai nyata yang mendorong transaksi berulang (*repeat order*).

#### 2.1. Modul Master Katalog Hadiah (`/rewards`)
* **Deskripsi:**
  Menu pengaturan item hadiah yang dapat ditukarkan oleh pelanggan menggunakan poin Oriental mereka.
* **Atribut Data Hadiah:**
  * Nama Hadiah (contoh: *Voucher Belanja Rp 50.000*, *Minyak Goreng 2L*, *Merchandise Eksklusif*, *Potongan Faktur*).
  * Kategori Hadiah: Voucher Belanja, Produk Fisik, atau Potongan Diskon.
  * Poin yang Dibutuhkan (misal: 100 Poin, 250 Poin, 500 Poin).
  * Kuota / Stok Hadiah yang tersedia.
  * Periode Berlaku Penukaran.

#### 2.2. Antarmuka Klaim & Penukaran di Kasir (`/redemptions`)
* **Deskripsi:**
  Formulir penukaran poin instan yang dapat diakses oleh kasir/petugas CRM saat pelanggan datang:
  * Kasir memasukkan nomor One Identity atau mencari nama toko.
  * Sistem menampilkan sisa saldo poin yang sah dan dapat digunakan.
  * Kasir memilih item hadiah dan kuantitas penukaran.
  * Sistem memvalidasi kecukupan saldo poin secara *real-time*.
  * Mencetak **Bukti Tanda Terima Klaim Hadiah** dan otomatis memotong saldo poin member.

#### 2.3. Kebijakan & Peringatan Masa Kedaluwarsa Poin (*Point Expiry Warning*)
* **Deskripsi:**
  Pemberitahuan transparan pada statement:
  * Aturan masa berlaku poin (misal: Poin berlaku hingga 31 Desember tahun berjalan atau siklus 12 bulan).
  * Kotak sorotan pada Halaman 1 Statement: *"Poin yang akan kedaluwarsa pada akhir periode ini: XX Poin. Segera lakukan penukaran di kasir."*

---

### 🛡️ PILAR 3: RETENSI PROAKTIF & PERINGATAN DINI CHURN (CHURN PREVENTION INTELLIGENCE)

Tujuan: Mencegah pelanggan penting (terutama Grosir & UKM) berhenti berbelanja sebelum akun mereka masuk status inaktif permanen.

#### 3.1. Radar Pelanggan Siaga / Berisiko (*At-Risk Members Radar*)
* **Deskripsi:**
  Widget analitik di Dashboard Utama (`/`) yang mendeteksi pelanggan aktif yang mengalami penurunan frekuensi belanja:
  * **Kategori Kuning (Waspada):** Tidak ada transaksi belanja dalam **30–45 hari terakhir**.
  * **Kategori Oranye (Kritis):** Tidak ada transaksi belanja dalam **46–75 hari terakhir**.
  * **Kategori Merah (Hampir Nonaktif):** Mendekati batas 90 hari inaktivitas otomatis.
* **Prioritas Berdasarkan Kontribusi Omzet:**
  Menampilkan peringkat member berisiko berdasarkan riwayat belanja masa lalu (*High Value Customer at Risk*), sehingga tim CRM tahu pelanggan mana yang wajib diselamatkan terlebih dahulu.

#### 3.2. Segmentasi & Tingkatan Loyalitas (*Member Tiering*)
* **Deskripsi:**
  Klasifikasi otomatis akun member ke dalam tingkatan bergengsi:
  * 🥉 **Silver** : Pelanggan reguler.
  * 🥈 **Gold** : Pelanggan dengan omzet atau frekuensi belanja menengah.
  * 🥇 **Platinum / VIP** : Pelanggan kontributor omzet tertinggi (Grosir besar / UKM rutin).
* **Penyajian Visual:** Badge tingkatan member tercetak bangga pada header Lembar Statement Halaman 1.

#### 3.3. Buku Catatan Interaksi Pelanggan (*CRM Interaction Notes*)
* **Deskripsi:**
  Tab catatan operasional pada profil detail pelanggan (`/identities/[id]`):
  * Tim CRM / Kasir dapat menambahkan catatan khusus (misal: *"Owner toko minta konfirmasi via nomor WhatsApp anak/manajer toko"*, *"Jadwal pengiriman preferensi hari Selasa"*, *"Komplain nota faktur tanggal 10 sudah diselesaikan"*).
  * Membantu kontinuitas pelayanan antar-petugas kasir/CRM yang bertugas di shift berbeda.

---

### 🏪 PILAR 4: EFISIENSI OPERASIONAL KASIR & LAYANAN KUPON FISIK

Tujuan: Mengurangi waktu tunggu antrean di kasir saat pembagian kupon fisik dan memperkuat integritas acara pengundian berkala.

#### 4.1. Pop-Up Pengingat Kupon Belum Diambil (*Pending Coupon Alert*)
* **Deskripsi:**
  Saat kasir membuka profil pelanggan atau saat melakukan input transaksi limbah UCO, muncul banner peringatan ramah:
  > 🔔 **Info Kasir:** Pelanggan ini memiliki **X Lembar Kupon Fisik** periode berjalan yang belum diserah-terimakan. Tawarkan pengambilan kupon sekarang!

#### 4.2. Lembar Tanda Terima Serah-Terima Kupon Fisik Cepat
* **Deskripsi:**
  Fitur cetak tanda terima ringkas 1 lembar struk/slip (ukuran printer kasir / thermal / kertas A5) khusus untuk serah-terima kupon fisik dalam jumlah besar:
  * Mencantumkan rentang nomor seri yang diserahkan (`ORT-KUP2610-0101 s/d ORT-KUP2610-0150`).
  * Kolom tanda tangan cepat penerima sebagai bukti fisik bahwa kupon telah diserahkan di kasir.

#### 4.3. Digital Live Draw Simulator (Mesin Pengacakan Kupon Doorprize)
* **Deskripsi:**
  Modul layar penuh (*full-screen display*) untuk acara pengundian hadiah resmi:
  * Mengambil seluruh nomor kupon yang **berstatus aktif dan telah sah diserahkan**.
  * Animasi pengacakan nomor kupon yang dapat ditayangkan di layar monitor toko / proyektor saat hari pengundian.
  * Otomatis memvalidasi apakah kupon yang terpilih dimiliki oleh akun yang sah (bukan akun berstatus devaluasi sanksi / suspend).

---

## 📅 3. TAHAPAN & PRIORITAS IMPLEMENTASI (PHASED ROLLOUT)

Untuk menjaga stabilitas sistem dan efisiensi waktu pengerjaan, rencana pengembangan dibagi menjadi 3 fase terukur:

| Fase | Fokus Pengembangan | Fitur Kunci | Estimasi Kompleksitas |
|---|---|---|---|
| **Fase 1 (Quick Wins)** | Distribusi & Kemudahan Kasir | • Tombol Kirim WhatsApp 1-Klik<br>• Filter Cetak Batch Tertarget<br>• Alert Kupon Belum Diambil di Kasir | 🟢 Cepat & Berdampak Tinggi |
| **Fase 2 (Value Creation)** | Loyalty Loop & Penukaran | • Modul Katalog Hadiah (`/rewards`)<br>• Form Penukaran Poin Kasir (`/redemptions`)<br>• Pelacakan Status Distribusi Statement | 🟡 Menengah |
| **Fase 3 (Intelligence & Churn)** | Retensi & Pengalaman Pengundian | • Radar Pelanggan Siaga / At-Risk CRM<br>• Catatan Interaksi Pelanggan (CRM Notes)<br>• Digital Live Draw Simulator Doorprize | 🔵 Lanjutan |

---

## 📈 4. ESTIMASI MANFAAT & DAMPAK BISNIS (*EXPECTED BUSINESS IMPACT*)

1. **Efisiensi Anggaran Operasional:**
   Pengurangan biaya kertas, toner printer, dan tenaga sortir fisik hingga **50%–70%** melalui distribusi bertahap via WhatsApp.
2. **Peningkatan Kepuasan & Retensi Mitra Toko:**
   Pelanggan merasa transparan, diperhatikan secara personal melalui pesan WhatsApp bulanan, dan termotivasi mengumpulkan poin karena adanya katalog hadiah nyata.
3. **Penyelamatan Omzet Grosir & UKM:**
   Deteksi dini pada pelanggan yang 30–45 hari tidak berbelanja memungkinkan tim penjualan/CRM menghubungi mereka lebih awal sebelum beralih ke pemasok lain.
4. **Kecepatan Layanan di Meja Kasir:**
   Penyerahan kupon fisik dan pelayanan informasi poin berlangsung dalam hitungan detik tanpa memicu antrean panjang.

---

*Dokumen ini dirancang sebagai acuan strategis pengembangan sistem Oriental CRM berikutnya.*
