# PRD — Webapp CRM Oriental Customer Statement

**Versi:** 0.1 (Draft, menunggu persetujuan Direktur Utama) · **Tanggal:** 2 Oktober 2026 **Ruang lingkup:** hanya webapp CRM statement ini. Label di dokumen: **\[FINAL\]** = sudah diputuskan Direktur Utama · **\[USULAN\]** = belum dijawab, diajukan untuk disetujui.

---

## 1. Tujuan

Mengotomatiskan statement poin dan kupon bulanan per pemegang **Oriental One Identity** (1 KTP). Operator memasukkan/memilih ID, mengunggah export transaksi POS bulan berjalan, dan sistem menghitung poin dan kupon lalu menghasilkan statement sesuai desain yang sudah ada.

**Di dalam ruang lingkup:** impor master customer POS dan transaksi, pemetaan nama POS ke outlet, perhitungan, statement PDF, antrean approval, audit, backup. **Di luar ruang lingkup:** perubahan aplikasi kasir \[FINAL\], pencatatan penukaran poin/kupon (manual di luar sistem) \[FINAL\], bonus point, retur, void, deteksi duplikat berdasarkan isi (fase berikutnya) \[FINAL\].

## 2. Pengguna dan lingkungan

- Pengguna tunggal: **Owner** (login dengan kata sandi). Semua approval oleh Owner \[FINAL\].
- Berjalan di **komputer lokal**; database wajib aman dan ada backup \[FINAL\].

## 3. Istilah

| Istilah | Arti |
| --- | --- |
| One Identity | Identitas satu KTP; induk ID `102-YYMMDD-NN` |
| Outlet | Unit usaha di bawah One Identity: Retail (kartu), Grosir, UKM (bisa lebih dari satu) |
| Nama POS / Alias | Teks `Nama Customer` di export POS yang dipetakan ke satu outlet; satu outlet boleh punya banyak alias |
| Poin, Kupon | Hasil hitung per invoice (bagian 5). Istilah tercetak: **"Kupon"** \[FINAL\] |
| Periode | 1 Sep 2026 – 30 Sep 2027, 13 bulan, semua bulan menghasilkan poin dan kupon \[FINAL\] |

## 4. Identitas dan penomoran

1. Format \[FINAL\]: Retail = `102-YYMMDD-NN` + nomor barcode kartu; Grosir = `102-YYMMDD-NN-01-900`; UKM ke-n = `102-YYMMDD-NN-nn-100`. `102` = kode daerah Watampone.
2. Satu KTP = satu One Identity = **satu kartu Retail** \[FINAL\].
3. ID di POS belum tersebar: webapp **menerbitkan ulang ID bersih** dan menyimpan kode POS lama (`131-…`) sebagai **ID POS lama** \[FINAL\].
4. \[USULAN\] Aturan penerbitan ulang: ID yang sudah bersih (tidak bertabrakan, format benar) dipertahankan; yang bertabrakan/salah format diberi nomor urut baru dengan segmen tanggal lama; customer baru memakai tanggal daftar dan nomor urut berikutnya pada hari itu. Satu One Identity maksimal satu outlet Grosir.
5. Data identitas boleh kosong saat impor dan diisi bertahap; perubahan data identitas butuh approval \[FINAL\]. NIK disimpan terenkripsi, tampil disamarkan, tidak tercetak \[FINAL\]. Selama NIK kosong, sistem hanya memberi peringatan kemungkinan duplikat (nama/alamat mirip).
6. Kategori POS: `PC` = UKM, `PA` = Grosir, `RET` = Retail; `PB` dinonaktifkan \[FINAL\]. Tipe outlet (penentu rate) ditetapkan Owner saat mendaftarkan, kategori POS hanya petunjuk \[USULAN\].

## 5. Aturan perhitungan \[FINAL kecuali ditandai\]

