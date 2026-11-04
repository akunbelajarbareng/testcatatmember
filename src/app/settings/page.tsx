"use client";
import React, { useEffect, useState } from "react";
import { Settings, Save, CheckCircle, AlertTriangle, Database, Shield, RefreshCw, Download, Clock, HardDrive, FolderCheck, ArrowDownToLine } from "lucide-react";

interface Rule {
  id: number;
  kunci: string;
  nilai: number;
  keterangan: string;
  updated_at: string;
}

interface BackupItem {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  location: 'project' | 'system';
  path: string;
}

export default function SettingsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [stats, setStats] = useState<{
    auditCount: number;
    batchCount: number;
    dbPath: string;
    latestBackup?: BackupItem | null;
    totalBackups?: number;
  } | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Inactivity audit state
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPreview, setAuditPreview] = useState<{ activeOutletsCount: number; dormantCount: number; cutoffDate: string } | null>(null);
  const [auditResultMsg, setAuditResultMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const json = await res.json();
      if (res.ok) {
        setRules(json.rules || []);
        setStats(json.stats || null);
        setBackups(json.backups || []);
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

  const handleManualLocalBackup = async () => {
    setBackupLoading(true);
    setBackupMsg(null);
    try {
      const res = await fetch("/api/maintenance/backup", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setBackupMsg({
          type: "success",
          text: `Berhasil mencadangkan ke folder lokal! File: ${json.result?.filename} (${json.result?.savedLocations?.length || 2} direktori tersimpan).`,
        });
        await loadSettings();
      } else {
        setBackupMsg({ type: "error", text: json.error || "Gagal mencadangkan database." });
      }
    } catch {
      setBackupMsg({ type: "error", text: "Terjadi kesalahan jaringan saat mencadangkan database." });
    } finally {
      setBackupLoading(false);
    }
  };

  const loadAuditPreview = async () => {
    try {
      const res = await fetch("/api/maintenance/audit-inactivity");
      if (res.ok) {
        const json = await res.json();
        setAuditPreview({
          activeOutletsCount: json.activeOutletsCount,
          dormantCount: json.dormantCount,
          cutoffDate: json.cutoffDate,
        });
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadSettings();
    loadAuditPreview();
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
        if (key === "periode_tidak_aktif_bulan") {
          loadAuditPreview();
        }
      } else {
        setMsg({ type: "error", text: json.error || "Gagal memperbarui konfigurasi" });
      }
    } catch {
      setMsg({ type: "error", text: "Gagal menyimpan konfigurasi" });
    } finally {
      setSavingKey(null);
    }
  };

  const handleExecuteAudit = async () => {
    const months = values["periode_tidak_aktif_bulan"] || 3;
    const confirm = window.confirm(
      `Jalankan audit inaktivitas sekarang?\n\nSeluruh outlet dan akun utama yang tidak memiliki transaksi baru selama >= ${months} bulan akan ditandai nonaktif secara otomatis.`
    );
    if (!confirm) return;

    setAuditLoading(true);
    setAuditResultMsg(null);
    try {
      const res = await fetch("/api/maintenance/audit-inactivity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (res.ok) {
        setAuditResultMsg({
          type: "success",
          text: json.message || "Audit inaktivitas selesai dijalankan.",
        });
        loadAuditPreview();
        loadSettings();
      } else {
        setAuditResultMsg({
          type: "error",
          text: json.error || "Gagal menjalankan audit inaktivitas",
        });
      }
    } catch {
      setAuditResultMsg({
        type: "error",
        text: "Terjadi kesalahan saat menghubungi server",
      });
    } finally {
      setAuditLoading(false);
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
      case "periode_tidak_aktif_bulan":
        return "Batas Inaktivitas Otomatis Akun/Outlet (Bulan)";
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
      case "periode_tidak_aktif_bulan":
        return "Batas durasi (dalam bulan) tanpa adanya transaksi baru sebelum outlet & akun utama ditandai nonaktif otomatis";
      default:
        return "";
    }
  };

  const renderRuleItem = (r: Rule) => {
    const isMonthRule = r.kunci === "periode_tidak_aktif_bulan";
    return (
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
            {!isMonthRule && <span className="text-xs text-slate-500 font-medium">Rp</span>}
            <input
              type="number"
              min={isMonthRule ? 1 : undefined}
              step={isMonthRule ? 1 : undefined}
              value={values[r.kunci] ?? r.nilai}
              onChange={(e) => setValues({ ...values, [r.kunci]: Number(e.target.value) })}
              className={`${isMonthRule ? "w-16 text-right" : "w-28"} text-sm font-mono font-bold text-slate-900 focus:outline-none`}
            />
            {isMonthRule && <span className="text-xs text-slate-500 font-medium">Bulan</span>}
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
  };

  const salesKeys = ["rate_retail", "rate_ukm", "rate_grosir", "nilai_kupon"];
  const wasteKeys = ["harga_uco_per_kg", "rate_waste_poin"];
  const savingKeys = ["saving_parkir_per_trx", "saving_kurir_per_trx"];
  const inactivityKeys = ["periode_tidak_aktif_bulan"];

  return (
    <div className="fade-in max-w-4xl p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Settings className="text-slate-800" size={24} /> Pengaturan Sistem
          </h1>
          <p className="page-subtitle">Konfigurasi rate poin belanja, pembelian limbah (waste), penghematan customer, dan integritas database</p>
        </div>
        <button onClick={() => { loadSettings(); loadAuditPreview(); }} className="btn btn-outline btn-sm" disabled={loading}>
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

      {/* Rules Config Card: Inactivity & Account Automation */}
      <div className="card p-6 mb-6">
        <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
          <Clock size={18} className="text-rose-600" /> Aturan Inaktivitas &amp; Deaktivasi Otomatis (Akun Vakum)
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Tentukan batas waktu tanpa transaksi baru sebelum lini bisnis dan akun customer ditandai nonaktif secara otomatis oleh sistem.
        </p>

        {loading ? (
          <div className="py-8 text-center"><div className="spinner mx-auto" /></div>
        ) : (
          <div className="space-y-4">
            {rules.filter((r) => inactivityKeys.includes(r.kunci)).map(renderRuleItem)}

            {/* Audit Execution Box */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 mt-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span>Audit Status Inaktivitas Seketika</span>
                    {auditPreview && (
                      <span className="badge badge-warning text-[10px] py-0 px-1.5 font-mono">
                        {auditPreview.dormantCount} dari {auditPreview.activeOutletsCount} outlet vakum (&lt; {auditPreview.cutoffDate})
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Sistem akan memindai seluruh outlet aktif. Jika tanggal transaksi belanja/waste terakhir melampaui batas bulan di atas, status outlet &amp; akun utama akan dinonaktifkan otomatis.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleExecuteAudit}
                  disabled={auditLoading}
                  className="btn btn-outline btn-sm text-rose-700 border-rose-300 hover:bg-rose-50 flex items-center justify-center gap-1.5 shrink-0 font-medium disabled:opacity-50"
                >
                  <RefreshCw size={13} className={auditLoading ? "animate-spin" : ""} />
                  {auditLoading ? "Memproses Audit..." : "Audit & Nonaktifkan Akun Vakum Sekarang"}
                </button>
              </div>

              {auditResultMsg && (
                <div className={`alert alert-${auditResultMsg.type} mt-3 text-xs py-2`}>
                  {auditResultMsg.type === "success" ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
                  <span>{auditResultMsg.text}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* System & Database Info & Auto-Backup */}
      <div className="card p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database size={18} className="text-blue-600" /> Database &amp; Auto-Backup Lokal
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Status penyimpanan SQLite, penjadwalan pencadangan otomatis harian, dan riwayat arsip lokal.
            </p>
          </div>
          <span className="badge badge-success text-xs py-1 px-2.5 flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Auto-Backup Aktif (23:00 WIB)
          </span>
        </div>

        {/* Status Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Database Aktif:</span>
            <span className="font-mono font-bold text-slate-800 text-xs break-all">{stats?.dbPath || "data/oriental_crm.db"}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Pencadangan Terakhir:</span>
            <span className="font-medium text-slate-900 text-xs block">
              {stats?.latestBackup?.createdAt
                ? new Date(stats.latestBackup.createdAt).toLocaleString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Belum ada"}
            </span>
            {stats?.latestBackup?.sizeFormatted && (
              <span className="text-[10px] text-slate-500">Ukuran: {stats.latestBackup.sizeFormatted}</span>
            )}
          </div>
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Total Arsip Cadangan:</span>
            <span className="text-base font-bold text-slate-900">{stats?.totalBackups ?? backups.length} File</span>
            <span className="text-[10px] text-slate-500 block">Retensi otomatis 30 hari</span>
          </div>
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Total Audit Log:</span>
            <span className="text-base font-bold text-slate-900">{stats?.auditCount || 0} Catatan</span>
            <span className="text-[10px] text-slate-500 block">{stats?.batchCount || 0} kali import POS</span>
          </div>
        </div>

        {/* Folder Lokasi Auto-Backup */}
        <div className="p-3.5 bg-blue-50/70 rounded-lg border border-blue-200/80 mb-4 text-xs">
          <div className="font-semibold text-blue-950 flex items-center gap-1.5 mb-1.5">
            <FolderCheck size={15} className="text-blue-600" />
            <span>Direktori Penyimpanan Otomatis (Multi-Lokasi Lokal):</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
            <div className="bg-white p-2.5 rounded border border-blue-200">
              <span className="font-bold text-slate-700 block">1. Folder Sistem Windows (Anti-Terhapus):</span>
              <code className="text-blue-700 font-mono break-all">C:\Oriental_CRM_Backups\</code>
              <p className="text-[10px] text-slate-500 mt-1">Disinkronkan dengan Windows Task Scheduler setiap malam.</p>
            </div>
            <div className="bg-white p-2.5 rounded border border-blue-200">
              <span className="font-bold text-slate-700 block">2. Folder Proyek Internal:</span>
              <code className="text-blue-700 font-mono break-all">&lt;proyek&gt;\data\backups\</code>
              <p className="text-[10px] text-slate-500 mt-1">Arsip lokal yang mudah diakses langsung dari folder aplikasi.</p>
            </div>
          </div>
        </div>

        {/* Feedback Pesan Backup */}
        {backupMsg && (
          <div className={`alert alert-${backupMsg.type} mb-4 text-xs py-2.5`}>
            {backupMsg.type === "success" ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
            <span>{backupMsg.text}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200">
          <div>
            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span>Operasi Cadangan Manual &amp; Unduh</span>
              <span className="badge badge-neutral text-[10px] py-0 px-1.5">Non-Blocking WAL</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Cadangkan seketika ke kedua folder lokal atau unduh file snapshot utuh ke komputer.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleManualLocalBackup}
              disabled={backupLoading}
              className="btn btn-primary btn-sm flex items-center justify-center gap-1.5 font-medium disabled:opacity-60"
            >
              <RefreshCw size={13} className={backupLoading ? "animate-spin" : ""} />
              {backupLoading ? "Mencadangkan..." : "Cadangkan ke Folder Lokal Sekarang"}
            </button>
            <a
              href="/api/maintenance/backup"
              download
              className="btn btn-outline btn-sm flex items-center justify-center gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50 font-medium"
            >
              <Download size={13} /> Unduh (.db)
            </a>
          </div>
        </div>

        {/* Riwayat 5 Cadangan Lokal Terakhir */}
        {backups.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-700 block mb-2">
              Daftar 5 Arsip Cadangan Lokal Terbaru:
            </span>
            <div className="overflow-x-auto border border-slate-200 rounded">
              <table className="w-full text-left text-[11px] divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2 px-3">Nama File Cadangan</th>
                    <th className="py-2 px-3">Waktu Dibuat</th>
                    <th className="py-2 px-3">Ukuran</th>
                    <th className="py-2 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {backups.slice(0, 5).map((b, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-medium text-slate-800">
                        {b.filename}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {new Date(b.createdAt).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        <span className="badge badge-neutral text-[10px]">{b.sizeFormatted}</span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <a
                          href={`/api/maintenance/backup?filename=${encodeURIComponent(b.filename)}`}
                          download={b.filename}
                          className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 text-[11px]"
                        >
                          <ArrowDownToLine size={12} /> Unduh
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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

