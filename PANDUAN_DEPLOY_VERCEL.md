# Panduan Deploy Webapp ke Vercel (Cloud Serverless)

Aplikasi **Oriental CRM Customer Statement** kini siap untuk dideploy ke **Vercel** dengan database cloud **Firebase Firestore**.

---

## Langkah 1: Pastikan Kode Ter-push ke GitHub

Jalankan perintah berikut di terminal komputer Anda:
```bash
git push -u origin main
```
*(Pastikan branch `main` berhasil terunggah ke https://github.com/akunbelajarbareng/testcatatmember)*

---

## Langkah 2: Hubungkan Repositori ke Vercel

1. Buka browser dan login ke **[https://vercel.com/](https://vercel.com/)** (disarankan menggunakan opsi **Continue with GitHub**).
2. Di halaman Dashboard Vercel, klik tombol **"Add New..."** (di kanan atas) > pilih **"Project"**.
3. Di daftar repositori GitHub yang muncul, cari dan pilih **`testcatatmember`**, lalu klik tombol **Import**.

---

## Langkah 3: Konfigurasi Environment Variables di Vercel (Krusial)

Sebelum menekan tombol *Deploy*, buka menu accordion **"Environment Variables"** pada halaman setup Vercel, lalu tambahkan 3 variabel berikut yang diambil dari file `serviceAccountKey.json`:

| Key (Nama Variabel) | Nilai (Value) |
|---|---|
| `FIREBASE_PROJECT_ID` | `oriental-crm-221e3` |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-fbsvc@oriental-crm-221e3.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | *(Salin seluruh isi `"private_key"` dari file `serviceAccountKey.json`, termasuk `-----BEGIN PRIVATE KEY-----` dan `-----END PRIVATE KEY-----`)* |

> [!NOTE]
> Vercel akan otomatis menangani karakter baris baru (*newline*) pada private key dengan aman.

---

## Langkah 4: Klik Deploy

1. Klik tombol biru **"Deploy"**.
2. Tunggu proses kompilasi dan bundling sekitar 1–2 menit.
3. Setelah selesai, Vercel akan menampilkan layar perayaan *"Congratulations!"* dan memberikan URL/Domain publik resmi (misal: `https://testcatatmember.vercel.app`).

---

## Langkah 5: Login & Pengujian di Vercel

1. Buka URL Vercel yang diberikan.
2. Login menggunakan akun:
   - **Username**: `admin`
   - **Password**: `oriental2026`
   *(Atau kasir: `kasir` / `kasir2026`)*
3. Masuk ke menu **Pengaturan**:
   - Pastikan status koneksi database terhubung ke Firebase Firestore `oriental-crm-221e3`.
4. Coba lakukan pencarian kupon di menu **Lookup Kupon** (contoh: `ORT-KUP2610-0001`). Data akan langsung ditarik dari Firebase Cloud!
