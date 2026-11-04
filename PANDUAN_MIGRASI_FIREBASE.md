# Panduan Setup & Migrasi Database ke Firebase Firestore

Panduan ini menjelaskan langkah demi langkah untuk mengaktifkan Firebase Firestore pada aplikasi **Oriental CRM Customer Statement** dan memindahkan data yang ada dari SQLite lokal ke cloud Firestore.

---

## 1. Langkah Persiapan di Firebase Console

1. **Buka Firebase Console**: [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. **Buat atau Pilih Proyek**:
   - Klik **"Add project"** (atau pilih proyek yang sudah ada).
   - Beri nama proyek (misal: `oriental-crm`).
3. **Aktifkan Firestore Database**:
   - Di menu sebelah kiri, pilih **Build > Firestore Database**.
   - Klik **Create Database**.
   - Pilih lokasi database terdekat (misal: `asia-southeast2` untuk Jakarta atau `asia-southeast1` untuk Singapura).
   - Pilih mode keamanan (Start in **production mode** atau **test mode**).
4. **Dapatkan Kunci Akun Layanan (Service Account Key)**:
   - Klik ikon gerigi ⚙️ (di pojok kiri atas) > **Project settings**.
   - Pilih tab **Service accounts**.
   - Klik tombol **Generate new private key** > konfirmasi **Generate key**.
   - Browser akan mengunduh sebuah file JSON (misal: `oriental-crm-firebase-adminsdk-xxxxx.json`).

---

## 2. Memasang Kredensial ke Webapp

Pilih salah satu dari 2 cara termudah berikut:

### Opsi A (Paling Mudah): Letakkan File JSON Langsung
1. Ganti nama file JSON yang baru diunduh menjadi: `serviceAccountKey.json`.
2. Letakkan file `serviceAccountKey.json` langsung di root folder proyek webapp ini:
   ```
   c:\01. Chandra\01. Project Vibe Code\03. Mini Webapp Untuk CRM cetak Statement\serviceAccountKey.json
   ```
   *(File ini sudah otomatis diabaikan oleh `.gitignore` agar aman).*

### Opsi B: Menggunakan File `.env.local`
Buat file `.env.local` di root folder proyek berdasarkan template [`.env.example`](./.env.example):
```env
FIREBASE_PROJECT_ID=oriental-crm-xxxx
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@oriental-crm-xxxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

---

## 3. Eksekusi Migrasi Data dari SQLite ke Firestore

Setelah kredensial terpasang, jalankan perintah migrasi berikut di terminal:

```bash
node scripts/migrate-sqlite-to-firestore.js
```

Skrip ini akan secara otomatis memindahkan seluruh data riil dari `data/oriental_crm.db` ke Firestore:
- ✅ **identities** (131 member)
- ✅ **outlets** (165 unit usaha)
- ✅ **invoices** (1.769 baris transaksi POS)
- ✅ **coupons** (2.572 kupon undian)
- ✅ **coupon_batches** (163 riwayat serah terima)
- ✅ **rules_config** (konfigurasi rate poin/kupon)
- ✅ **approvals** (antrean persetujuan)
- ✅ **audit_log** (riwayat audit)
- ✅ **app_users** & **app_sessions** (autentikasi pengguna)
- ✅ **waste_purchases** & **member_penalties**

---

## 4. Struktur Koleksi Firestore yang Dihasilkan

| Nama Koleksi Firestore | Dokumen ID | Deskripsi |
|---|---|---|
| `identities` | `id` (contoh: `102-260901-01`) | Master One Identity per KTP |
| `outlets` | `id` (contoh: `102-260901-01-01-900`) | Outlet usaha di bawah Identity |
| `pos_aliases` | Auto ID / ID baris | Pemetaan nama POS ke outlet |
| `invoices` | Auto ID / ID baris | Transaksi belanja pelanggan |
| `statements` | `${identity_id}_${bulan}` | Rekap bulanan statement CRM |
| `coupons` | `nomor_kupon` (contoh: `ORT-KUP2609-0001`) | Nomor kupon fisik undian |
| `coupon_batches` | Auto ID | Batch serah terima kupon |
| `rules_config` | `kunci` (contoh: `rate_retail`) | Pengaturan konversi poin & kupon |
| `approvals` | Auto ID | Antrean persetujuan transaksi/anomali |
| `audit_log` | Auto ID | Log histori perubahan sistem |
| `app_users` | `username` (contoh: `admin`, `kasir`) | Kredensial akun sistem |
| `app_sessions` | `token` | Sesi login pengguna |

---

## 5. Penggunaan di Kode Aplikasi

Akses database Firestore di backend dapat langsung menggunakan singleton:
```typescript
import firestore, { COLLECTIONS } from '@/lib/firebase';

// Contoh: Ambil seluruh identity aktif
const snapshot = await firestore
  .collection(COLLECTIONS.IDENTITIES)
  .where('status', '==', 'aktif')
  .get();

const identities = snapshot.docs.map(doc => doc.data());
```