| Aturan | Isi |
| --- | --- |
| Nilai dasar | Kolom `Jumlah` (setelah diskon dan ongkir); tanpa pengecualian barang |
| Poin | Per invoice: `floor(Jumlah ÷ rate)`; sisa pecahan hangus. Rate: Retail 100.000 · UKM 50.000 · Grosir 200.000 |
| Kupon | Per invoice: `floor(Jumlah ÷ 150.000)`, kelipatan, **tanpa batas** |
| Jenis bayar | KREDIT dan CAMPUR tetap dihitung |
| Yang dihitung | Hanya nama POS yang terpetakan ke outlet aktif. CASH, non-member, dan nama belum terpetakan tidak dihitung (peringatan) |
| Berlaku surut | Penentu adalah tanggal invoice. Semua invoice sejak 1 Sep 2026 dihitung begitu nama dipetakan, termasuk perbaikan nama di bulan berikutnya |
| Pengecualian | Per KTP, per rentang tanggal invoice: poin = 0 dan kupon = 0. Transaksi tetap tampil. Alasan tidak disimpan |
| Duplikat | Nomor invoice sama dan isi sama: dilewati. Isi identik tapi nomor beda: dianggap transaksi berbeda |
| Bonus Point | Fase berikutnya; kolom tetap tercetak berisi 0 \[USULAN\] |
| Akhir periode | Poin dan kupon hangus, saldo menjadi **nol**; penukaran dicatat manual di luar sistem |
| Aturan tersimpan | Rate dan nilai kupon di tabel konfigurasi yang hanya bisa diubah Owner dan dicatat di audit \[USULAN\] |

## 6. Impor data

**6.1 Master customer POS (Excel)** Dipakai: Kode (→ ID POS lama), Nama, Alamat, Kota, Kategori; opsional Kontak/HP untuk tindak lanjut \[USULAN\]. **Dibuang:** Saldo, Lama Kredit, Region \[FINAL\]. Baris anomali (nama kosong, nama ganda, kode tidak lazim, ID salah format) **tidak dibersihkan otomatis**: masuk antrean, Owner memilih *edit* atau *kecualikan* \[FINAL\].

**6.2 Export transaksi (Excel)** Dipakai: Tanggal, No Invoice, Nama Customer, Jenis, Jumlah. **Dibuang:** Modal, Profit, Persen, kolom No, baris `Sum` \[FINAL\]. Header harus sesuai; file dengan struktur berbeda ditolak. Parser harus tahan terhadap atribut style rusak (`biltinId`) yang ada pada file saat ini.

**6.3 Pencocokan nama**

| Kasus | Tindakan |
| --- | --- |
| Nama persis ada di tabel alias | Terhitung otomatis |
| Nama persis ada di master tapi belum dialiaskan | Peringatan, tidak dihitung, bisa dipetakan |
| Nama mirip tapi tidak identik dengan outlet lain | Notifikasi minta approval: sama atau berbeda \[FINAL\] |
| Satu nama dimiliki dua kode POS | Approval |
| Nomor invoice sama, nilai/nama/tanggal berubah | Approval: terima versi baru atau pertahankan lama \[FINAL\] |

## 7. Statement

Desain **tidak berubah** \[FINAL\]; salah ketik dikoreksi ("Customer", "Disetujui", "Diterima") \[FINAL\]; tanda tangan Management manual \[FINAL\]. Satu statement per One Identity \[FINAL\]; tabel outlet **dinamis** tanpa batas jumlah \[FINAL\]. Keluaran: PDF A4.

| Bagian | Sumber |
| --- | --- |
| Periode, nama, alamat | Database (alamat lengkap diisi bertahap) |
| Total poin dan kupon bulan berjalan | Jumlah hitung invoice bulan itu; bulan ini = poin + bonus (0) |
| Total poin dan kupon dimiliki | Kumulatif sejak awal periode |
| Rekap per outlet | ID outlet, nama, total transaksi, poin, kupon |
| Tabel 13 bulan (halaman 2) | Total transaksi, poin, bonus poin, kupon per bulan |

