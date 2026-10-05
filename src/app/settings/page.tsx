"use client";
import React, { useEffect, useState } from "react";
import { Settings, Save, CheckCircle, AlertTriangle, Database, Shield, RefreshCw, Download } from "lucide-react";

interface Rule {
  id: number;
  kunci: string;
  nilai: number;
  keterangan: string;
  updated_at: string;
}

export default function SettingsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [stats, setStats] = useState<{ auditCount: number; batchCount: number; dbPath: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const json = await res.json();
      if (res.ok) {
        setRules(json.rules || []);
        setStats(json.stats || null);
        const map: Record<string, number> = {};
        (json.rules || []).forEach((r: Rule) => {
          map[r.kunci] = r.nilai;
        });
        setValues(map);
      }
    } catch {
      setMsg({ type: "error", text: "Gagal memuat konfigurasi" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (key: string) => {
    setSavingKey(key);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, nilai: values[key] }),
      });
      const json = await res.json();
      if (res.ok) {
        setMsg({ type: "success", text: `Konfigurasi ${key} berhasil diperbarui!` });
        loadSettings();
      } else {
        setMsg({ type: "error", text: json.error || "Gagal memperbarui konfigurasi" });
      }
    } catch {
      setMsg({ type: "error", text: "Gagal menyimpan konfigurasi" });
    } finally {
      setSavingKey(null);
    }
  };

  const getLabel = (kunci: string) => {
    switch (kunci) {
      case "rate_retail":
        return "Rate Konversi Poin — Retail (Swalayan)";
      case "rate_ukm":
        return "Rate Konversi Poin — UKM";
      case "rate_grosir":
        return "Rate Konversi Poin — Grosir";
      case "nilai_kupon":
        return "Nilai Kelipatan Kupon Undian (Semua Tipe)";
      case "harga_uco_per_kg":
        return "Harga Acuan Pembelian UCO per Kg";
      case "rate_waste_poin":
        return "Rate Poin Waste Purchasing (Perolehan 1 Poin)";
      case "saving_parkir_per_trx":
        return "Estimasi Hemat Parkir (per 1x Transaksi Belanja)";
      case "saving_kurir_per_trx":
        return "Estimasi Hemat Kurir/Antar (per 1x Transaksi Belanja)";
      default:
        return kunci;
    }
  };

  const getDesc = (kunci: string) => {
    switch (kunci) {
      case "rate_retail":
        return "Belanja kelipatan nilai ini mendapatkan 1 Oriental Point untuk member kategori Retail";
      case "rate_ukm":
        return "Belanja kelipatan nilai ini mendapatkan 1 Oriental Point untuk member kategori UKM";
      case "rate_grosir":
        return "Belanja kelipatan nilai ini mendapatkan 1 Oriental Point untuk member kategori Grosir";
      case "nilai_kupon":
        return "Setiap kelipatan nilai belanja ini mendapatkan 1 nomor kupon undian fisik";
      case "harga_uco_per_kg":
        return "Standar acuan harga pembelian minyak jelantah saat input transaksi baru (dapat disesuaikan kasir)";
      case "rate_waste_poin":
        return "Nilai rupiah pembelian waste untuk mendapatkan 1 Oriental Point (tidak menambah kupon undian)";
      case "saving_parkir_per_trx":
        return "Estimasi penghematan biaya parkir customer setiap 1x nota transaksi belanja di Oriental";
      case "saving_kurir_per_trx":
        return "Estimasi penghematan biaya kurir / pengantaran setiap 1x nota transaksi belanja di Oriental";
      default:
        return "";
    }
  };

  const renderRuleItem = (r: Rule) => (
    <div
      key={r.kunci}
      className="flex items-center justify-between gap-4 p-3.5 bg-slate-50 rounded-lg border border-slate-200"
    >
      <div className="flex-1">
        <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
          {getLabel(r.kunci)}
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">{getDesc(r.kunci) || r.keterangan || r.kunci}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2.5 py-1">
          <span className="text-xs text-slate-500 font-medium">Rp</span>
          <input
            type="number"
            value={values[r.kunci] ?? r.nilai}
            onChange={(e) => setValues({ ...values, [r.kunci]: Number(e.target.value) })}
            className="w-28 text-sm font-mono font-bold text-slate-900 focus:outline-none"
          />
        </div>

        <button
          onClick={() => handleSave(r.kunci)}
          disabled={savingKey === r.kunci || values[r.kunci] === r.nilai}
          className="btn btn-primary btn-sm flex items-center gap-1 disabled:opacity-50"
        >
          <Save size={13} /> {savingKey === r.kunci ? "Menyimpan..." : "Simpan"}
        </button>
      </div>
    </div>
  );

  const salesKeys = ["rate_retail", "rate_ukm", "rate_grosir", "nilai_kupon"];
  const wasteKeys = ["harga_uco_per_kg", "rate_waste_poin"];
  const savingKeys = ["saving_parkir_per_trx", "saving_kurir_per_trx"];

  return (
    <div className="fade-in max-w-4xl p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Settings className="text-slate-800" size={24} /> Pengaturan Sistem
          </h1>
          <p className="page-subtitle">Konfigurasi rate poin belanja, pembelian limbah (waste), penghematan customer, dan integritas database</p>
        </div>
        <button onClick={loadSettings} className="btn btn-outline btn-sm" disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {msg && (
        <div className={`alert alert-${msg.type} mb-6`}>
          {msg.type === "success" ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Rules Config Card: Sales */}
      <div className="card p-6 mb-6">
        <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
          <Shield size={18} className="text-amber-600" /> Aturan Konversi Poin &amp; Kupon Belanja POS
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Rate konversi perolehan Poin dan Kupon undian fisik dari transaksi penjualan faktur POS.
        </p>

        {loading ? (
          <div className="py-8 text-center"><div className="spinner mx-auto" /></div>
        ) : (
          <div className="space-y-3">
            {rules.filter((r) => salesKeys.includes(r.kunci)).map(renderRuleItem)}
          </div>
        )}
      </div>

      {/* Rules Config Card: Waste Purchasing */}
      <div className="card p-6 mb-6">
        <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
          <RefreshCw size={18} className="text-emerald-600" /> Aturan Pembelian Limbah (Waste Purchasing — UCO)
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Harga acuan per kilogram dan rate perolehan poin atas pembelian minyak jelantah dari outlet member.
        </p>

        {loading ? (
          <div className="py-8 text-center"><div className="spinner mx-auto" /></div>
        ) : (
          <div className="space-y-3">
            {rules.filter((r) => wasteKeys.includes(r.kunci)).map(renderRuleItem)}
          </div>
        )}
      </div>

      {/* Rules Config Card: Customer Savings */}
      <div className="card p-6 mb-6">
        <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
          <CheckCircle size={18} className="text-blue-600" /> Parameter Nilai Penghematan Customer (E-Statement)
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Standar perhitungan estimasi penghematan biaya parkir dan kurir yang dicantumkan pada Lembar Statement Customer.
        </p>

        {loading ? (
          <div className="py-8 text-center"><div className="spinner mx-auto" /></div>
        ) : (
          <div className="space-y-3">
            {rules.filter((r) => savingKeys.includes(r.kunci)).map(renderRuleItem)}
          </div>
        )}
      </div>

      {/* System & Database Info */}
      <div className="card p-6 mb-6">
        <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
          <Database size={18} className="text-blue-600" /> Database &amp; Audit Status
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Status penyimpanan data lokal SQLite dan riwayat audit operasional.
        </p>

        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <span className="text-slate-500 block">Lokasi File Database:</span>
            <span className="font-mono font-bold text-slate-800 break-all">{stats?.dbPath || "data/oriental_crm.db"}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <span className="text-slate-500 block">Total Import Batch:</span>
            <span className="text-base font-bold text-slate-900">{stats?.batchCount || 0} Kali Import</span>
          </div>
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <span className="text-slate-500 block">Total Catatan Audit Log:</span>
            <span className="text-base font-bold text-slate-900">{stats?.auditCount || 0} Catatan</span>
          </div>
        </div>

        {/* One-Click Backup Download */}
        <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span>Pencadangan Data Seketika (One-Click Backup)</span>
              <span className="badge badge-success text-[10px] py-0 px-1.5">Aman &amp; Konsisten</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Unduh salinan snapshot utuh database SQLite (.db) berisi seluruh akun One Identity, kupon, dan transaksi.
            </p>
          </div>
          <a
            href="/api/maintenance/backup"
            download
            className="btn btn-outline btn-sm flex items-center justify-center gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50 shrink-0 font-medium"
          >
            <Download size={14} /> Unduh Database (.db)
          </a>
        </div>
      </div>

      {/* Keamanan & Password Approval Owner Universal */}
      <div className="card p-6">
        <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
          <Shield size={18} className="text-amber-600" /> Keamanan &amp; Password Approval Owner Universal
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Password ini digunakan untuk menyetujui tindakan kritis seperti <strong>Merge Akun</strong>, perubahan rate khusus, atau hapus data permanen.
        </p>

        <PasswordChangeCard />
      </div>
    </div>
  );
}

function PasswordChangeCard() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setStatus({ type: "error", text: "Konfirmasi password baru tidak cocok" });
      return;
    }
    if (newPw.length < 4) {
      setStatus({ type: "error", text: "Password baru minimal 4 karakter" });
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      const json = await res.json();
      if (res.ok) {
        setStatus({ type: "success", text: "Password Owner berhasil diperbarui!" });
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      } else {
        setStatus({ type: "error", text: json.error || "Gagal mengubah password" });
      }
    } catch {
      setStatus({ type: "error", text: "Gagal menghubungi server" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleChangePassword} className="max-w-md bg-slate-50 p-4 rounded-lg border border-slate-200">
      {status && (
        <div className={`alert alert-${status.type} mb-4 text-xs py-2`}>
          {status.text}
        </div>
      )}
      <div className="space-y-3 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Password Saat Ini</label>
          <input
            type="password"
            className="input w-full"
            placeholder="Default awal: oriental2026"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Password Baru</label>
          <input
            type="password"
            className="input w-full"
            placeholder="Minimal 4 karakter"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Konfirmasi Password Baru</label>
          <input
            type="password"
            className="input w-full"
            placeholder="Ulangi password baru"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary btn-sm flex items-center gap-1.5 mt-2">
          <Save size={13} /> {loading ? "Menyimpan..." : "Perbarui Password Owner"}
        </button>
      </div>
    </form>
  );
}

