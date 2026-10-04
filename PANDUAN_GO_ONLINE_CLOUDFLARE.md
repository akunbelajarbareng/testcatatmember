# Panduan Resmi Go-Online: Cloudflare Tunnel — Oriental CRM

Panduan ini menjelaskan cara mempublikasikan aplikasi **Oriental CRM** ke internet publik secara aman, gratis, dan tanpa membuka port router menggunakan **Cloudflare Tunnel (Argo Tunnel)**.

---

## 🌟 Mengapa Cloudflare Tunnel adalah Solusi Terbaik?

1. **Database Tetap di Komputer Lokal:** Sesuai [PRD Bagian 2](file:///c:/01.%20Chandra/01.%20Project%20Vibe%20Code/03.%20Mini%20Webapp%20Untuk%20CRM%20cetak%20Statement/PRD%20Webapp%20CRM%20Oriental%20Customer%20Statement%20v0.1.md#L15-L17), database SQLite tetap berada di PC kantor Oriental. Data transaksi pelanggan tidak tersimpan di server cloud pihak ketiga.
2. **Koneksi Terenkripsi (HTTPS Otomatis):** Dilindungi sertifikat SSL resmi Cloudflare tanpa biaya.
3. **Bisa Diakses dari Luar Kantor:** Owner dan staf dapat membuka CRM dari smartphone atau laptop saat di luar kantor.
4. **Tanpa Perlu IP Publik Statis:** Bekerja langsung di balik modem IndiHome/Biznet/FirstMedia biasa tanpa perlu port forwarding.
5. **Gratis 100%:** Layanan Cloudflare Tunnel untuk kebutuhan ini tidak dipungut biaya bulanan.

---

## 🚀 TAHAP 1: Menyiapkan Aplikasi Mode Produksi

Aplikasi wajib dijalankan dalam mode produksi (*Production Mode*), bukan `npm run dev`:

1. Buka folder proyek di Windows Explorer.
2. Jalankan file [`start-production.bat`](file:///c:/01.%20Chandra/01.%20Project%20Vibe%20Code/03.%20Mini%20Webapp%20Untuk%20CRM%20cetak%20Statement/start-production.bat) (klik ganda).
3. Server produksi akan aktif di `http://localhost:3000`.

> [!TIP]
> **Agar Server Otomatis Berjalan saat Komputer Dinyalakan:**
> 1. Tekan tombol `Windows + R` di keyboard, ketik `shell:startup`, lalu tekan **Enter**.
> 2. Klik kanan file [`start-silent.vbs`](file:///c:/01.%20Chandra/01.%20Project%20Vibe%20Code/03.%20Mini%20Webapp%20Untuk%20CRM%20cetak%20Statement/start-silent.vbs), pilih **Create shortcut (Buat pintasan)**.
> 3. Pindahkan pintasan tersebut ke dalam jendela `shell:startup`. Server Next.js akan otomatis berjalan di latar belakang setiap kali komputer dinyalakan.

---

## 🌐 TAHAP 2: Mengaktifkan Cloudflare Tunnel

### Opsi A: Quick Tunnel (Uji Coba Cepat — 1 Menit)
*Cocok untuk langsung mencoba membuka web dari HP saat ini juga tanpa perlu daftar akun.*

1. Buka **PowerShell** sebagai Administrator.
2. Install Cloudflare daemon (jika belum terpasang):
   ```powershell
   winget install Cloudflare.cloudflared
   ```
3. Jalankan perintah tunnel:
   ```powershell
   cloudflared tunnel --url http://localhost:3000
   ```
4. Di layar terminal akan muncul tautan HTTPS publik, contoh:
   ```
   https://oriental-crm-xyz123.trycloudflare.com
   ```
5. Buka tautan tersebut di browser HP atau laptop di luar kantor. Anda akan langsung melihat halaman login aman Oriental CRM!

---

### Opsi B: Named Tunnel Permanen (Menggunakan Domain Sendiri)
*Cocok untuk operasional tetap sehari-hari (contoh: `crm.oriental.co.id` atau domain toko).*

1. **Daftar Akun Cloudflare:** Buka [dash.cloudflare.com](https://dash.cloudflare.com) (Gratis).
2. **Buka Zero Trust:** Di bilah kiri, klik menu **Zero Trust** → **Networks** → **Tunnels**.
3. **Buat Tunnel Baru:**
   - Klik **Create a tunnel**.
   - Pilih jenis konektor: **Cloudflared**.
   - Beri nama tunnel: `oriental-crm-office`.
4. **Instalasi pada Komputer Toko:**
   - Pilih sistem operasi **Windows (64-bit)**.
   - Salin perintah instalasi yang disediakan Cloudflare (berisi token unik Anda), contoh:
     ```powershell
     cloudflared.exe service install eyJhIjoiZ...
     ```
   - Tempel dan jalankan di PowerShell Administrator.
   - *Status konektor di dashboard Cloudflare akan berubah menjadi hijau (ACTIVE).*
5. **Arahkan Domain ke Aplikasi Lokal:**
   - Di tab **Public Hostname**, klik **Add a public hostname**.
   - Masukkan subdomain: misal `crm` pada domain Anda `oriental...`.
   - Pada kolom **Service**:
     - Type: `HTTP`
     - URL: `localhost:3000`
   - Klik **Save Tunnel**.
6. **Selesai!** 
   - Aplikasi kini dapat diakses permanen melalui `https://crm.oriental...`.
   - Layanan berjalan sebagai **Windows Service** otomatis di background 24 jam nonstop meskipun komputer di-restart.

---

## 🔒 Checklist Keamanan Sebelum Digunakan Publik

Pastikan langkah berikut telah dilakukan:
- [x] **Password Hashing:** Password telah di-hash dengan `scrypt` bawaan (Sprint 5).
- [x] **API Auth Guard:** Seluruh endpoint API dilindungi sesi aktif (Sprint 5).
- [x] **Rate Limiting:** Proteksi brute-force login aktif (Sprint 5).
- [x] **Quick Login Dimatikan:** Akun demo bawaan otomatis disembunyikan pada mode produksi (Sprint 5).
- [x] **One-Click Backup:** Tombol cadangan database aktif di menu Pengaturan (Sprint 6).
- [ ] **Ganti Password Default:** Masuk ke menu **Pengaturan**, perbarui Password Owner dari bawaan `oriental2026` ke password rahasia baru Anda.
- [ ] **Aktifkan Jadwal Backup:** Jalankan `scripts\setup-windows-task.ps1` untuk mencadangkan database otomatis setiap malam pukul 23:00.