**Status:** Draft → **Final (dikunci)** → perubahan lewat approval Owner → **terbit ulang dengan nomor revisi** \[FINAL\]. Revisi bulan lama otomatis menandai statement bulan sesudahnya "perlu revisi" karena nilai kumulatif ikut berubah \[USULAN\]. Data identitas/alamat yang kosong hanya **peringatan**, tidak menghalangi finalisasi \[FINAL\]; nama yang belum terpetakan juga tidak menghalangi, tetapi bulan terkait ditandai "perlu terbit ulang" setelah dipetakan \[USULAN\]. Statement dibuat untuk One Identity yang punya transaksi atau saldo, dengan opsi "cetak semua" \[USULAN\]. Halaman 2 dicetak untuk arsip internal atau juga customer: **perlu diputuskan** (B4).

## 8. Alur kerja bulanan

1. Impor master (jika ada perubahan) → selesaikan antrean approval.
2. Unggah export transaksi bulan berjalan → sistem cek header, duplikat invoice, dan pencocokan nama.
3. Review peringatan dan antrean approval.
4. Pilih One Identity → pratinjau Draft → cetak/simpan PDF.
5. Finalisasi → statement dikunci. Perubahan berikutnya lewat approval dan revisi.

## 9. Model data (garis besar)

`identities` (id, nama pemilik, alamat lengkap, nik_terenkripsi, status) · `outlets` (id_outlet, identity_id, tipe, id_pos_lama, aktif) · `pos_aliases` (nama_pos, outlet_id) · `import_batches` · `invoices` (no_invoice, tanggal, nama_pos, jenis, jumlah, batch_id, poin, kupon, outlet_id) · `exclusions` (identity_id, dari, sampai) · `statements` (identity_id, bulan, status, revisi) · `rules_config` · `approvals` (jenis, payload, status) · `audit_log`.

## 10. Keamanan dan backup \[USULAN\]

Disk komputer terenkripsi; login Owner dengan kata sandi; NIK dienkripsi di database dengan kunci terpisah dari file database; audit log untuk semua perubahan; backup terenkripsi otomatis harian ke penyimpanan eksternal ditambah salinan mingguan di lokasi lain; uji pemulihan bulanan.

## 11. Kriteria penerimaan

**Kasus uji Pak Catur, September 2026** (setelah keempat outlet dipetakan):

- Total transaksi **Rp38.007.360**
- Poin **668**: Grosir 15 · Swalayan 2 · Café Simpang Badik 401 · RM Maliku 250
- Kupon **217**: Grosir 21 · Swalayan 0 · Simpang Badik 123 · Maliku 73
- Dua invoice Swalayan identik (nomor berbeda) dihitung terpisah.

**Kasus uji lain:** invoice di bawah rate = 0 poin; invoice Rp6.918.000 (UKM) = 138 poin dan 46 kupon; CASH dan nama tak terpetakan tidak dihitung; unggah ulang file yang sama tidak menggandakan; invoice berubah nilai masuk antrean; alias baru pada bulan lama menandai statement "perlu terbit ulang"; periode pengecualian menghasilkan 0 poin dan 0 kupon tetapi transaksi tetap tampil; saldo setelah akhir periode = 0.

## 12. Keputusan yang masih terbuka

| Kode | Pertanyaan | Usulan |
| --- | --- | --- |
| A2 | Nama belum terpetakan menghalangi finalisasi? | Tidak; hanya peringatan (bagian 7) |
| B2 | Revisi berantai | Statement sesudahnya ditandai otomatis |
| B3 | Member tanpa transaksi | Dibuat hanya bila ada transaksi/saldo |
| B4 | Halaman 2 untuk customer? | Perlu jawaban Owner |
| B5 | Kolom Bonus Point | Tercetak 0 |
| B6 | Rate per outlet | Ditentukan tipe outlet saat registrasi |
| B7 | Akun staf | Dikecualikan lewat periode nol |
| — | Aturan penerbitan ulang ID (bagian 4.4) dan keamanan (bagian 10) | Sesuai usulan |

## 13. Fase berikutnya

Bonus Point, retur dan void, deteksi duplikat berdasarkan isi, pencatatan penukaran poin dan kupon.