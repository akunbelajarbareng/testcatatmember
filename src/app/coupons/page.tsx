"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  Ticket,
  Search,
  Trophy,
  History,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  User,
  Store,
  Phone,
  Calendar,
  Layers,
  FileCheck,
  XCircle,
  Lock,
  ArrowRight,
  ExternalLink,
  Info,
} from "lucide-react";

interface MemberQuota {
  identity_id: string;
  nama_pemilik: string;
  alamat: string;
  kota?: string;
  kecamatan?: string;
  whatsapp?: string;
  hak_kupon: number;
  sudah_diambil: number;
  sisa_kuota: number;
  is_suspended?: boolean;
  suspend_reason?: string | null;
  outlets: Array<{
    id: string;
    nama_outlet: string;
    tipe: string;
  }>;
}

interface BundleInfo {
  bundle_no: number;
  start_seq: number;
  end_seq: number;
  start_number: string;
  end_number: string;
  total: number;
  issued: number;
  available: number;
  status: "available" | "partial" | "taken";
}

interface StockInfo {
  periode: string;
  prefix: string;
  capacity: number;
  issued_count: number;
  available_count: number;
  bundles: BundleInfo[];
}

interface CouponRow {
  id: number;
  nomor_kupon: string;
  periode_kupon: string;
  nomor_urut: number;
  status: "aktif" | "void";
  tanggal_serah: string;
  petugas: string;
  kupon_whatsapp?: string;
  created_at: string;
  batch_id?: number;
  identity_id: string;
  nama_pemilik: string;
  kota?: string;
  member_whatsapp?: string;
  outlet_id: string;
  nama_outlet: string;
  outlet_tipe: string;
  batch_keterangan?: string;
}

interface LookupResult {
  found: boolean;
  message?: string;
  coupon?: {
    id: number;
    nomor_kupon: string;
    periode_kupon: string;
    nomor_urut: number;
    status: "aktif" | "void";
    void_reason?: string | null;
    tanggal_serah: string;
    petugas: string;
    whatsapp: string;
    member: {
      id: string;
      nama_pemilik: string;
      alamat: string;
      kota?: string;
      kecamatan?: string;
      provinsi?: string;
    };
    outlet_asal: {
      id: string;
      nama_outlet: string;
      tipe: string;
    };
    batch?: {
      id?: number;
      keterangan?: string;
    };
  };
}

const PROGRAM_PERIODS = [
  { value: "2026-09", label: "September 2026 (ORT-KUP2609-XXXX)" },
  { value: "2026-10", label: "Oktober 2026 (ORT-KUP2610-XXXX)" },
  { value: "2026-11", label: "November 2026 (ORT-KUP2611-XXXX)" },
  { value: "2026-12", label: "Desember 2026 (ORT-KUP2612-XXXX)" },
  { value: "2027-01", label: "Januari 2027 (ORT-KUP2701-XXXX)" },
  { value: "2027-02", label: "Februari 2027 (ORT-KUP2702-XXXX)" },
  { value: "2027-03", label: "Maret 2027 (ORT-KUP2703-XXXX)" },
  { value: "2027-04", label: "April 2027 (ORT-KUP2704-XXXX)" },
  { value: "2027-05", label: "Mei 2027 (ORT-KUP2705-XXXX)" },
  { value: "2027-06", label: "Juni 2027 (ORT-KUP2706-XXXX)" },
  { value: "2027-07", label: "Juli 2027 (ORT-KUP2707-XXXX)" },
  { value: "2027-08", label: "Agustus 2027 (ORT-KUP2708-XXXX)" },
  { value: "2027-09", label: "September 2027 (ORT-KUP2709-XXXX)" },
];

function CouponsContent() {
  const searchParams = useSearchParams();
  const initialMemberId = searchParams.get("memberId") || "";
  const initialPeriode = searchParams.get("periode") || "2026-09";

  const [activeTab, setActiveTab] = useState<"handover" | "lookup" | "history">("handover");

  // -------------------------------------------------------------------------
  // TAB 1: HANDOVER STATE
  // -------------------------------------------------------------------------
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<Array<{ id: string; nama_pemilik: string; kota: string }>>([]);
  const [isSearchingMember, setIsSearchingMember] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberQuota | null>(null);
  const [loadingQuota, setLoadingQuota] = useState(false);

  // Form Fields
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [memberWhatsapp, setMemberWhatsapp] = useState("");
  const [handoverPeriode, setHandoverPeriode] = useState(initialPeriode);
  const [petugasName, setPetugasName] = useState("");
  const [keterangan, setKeterangan] = useState("");

  // Mode Selection
  const [inputMode, setInputMode] = useState<"bundle" | "range" | "custom">("bundle");
  const [selectedBundles, setSelectedBundles] = useState<number[]>([]);
  const [rangeStart, setRangeStart] = useState<number | "">("");
  const [rangeEnd, setRangeEnd] = useState<number | "">("");
  const [customNumbersInput, setCustomNumbersInput] = useState("");

  // Stock State
  const [stock, setStock] = useState<StockInfo | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [handoverMsg, setHandoverMsg] = useState<{ type: "success" | "error"; text: string; details?: any } | null>(null);

  // -------------------------------------------------------------------------
  // TAB 2: LOOKUP STATE
  // -------------------------------------------------------------------------
  const [lookupQuery, setLookupQuery] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);

  // -------------------------------------------------------------------------
  // TAB 3: HISTORY STATE
  // -------------------------------------------------------------------------
  const [historyCoupons, setHistoryCoupons] = useState<CouponRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyPeriode, setHistoryPeriode] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [historyStats, setHistoryStats] = useState({ total_aktif: 0, total_void: 0, total_member: 0, total_batches: 0 });

  // -------------------------------------------------------------------------
  // VOID MODAL STATE
  // -------------------------------------------------------------------------
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidTarget, setVoidTarget] = useState<{ couponId?: number; nomorKupon?: string; batchId?: number } | null>(null);
  const [voidPassword, setVoidPassword] = useState("");
  const [voidAlasan, setVoidAlasan] = useState("");
  const [voidPetugas, setVoidPetugas] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState("");

  // -------------------------------------------------------------------------
  // FETCH MEMBER QUOTA
  // -------------------------------------------------------------------------
  const loadMemberQuota = useCallback(async (identityId: string) => {
    setLoadingQuota(true);
    setHandoverMsg(null);
    try {
      const res = await fetch(`/api/coupons/quota/${encodeURIComponent(identityId)}`);
      const data = await res.json();
      if (res.ok && data.quota) {
        setSelectedMember(data.quota);
        setMemberWhatsapp(data.quota.whatsapp || "");
        if (data.quota.outlets.length > 0) {
          setSelectedOutletId(data.quota.outlets[0].id);
        }
      } else {
        setHandoverMsg({ type: "error", text: data.error || "Member tidak ditemukan" });
      }
    } catch {
      setHandoverMsg({ type: "error", text: "Gagal memuat data kuota member" });
    } finally {
      setLoadingQuota(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // FETCH STOCK
  // -------------------------------------------------------------------------
  const loadStock = useCallback(async (periode: string) => {
    setLoadingStock(true);
    try {
      const res = await fetch(`/api/coupons/stock?periode=${periode}`);
      const data = await res.json();
      if (res.ok && data.stock) {
        setStock(data.stock);
      }
    } catch {
      // ignore
    } finally {
      setLoadingStock(false);
    }
  }, []);

  useEffect(() => {
    loadStock(handoverPeriode);
  }, [handoverPeriode, loadStock]);

  useEffect(() => {
    if (initialMemberId) {
      loadMemberQuota(initialMemberId);
    }
  }, [initialMemberId, loadMemberQuota]);

  // Member search debounced
  useEffect(() => {
    if (!memberQuery.trim()) {
      setMemberResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingMember(true);
      try {
        const res = await fetch(`/api/identities?q=${encodeURIComponent(memberQuery)}&limit=6`);
        const data = await res.json();
        setMemberResults(data.identities || []);
      } catch {
        setMemberResults([]);
      } finally {
        setIsSearchingMember(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [memberQuery]);

  // -------------------------------------------------------------------------
  // FETCH HISTORY
  // -------------------------------------------------------------------------
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: "25",
        q: historySearch,
        periode: historyPeriode,
        status: historyStatus,
      });
      const res = await fetch(`/api/coupons?${q.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setHistoryCoupons(data.coupons || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
        if (data.stats) setHistoryStats(data.stats);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, [page, historySearch, historyPeriode, historyStatus]);

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  // -------------------------------------------------------------------------
  // CALCULATION OF REQUESTED COUPONS
  // -------------------------------------------------------------------------
  const getRequestedCouponCount = () => {
    if (inputMode === "bundle") {
      return selectedBundles.length * 50;
    }
    if (inputMode === "range") {
      const s = Number(rangeStart);
      const e = Number(rangeEnd);
      if (s > 0 && e >= s) return e - s + 1;
      return 0;
    }
    if (inputMode === "custom") {
      const parts = customNumbersInput
        .split(/[\s,]+/)
        .map((p) => parseInt(p.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
      return new Set(parts).size;
    }
    return 0;
  };

  const requestedCount = getRequestedCouponCount();

  // Toggle bundle selection with strict quota limit
  const toggleBundle = (bundleNo: number) => {
    setSelectedBundles((prev) => {
      if (prev.includes(bundleNo)) {
        return prev.filter((b) => b !== bundleNo);
      }
      const newCount = (prev.length + 1) * 50;
      if (selectedMember && newCount > selectedMember.sisa_kuota) {
        alert(
          `Tidak dapat memilih bundel ini. Total kupon (${newCount} lembar) akan melebihi sisa hak kuota member (${selectedMember.sisa_kuota} lembar).`
        );
        return prev;
      }
      return [...prev, bundleNo].sort((a, b) => a - b);
    });
  };

  // -------------------------------------------------------------------------
  // HANDLE SUBMIT HANDOVER
  // -------------------------------------------------------------------------
  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) {
      setHandoverMsg({ type: "error", text: "Silakan pilih member terlebih dahulu" });
      return;
    }
    if (selectedMember.sisa_kuota <= 0) {
      setHandoverMsg({
        type: "error",
        text: `Member tidak memiliki sisa hak kuota kupon (sisa kuota: 0 lembar). Penyerahan kupon ditolak.`,
      });
      return;
    }
    if (!selectedOutletId) {
      setHandoverMsg({ type: "error", text: "Silakan pilih outlet asal" });
      return;
    }
    if (!petugasName.trim()) {
      setHandoverMsg({ type: "error", text: "Nama petugas wajib diisi" });
      return;
    }
    if (requestedCount === 0) {
      setHandoverMsg({ type: "error", text: "Belum ada nomor kupon yang dipilih" });
      return;
    }
    if (requestedCount > selectedMember.sisa_kuota) {
      setHandoverMsg({
        type: "error",
        text: `Jumlah kupon (${requestedCount} lembar) melebihi sisa hak kuota member (${selectedMember.sisa_kuota} lembar). Batas maksimal adalah ${selectedMember.sisa_kuota} lembar.`,
      });
      return;
    }

    setSubmitting(true);
    setHandoverMsg(null);

    const payload: any = {
      identity_id: selectedMember.identity_id,
      outlet_asal_id: selectedOutletId,
      periode_kupon: handoverPeriode,
      petugas: petugasName.trim(),
      whatsapp: memberWhatsapp.trim(),
      keterangan: keterangan.trim() || undefined,
      mode: inputMode,
    };

    if (inputMode === "bundle") {
      payload.bundle_numbers = selectedBundles;
    } else if (inputMode === "range") {
      payload.range = { start: Number(rangeStart), end: Number(rangeEnd) };
    } else if (inputMode === "custom") {
      const parts = customNumbersInput
        .split(/[\s,]+/)
        .map((p) => parseInt(p.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
      payload.custom_numbers = Array.from(new Set(parts));
    }

    try {
      const res = await fetch("/api/coupons/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) {
        setHandoverMsg({ type: "error", text: json.error || "Gagal memproses penyerahan kupon" });
      } else {
        setHandoverMsg({
          type: "success",
          text: `Berhasil menyerahkan ${json.data.total_issued} lembar kupon! (${json.data.nomor_awal} s.d. ${json.data.nomor_akhir})`,
          details: json.data,
        });

        // Reset inputs
        setSelectedBundles([]);
        setRangeStart("");
        setRangeEnd("");
        setCustomNumbersInput("");
        setKeterangan("");

        // Refresh quota and stock
        loadMemberQuota(selectedMember.identity_id);
        loadStock(handoverPeriode);
      }
    } catch {
      setHandoverMsg({ type: "error", text: "Terjadi gangguan jaringan saat memproses kupon" });
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // HANDLE LOOKUP
  // -------------------------------------------------------------------------
  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!lookupQuery.trim()) return;

    setIsLookingUp(true);
    setLookupResult(null);

    try {
      const res = await fetch(`/api/coupons/lookup?q=${encodeURIComponent(lookupQuery.trim())}`);
      const json = await res.json();
      setLookupResult(json);
    } catch {
      setLookupResult({ found: false, message: "Terjadi kesalahan koneksi saat mencari kupon." });
    } finally {
      setIsLookingUp(false);
    }
  };

  // -------------------------------------------------------------------------
  // HANDLE VOID SUBMIT
  // -------------------------------------------------------------------------
  const handleVoidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidPassword.trim()) {
      setVoidError("Password persetujuan Owner wajib diisi");
      return;
    }
    if (!voidAlasan.trim()) {
      setVoidError("Alasan pembatalan wajib diisi");
      return;
    }

    setVoiding(true);
    setVoidError("");

    try {
      const res = await fetch("/api/coupons/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coupon_ids: voidTarget?.couponId ? [voidTarget.couponId] : undefined,
          nomor_kupons: voidTarget?.nomorKupon ? [voidTarget.nomorKupon] : undefined,
          batch_id: voidTarget?.batchId,
          password: voidPassword.trim(),
          alasan: voidAlasan.trim(),
          petugas: voidPetugas.trim() || "Admin",
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setVoidError(json.error || "Gagal membatalkan kupon");
      } else {
        setShowVoidModal(false);
        setVoidTarget(null);
        setVoidPassword("");
        setVoidAlasan("");
        setVoidPetugas("");

        // Refresh wherever needed
        if (selectedMember) loadMemberQuota(selectedMember.identity_id);
        loadStock(handoverPeriode);
        if (activeTab === "history") loadHistory();
        if (activeTab === "lookup" && lookupQuery) handleLookup();
      }
    } catch {
      setVoidError("Terjadi gangguan koneksi saat memproses pembatalan kupon");
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className="fade-in" style={{ padding: "28px 36px", maxWidth: 1280, margin: "0 auto" }}>
      {/* ========================================================
          PAGE HEADER
          ======================================================== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "linear-gradient(135deg, var(--gold-600), var(--gold-700))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(184, 134, 11, 0.25)",
              }}
            >
              <Ticket size={22} />
            </div>
            <div>
              <h1 className="page-title" style={{ fontSize: 22, fontWeight: 800 }}>
                Kupon Undian Oriental
              </h1>
              <p className="page-subtitle" style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Pencatatan nomor kupon fisik berformat <code style={{ fontWeight: 700, color: "var(--navy-800)" }}>ORT-KUPYYMM-NNNN</code>, doorprize finder, &amp; rekapitulasi
              </p>
            </div>
          </div>
        </div>

        {/* Global Export Button */}
        <a
          href="/api/coupons/export"
          className="btn btn-outline btn-sm"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Download size={14} /> Export Rekap Excel (.xlsx)
        </a>
      </div>

      {/* ========================================================
          NAVIGATION TABS
          ======================================================== */}
      <div
        style={{
          display: "flex",
          gap: 8,
          borderBottom: "2px solid var(--border)",
          marginBottom: 24,
        }}
      >
        <button
          onClick={() => setActiveTab("handover")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            background: "none",
            border: "none",
            borderBottom: activeTab === "handover" ? "3px solid var(--gold-600)" : "3px solid transparent",
            color: activeTab === "handover" ? "var(--gold-700)" : "var(--text-muted)",
            transition: "all 0.15s ease",
            marginBottom: -2,
          }}
        >
          <Ticket size={16} /> Penyerahan Kupon
        </button>

        <button
          onClick={() => setActiveTab("lookup")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            background: "none",
            border: "none",
            borderBottom: activeTab === "lookup" ? "3px solid var(--gold-600)" : "3px solid transparent",
            color: activeTab === "lookup" ? "var(--gold-700)" : "var(--text-muted)",
            transition: "all 0.15s ease",
            marginBottom: -2,
          }}
        >
          <Trophy size={16} /> Cek Pemenang Undian
        </button>

        <button
          onClick={() => setActiveTab("history")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            background: "none",
            border: "none",
            borderBottom: activeTab === "history" ? "3px solid var(--gold-600)" : "3px solid transparent",
            color: activeTab === "history" ? "var(--gold-700)" : "var(--text-muted)",
            transition: "all 0.15s ease",
            marginBottom: -2,
          }}
        >
          <History size={16} /> Riwayat &amp; Rekapitulasi
        </button>
      </div>

      {/* ========================================================
          TAB 1: PENYERAHAN KUPON (HANDOVER FORM)
          ======================================================== */}
      {activeTab === "handover" && (
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 24, alignItems: "start" }}>
          {/* LEFT COLUMN: MEMBER SELECTION & PROFILE */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Search Member Card */}
            <div className="card" style={{ padding: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 8 }}>
                1. Cari &amp; Pilih Member
              </label>

              <div style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input
                  type="text"
                  className="input"
                  style={{ paddingLeft: 36 }}
                  placeholder="Ketik nama member / ID..."
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                />
                {isSearchingMember && (
                  <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                  </div>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {memberResults.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    background: "#fff",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  {memberResults.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => {
                        loadMemberQuota(m.id);
                        setMemberResults([]);
                        setMemberQuery(m.nama_pemilik);
                      }}
                      style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--border-light)",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      className="hover:bg-slate-50"
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy-900)" }}>{m.nama_pemilik}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{m.id}</div>
                      </div>
                      <span className="badge badge-draft" style={{ fontSize: 10 }}>{m.kota || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Member Profile & Quota Card */}
            {loadingQuota ? (
              <div className="card" style={{ padding: 32, textAlign: "center" }}>
                <div className="spinner mx-auto mb-2" />
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Memuat kuota member...</p>
              </div>
            ) : selectedMember ? (
              <div className="card" style={{ padding: 20, border: selectedMember.is_suspended ? "2px solid #EF4444" : "1px solid var(--gold-400)", background: selectedMember.is_suspended ? "#FEF2F2" : "#fffdf9" }}>
                {selectedMember.is_suspended && (
                  <div
                    style={{
                      background: "#FEE2E2",
                      border: "1px solid #FCA5A5",
                      borderRadius: 8,
                      padding: "10px 14px",
                      marginBottom: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: "#991B1B",
                      fontSize: 12,
                    }}
                  >
                    <AlertTriangle size={18} className="shrink-0 text-red-600" />
                    <div>
                      <div style={{ fontWeight: 800 }}>MEMBER DALAM STATUS SANKSI PENANGGUHAN</div>
                      <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 2 }}>
                        Alasan: <strong>{selectedMember.suspend_reason || "Status Evaluasi Khusus"}</strong>. Penyerahan kupon fisik diblokir oleh sistem.
                      </div>
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <span className={`badge ${selectedMember.is_suspended ? "badge-ditolak" : "badge-aktif"}`} style={{ fontSize: 10, textTransform: "uppercase", marginBottom: 4 }}>
                      {selectedMember.is_suspended ? "Member Disanksi" : "One Identity Member"}
                    </span>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--navy-950)", textTransform: "uppercase", margin: "4px 0" }}>
                      {selectedMember.nama_pemilik}
                    </h3>
                    <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "var(--slate-600)" }}>
                      {selectedMember.identity_id}
                    </div>
                  </div>
                </div>

                {/* Quota Highlights Box */}
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "12px 14px",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 8,
                    textAlign: "center",
                    margin: "12px 0 16px",
                  }}
                >
                  <div style={{ borderRight: "1px solid var(--border-light)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                      Hak Kupon
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--navy-900)", marginTop: 2 }}>
                      {selectedMember.hak_kupon.toLocaleString("id-ID")}
                    </div>
                  </div>

                  <div style={{ borderRight: "1px solid var(--border-light)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                      Sudah Diambil
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--slate-600)", marginTop: 2 }}>
                      {selectedMember.sudah_diambil.toLocaleString("id-ID")}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--gold-700)" }}>
                      Sisa Kuota
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "var(--gold-600)", marginTop: 2 }}>
                      {selectedMember.sisa_kuota.toLocaleString("id-ID")}
                    </div>
                  </div>
                </div>

                {/* WhatsApp & Outlet Input */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--navy-900)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                      <Phone size={13} style={{ color: "var(--emerald-600)" }} /> No. WhatsApp Aktif Member
                    </label>
                    <input
                      type="text"
                      className="input"
                      style={{ fontSize: 12, padding: "8px 10px" }}
                      placeholder="Contoh: 081234567890"
                      value={memberWhatsapp}
                      onChange={(e) => setMemberWhatsapp(e.target.value)}
                    />
                    <span style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, display: "block" }}>
                      *Otomatis diperbarui ke profil member saat serah terima
                    </span>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--navy-900)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                      <Store size={13} style={{ color: "var(--blue-600)" }} /> Outlet Asal Penyerahan
                    </label>
                    <select
                      className="select"
                      style={{ fontSize: 12, padding: "8px 10px", width: "100%" }}
                      value={selectedOutletId}
                      onChange={(e) => setSelectedOutletId(e.target.value)}
                    >
                      {selectedMember.outlets.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nama_outlet} ({o.tipe.toUpperCase()} - {o.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="card"
                style={{
                  padding: 24,
                  textAlign: "center",
                  border: "2px dashed var(--border)",
                  background: "transparent",
                  color: "var(--text-muted)",
                }}
              >
                <User size={32} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                <p style={{ fontSize: 13, fontWeight: 600 }}>Belum ada member yang dipilih</p>
                <p style={{ fontSize: 11, marginTop: 4 }}>Cari nama member di atas untuk mulai mencatat kupon fisik.</p>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: HANDOVER FORM & BUNDLE SELECTOR */}
          <div className="card" style={{ padding: 24 }}>
            <form onSubmit={handleHandoverSubmit}>
              {/* Alert Feedback */}
              {handoverMsg && (
                <div
                  className={`alert alert-${handoverMsg.type === "success" ? "success" : "danger"}`}
                  style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 10 }}
                >
                  {handoverMsg.type === "success" ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="shrink-0 mt-0.5" />}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{handoverMsg.text}</div>
                    {handoverMsg.details && (
                      <div style={{ fontSize: 11, marginTop: 4 }}>
                        Batch ID: <strong>#{handoverMsg.details.batch_id}</strong> • Rentang: <strong>{handoverMsg.details.nomor_awal} s.d. {handoverMsg.details.nomor_akhir}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Top Controls: Periode & Stock Status */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: 16,
                  borderBottom: "1px solid var(--border)",
                  marginBottom: 20,
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                    Periode Kupon Fisik
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <select
                      className="select"
                      style={{ fontSize: 13, fontWeight: 700, padding: "6px 12px" }}
                      value={handoverPeriode}
                      onChange={(e) => setHandoverPeriode(e.target.value)}
                    >
                      {PROGRAM_PERIODS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    {loadingStock && <div className="spinner" style={{ width: 14, height: 14 }} />}
                  </div>
                </div>

                {/* Stock Stats Badge */}
                {stock && (
                  <div
                    style={{
                      background: "var(--slate-50)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Kapasitas: </span>
                      <strong>{stock.capacity}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Terbit: </span>
                      <strong style={{ color: "var(--blue-700)" }}>{stock.issued_count}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Tersedia: </span>
                      <strong style={{ color: stock.available_count > 0 ? "var(--emerald-700)" : "var(--rose-700)" }}>
                        {stock.available_count}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Mode Switcher */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 8 }}>
                  2. Pilih Metode Input Kupon
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setInputMode("bundle")}
                    className={`btn btn-sm ${inputMode === "bundle" ? "btn-gold" : "btn-outline"}`}
                    style={{ flex: 1, padding: "8px 12px" }}
                  >
                    <Layers size={14} /> Pilih Bundel (1-Klik @50 Pcs)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("range")}
                    className={`btn btn-sm ${inputMode === "range" ? "btn-gold" : "btn-outline"}`}
                    style={{ flex: 1, padding: "8px 12px" }}
                  >
                    <FileCheck size={14} /> Rentang Angka (Urut)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode("custom")}
                    className={`btn btn-sm ${inputMode === "custom" ? "btn-gold" : "btn-outline"}`}
                    style={{ flex: 1, padding: "8px 12px" }}
                  >
                    <Ticket size={14} /> Eceran / Nomor Acak
                  </button>
                </div>
              </div>

              {/* MODE 1: BUNDLE GRID SELECTOR */}
              {inputMode === "bundle" && (
                <div style={{ marginBottom: 24 }}>
                  {selectedMember && selectedMember.sisa_kuota < 50 && (
                    <div
                      style={{
                        background: "#EFF6FF",
                        border: "1px solid #BFDBFE",
                        borderRadius: 6,
                        padding: "8px 12px",
                        marginBottom: 12,
                        fontSize: 11,
                        color: "#1E40AF",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Info size={14} className="shrink-0 text-blue-600" />
                      <span>
                        Sisa hak kuota member (<strong>{selectedMember.sisa_kuota} lembar</strong>) kurang dari 1 bundel penuh (50 lembar). Silakan gunakan mode <strong>Rentang Angka</strong> atau <strong>Eceran</strong> agar jumlah kupon pas dan tidak melebihi kuota.
                      </span>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Klik bundel untuk memilih/membatalkan. 1 Bundel = 50 lembar kupon fisik. (Batas: maks {selectedMember?.sisa_kuota || 0} kupon)
                    </span>
                    {selectedBundles.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedBundles([])}
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: 10, padding: "2px 8px" }}
                      >
                        Reset Pilihan ({selectedBundles.length})
                      </button>
                    )}
                  </div>

                  {/* Bundles Grid 10x5 */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(105px, 1fr))",
                      gap: 6,
                      maxHeight: 260,
                      overflowY: "auto",
                      padding: "8px 4px",
                      background: "var(--slate-50)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    {stock?.bundles.map((b) => {
                      const isSelected = selectedBundles.includes(b.bundle_no);
                      const isTaken = b.status === "taken";
                      const willExceedQuota = selectedMember
                        ? !isSelected && (selectedBundles.length + 1) * 50 > selectedMember.sisa_kuota
                        : false;
                      const isDisabled = isTaken || willExceedQuota || (selectedMember ? selectedMember.sisa_kuota <= 0 : false);

                      return (
                        <button
                          key={b.bundle_no}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => toggleBundle(b.bundle_no)}
                          title={willExceedQuota ? `Melebihi sisa hak kuota member (${selectedMember?.sisa_kuota} lembar)` : undefined}
                          style={{
                            padding: "6px 8px",
                            borderRadius: 6,
                            textAlign: "center",
                            border: isSelected
                              ? "2px solid var(--gold-600)"
                              : isDisabled
                              ? "1px solid var(--slate-200)"
                              : "1px solid var(--border)",
                            background: isSelected
                              ? "var(--gold-100)"
                              : isDisabled
                              ? "var(--slate-100)"
                              : "#fff",
                            color: isSelected
                              ? "var(--gold-900)"
                              : isDisabled
                              ? "var(--slate-400)"
                              : "var(--navy-900)",
                            cursor: isDisabled ? "not-allowed" : "pointer",
                            transition: "all 0.1s ease",
                            opacity: isDisabled ? 0.55 : 1,
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 800 }}>Bundel {String(b.bundle_no).padStart(2, "0")}</div>
                          <div style={{ fontSize: 9, fontFamily: "monospace", color: isSelected ? "var(--gold-800)" : "var(--slate-600)" }}>
                            {String(b.start_seq).padStart(4, "0")} - {String(b.end_seq).padStart(4, "0")}
                          </div>
                          <div style={{ fontSize: 8, fontWeight: 700, marginTop: 2 }}>
                            {isTaken ? (
                              <span style={{ color: "var(--rose-700)" }}>HABIS</span>
                            ) : willExceedQuota ? (
                              <span style={{ color: "var(--rose-600)" }}>&gt; KUOTA</span>
                            ) : b.status === "partial" ? (
                              <span style={{ color: "var(--amber-700)" }}>SISA {b.available}</span>
                            ) : (
                              <span style={{ color: "var(--emerald-700)" }}>50 TERSISA</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* MODE 2: RANGE SELECTOR */}
              {inputMode === "range" && (
                <div
                  style={{
                    background: "var(--slate-50)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 24,
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--navy-900)", display: "block", marginBottom: 4 }}>
                        Nomor Awal (1 - 2500)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={2500}
                        className="input"
                        placeholder="Contoh: 1"
                        value={rangeStart}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : "";
                          setRangeStart(val);
                          // Otomatis bantu set rangeEnd jika member memiliki sisa kuota
                          if (val !== "" && selectedMember && selectedMember.sisa_kuota > 0) {
                            const maxEnd = Math.min(2500, Number(val) + selectedMember.sisa_kuota - 1);
                            if (rangeEnd === "" || Number(rangeEnd) < Number(val) || Number(rangeEnd) > maxEnd) {
                              setRangeEnd(maxEnd);
                            }
                          }
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--navy-900)" }}>
                          Nomor Akhir (1 - 2500)
                        </label>
                        {selectedMember && selectedMember.sisa_kuota > 0 && rangeStart && (
                          <button
                            type="button"
                            onClick={() => {
                              const maxEnd = Math.min(2500, Number(rangeStart) + selectedMember.sisa_kuota - 1);
                              setRangeEnd(maxEnd);
                            }}
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: 10, padding: "1px 6px" }}
                          >
                            Set Maks (+{selectedMember.sisa_kuota})
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={2500}
                        className="input"
                        placeholder="Contoh: 35"
                        value={rangeEnd}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : "";
                          if (val !== "" && selectedMember && rangeStart) {
                            const count = val - Number(rangeStart) + 1;
                            if (count > selectedMember.sisa_kuota) {
                              const clamped = Number(rangeStart) + selectedMember.sisa_kuota - 1;
                              setRangeEnd(clamped);
                              alert(
                                `Batas sisa kuota member adalah ${selectedMember.sisa_kuota} kupon. Nomor akhir otomatis dibatasi ke ${clamped}.`
                              );
                              return;
                            }
                          }
                          setRangeEnd(val);
                        }}
                      />
                    </div>
                  </div>
                  {rangeStart && rangeEnd && Number(rangeEnd) >= Number(rangeStart) && (
                    <div style={{ fontSize: 11, color: "var(--gold-800)", fontWeight: 600, marginTop: 8 }}>
                      Format Seri: <span style={{ fontFamily: "monospace" }}>{stock?.prefix}{String(rangeStart).padStart(4, "0")} s.d. {stock?.prefix}{String(rangeEnd).padStart(4, "0")}</span> ({Number(rangeEnd) - Number(rangeStart) + 1} kupon / Kuota: {selectedMember?.sisa_kuota || 0})
                    </div>
                  )}
                </div>
              )}

              {/* MODE 3: CUSTOM / ECERAN SELECTOR */}
              {inputMode === "custom" && (
                <div
                  style={{
                    background: "var(--slate-50)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 24,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--navy-900)" }}>
                      Ketik Nomor Kupon Pecahan (Dipisah Koma atau Spasi)
                    </label>
                    <span style={{ fontSize: 11, fontWeight: 600, color: requestedCount > (selectedMember?.sisa_kuota || 0) ? "var(--rose-600)" : "var(--text-muted)" }}>
                      Terpilih: {requestedCount} / Maks: {selectedMember?.sisa_kuota || 0}
                    </span>
                  </div>
                  <textarea
                    className="input"
                    rows={3}
                    style={{ fontFamily: "monospace", fontSize: 12 }}
                    placeholder="Contoh: 12, 15, 23, 40, 89"
                    value={customNumbersInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      const parts = val
                        .split(/[\s,]+/)
                        .map((p) => parseInt(p.trim(), 10))
                        .filter((n) => !isNaN(n) && n > 0);
                      const unique = Array.from(new Set(parts));
                      if (selectedMember && unique.length > selectedMember.sisa_kuota) {
                        alert(`Maksimal kupon yang boleh diinput adalah ${selectedMember.sisa_kuota} lembar sesuai hak member.`);
                        const allowed = unique.slice(0, selectedMember.sisa_kuota);
                        setCustomNumbersInput(allowed.join(", "));
                        return;
                      }
                      setCustomNumbersInput(val);
                    }}
                  />
                  <span style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, display: "block" }}>
                    *Cukup ketik angka saja, sistem otomatis menambahkan prefix {stock?.prefix}xxxx (Maksimal {selectedMember?.sisa_kuota || 0} lembar)
                  </span>
                </div>
              )}

              {/* Summary & Live Preview */}
              <div
                style={{
                  background: requestedCount > (selectedMember?.sisa_kuota || 0) ? "var(--rose-50)" : "var(--slate-100)",
                  border: requestedCount > (selectedMember?.sisa_kuota || 0) ? "1px solid var(--rose-300)" : "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                    Total Kupon Terpilih
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: requestedCount > (selectedMember?.sisa_kuota || 0) ? "var(--rose-700)" : "var(--navy-950)" }}>
                    {requestedCount} Lembar
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Sisa Kuota Member: <strong>{selectedMember?.sisa_kuota ?? 0} lembar</strong>
                  </div>
                  {requestedCount > (selectedMember?.sisa_kuota || 0) && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--rose-700)", marginTop: 2 }}>
                      ⚠️ Melebihi kuota member ({requestedCount - (selectedMember?.sisa_kuota || 0)} lembar lebih)
                    </div>
                  )}
                </div>
              </div>

              {/* Petugas & Keterangan Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--navy-900)", display: "block", marginBottom: 4 }}>
                    Nama Petugas Kasir / CS <span style={{ color: "var(--rose-600)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Nama staf yang menyerahkan"
                    value={petugasName}
                    onChange={(e) => setPetugasName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--navy-900)", display: "block", marginBottom: 4 }}>
                    Keterangan Penyerahan (Opsional)
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Misal: Penyerahan tahap 1 di CS"
                    value={keterangan}
                    onChange={(e) => setKeterangan(e.target.value)}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={
                  submitting ||
                  !selectedMember ||
                  Boolean(selectedMember.is_suspended) ||
                  requestedCount === 0 ||
                  requestedCount > (selectedMember?.sisa_kuota || 0)
                }
                className="btn btn-gold"
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  fontSize: 14,
                  fontWeight: 800,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 8,
                  ...(selectedMember?.is_suspended
                    ? { background: "#DC2626", color: "#fff", cursor: "not-allowed", opacity: 0.85 }
                    : {}),
                }}
              >
                {submitting ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16 }} /> Memproses Serah Terima...
                  </>
                ) : selectedMember?.is_suspended ? (
                  <>
                    <AlertTriangle size={18} /> Penyerahan Diblokir (Member Sedang Disanksi)
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} /> Simpan &amp; Serahkan {requestedCount > 0 ? `${requestedCount} Kupon` : "Kupon"}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 2: CEK PEMENANG UNDIAN (DOORPRIZE FINDER)
          ======================================================== */}
      {activeTab === "lookup" && (
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {/* Hero Search Box */}
          <div
            className="card"
            style={{
              padding: "32px 36px",
              textAlign: "center",
              background: "linear-gradient(180deg, #ffffff 0%, #fffdf8 100%)",
              border: "1px solid var(--gold-300)",
              boxShadow: "0 8px 24px rgba(184, 134, 11, 0.08)",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "var(--gold-100)",
                color: "var(--gold-700)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
              }}
            >
              <Trophy size={26} />
            </div>

            <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--navy-950)", marginBottom: 6 }}>
              Pencarian Pemenang Kupon Undian
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, maxWidth: 500, margin: "0 auto 20px" }}>
              Ketik nomor kupon fisik yang ditarik saat pengundian untuk mengetahui identitas pemilik, nomor WhatsApp, dan outlet asal.
            </p>

            <form onSubmit={handleLookup} style={{ display: "flex", gap: 10, maxWidth: 520, margin: "0 auto" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input
                  type="text"
                  className="input"
                  style={{ paddingLeft: 40, fontSize: 14, height: 44, fontWeight: 700 }}
                  placeholder="Contoh: ORT-KUP2609-0025 atau cukup ketik 25"
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={isLookingUp || !lookupQuery.trim()}
                className="btn btn-gold"
                style={{ height: 44, padding: "0 22px", fontWeight: 700 }}
              >
                {isLookingUp ? <div className="spinner" style={{ width: 16, height: 16 }} /> : "Cari Kupon"}
              </button>
            </form>
          </div>

          {/* Lookup Result Display */}
          {lookupResult && (
            <div className="fade-in">
              {lookupResult.found && lookupResult.coupon ? (
                <div
                  className="card"
                  style={{
                    padding: 28,
                    border: "2px solid var(--gold-500)",
                    background: "#ffffff",
                    boxShadow: "0 10px 30px rgba(184, 134, 11, 0.12)",
                  }}
                >
                  {/* Winner Top Header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: "1px solid var(--border)",
                      paddingBottom: 16,
                      marginBottom: 20,
                    }}
                  >
                    <div>
                      {lookupResult.coupon.status === "void" ? (
                        <span className="badge badge-batal" style={{ fontSize: 10, textTransform: "uppercase", marginBottom: 4, background: "#DC2626", color: "#fff" }}>
                          Kupon Gugur / Diskualifikasi
                        </span>
                      ) : (
                        <span className="badge badge-aktif" style={{ fontSize: 10, textTransform: "uppercase", marginBottom: 4 }}>
                          Kupon Sah Terverifikasi
                        </span>
                      )}
                      <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "monospace", color: lookupResult.coupon.status === "void" ? "#DC2626" : "var(--navy-950)", letterSpacing: ".02em" }}>
                        {lookupResult.coupon.nomor_kupon}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span className={`badge badge-${lookupResult.coupon.status === "aktif" ? "aktif" : "batal"}`} style={{ fontSize: 11, background: lookupResult.coupon.status === "void" ? "#DC2626" : undefined, color: lookupResult.coupon.status === "void" ? "#fff" : undefined }}>
                        STATUS: {lookupResult.coupon.status.toUpperCase()}
                      </span>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                        Nomor Urut: #{lookupResult.coupon.nomor_urut}
                      </div>
                    </div>
                  </div>

                  {lookupResult.coupon.status === "void" && (
                    <div
                      style={{
                        background: "#FEF2F2",
                        border: "1px solid #FCA5A5",
                        borderRadius: 8,
                        padding: "10px 14px",
                        marginBottom: 16,
                        color: "#991B1B",
                        fontSize: 12,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <AlertTriangle size={16} className="shrink-0 text-red-600" />
                      <span>
                        DISKUALIFIKASI: Kupon ini telah dibatalkan ({lookupResult.coupon.void_reason || "Gugur akibat sanksi/pelanggaran"}). Tidak sah sebagai pemenang undian.
                      </span>
                    </div>
                  )}

                  {/* Winner Detail Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                    {/* Member Box */}
                    <div style={{ background: "var(--slate-50)", padding: 14, borderRadius: 8, border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                        Identitas Pemenang
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "var(--navy-950)", margin: "4px 0" }}>
                        {lookupResult.coupon.member.nama_pemilik}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace", marginBottom: 6 }}>
                        ID: {lookupResult.coupon.member.id}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--slate-700)" }}>
                        {[lookupResult.coupon.member.alamat, lookupResult.coupon.member.kota].filter((v) => v && v !== "—").join(", ")}
                      </div>
                    </div>

                    {/* Outlet & Contact Box */}
                    <div style={{ background: "var(--slate-50)", padding: 14, borderRadius: 8, border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                        Outlet Asal &amp; WhatsApp
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--blue-900)", margin: "4px 0" }}>
                        {lookupResult.coupon.outlet_asal.nama_outlet}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                        Lini Bisnis: <strong>{lookupResult.coupon.outlet_asal.tipe.toUpperCase()}</strong> ({lookupResult.coupon.outlet_asal.id})
                      </div>

                      {/* WhatsApp Button */}
                      {lookupResult.coupon.whatsapp && lookupResult.coupon.whatsapp !== "—" ? (
                        <a
                          href={`https://wa.me/${lookupResult.coupon.whatsapp.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm"
                          style={{
                            background: "#25D366",
                            color: "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          <Phone size={12} /> Chat WA: {lookupResult.coupon.whatsapp} <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Tidak ada No. WA</span>
                      )}
                    </div>
                  </div>

                  {/* Audit Footnote */}
                  <div
                    style={{
                      padding: "10px 14px",
                      background: "var(--slate-100)",
                      borderRadius: 6,
                      fontSize: 11,
                      color: "var(--slate-700)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      Diserahkan pada: <strong>{lookupResult.coupon.tanggal_serah}</strong> oleh Petugas: <strong>{lookupResult.coupon.petugas}</strong>
                    </div>

                    {/* Void Button */}
                    {lookupResult.coupon.status === "aktif" && (
                      <button
                        type="button"
                        onClick={() => {
                          setVoidTarget({ couponId: lookupResult.coupon?.id, nomorKupon: lookupResult.coupon?.nomor_kupon });
                          setShowVoidModal(true);
                        }}
                        className="btn btn-outline btn-sm"
                        style={{ color: "var(--rose-700)", borderColor: "var(--rose-300)", fontSize: 11 }}
                      >
                        <XCircle size={13} /> Batalkan (Void) Kupon
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="card"
                  style={{
                    padding: 24,
                    textAlign: "center",
                    background: "var(--rose-50)",
                    border: "1px solid var(--rose-200)",
                    color: "var(--rose-900)",
                  }}
                >
                  <AlertTriangle size={24} style={{ margin: "0 auto 8px" }} />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Kupon Tidak Ditemukan</div>
                  <p style={{ fontSize: 12, marginTop: 4 }}>
                    {lookupResult.message || "Nomor kupon yang dicari belum pernah diserahkan atau tidak terdaftar di sistem."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          TAB 3: RIWAYAT & REKAPITULASI
          ======================================================== */}
      {activeTab === "history" && (
        <div>
          {/* Summary Stat Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
            <div className="card" style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                Total Kupon Aktif
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--blue-900)", marginTop: 2 }}>
                {historyStats.total_aktif.toLocaleString("id-ID")}
              </div>
            </div>

            <div className="card" style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                Total Kupon Dibatalkan (Void)
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--rose-700)", marginTop: 2 }}>
                {historyStats.total_void.toLocaleString("id-ID")}
              </div>
            </div>

            <div className="card" style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                Total Member Penerima
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--gold-600)", marginTop: 2 }}>
                {historyStats.total_member.toLocaleString("id-ID")}
              </div>
            </div>

            <div className="card" style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                Total Batch Penyerahan
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--emerald-700)", marginTop: 2 }}>
                {historyStats.total_batches.toLocaleString("id-ID")}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div
            className="card"
            style={{
              padding: 14,
              marginBottom: 16,
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ position: "relative", flex: "1 1 260px" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                className="input"
                style={{ paddingLeft: 32, fontSize: 12, height: 36 }}
                placeholder="Cari nomor kupon, member, no WA..."
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <select
              className="select"
              style={{ fontSize: 12, height: 36 }}
              value={historyPeriode}
              onChange={(e) => {
                setHistoryPeriode(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Periode</option>
              {PROGRAM_PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label.split(" (")[0]}
                </option>
              ))}
            </select>

            <select
              className="select"
              style={{ fontSize: 12, height: 36 }}
              value={historyStatus}
              onChange={(e) => {
                setHistoryStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Semua Status</option>
              <option value="aktif">Aktif Saja</option>
              <option value="void">Void (Batal) Saja</option>
            </select>

            <button onClick={loadHistory} className="btn btn-outline btn-sm" style={{ height: 36 }}>
              <RefreshCw size={13} /> Segarkan
            </button>
          </div>

          {/* Data Table */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: "center" }}>No</th>
                  <th style={{ width: 170 }}>Nomor Kupon</th>
                  <th>Member / Pemilik</th>
                  <th>Outlet Asal</th>
                  <th>No. WhatsApp</th>
                  <th>Tanggal Serah</th>
                  <th>Petugas</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                  <th style={{ textAlign: "center", width: 100 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: 36 }}>
                      <div className="spinner mx-auto mb-2" />
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Memuat data kupon...</span>
                    </td>
                  </tr>
                ) : historyCoupons.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: 36, color: "var(--text-muted)" }}>
                      Belum ada data kupon yang sesuai kriteria pencarian.
                    </td>
                  </tr>
                ) : (
                  historyCoupons.map((c, idx) => (
                    <tr key={c.id}>
                      <td style={{ textAlign: "center", fontFamily: "monospace", color: "var(--text-muted)" }}>
                        {(page - 1) * 25 + idx + 1}
                      </td>
                      <td style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--navy-900)" }}>
                        {c.nomor_kupon}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: "var(--navy-950)" }}>{c.nama_pemilik}</div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>{c.identity_id}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.nama_outlet}</div>
                        <span className="badge badge-draft" style={{ fontSize: 9, textTransform: "uppercase" }}>{c.outlet_tipe}</span>
                      </td>
                      <td style={{ fontFamily: "monospace" }}>
                        {c.kupon_whatsapp || c.member_whatsapp || "—"}
                      </td>
                      <td>{c.tanggal_serah}</td>
                      <td>{c.petugas}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`badge badge-${c.status === "aktif" ? "aktif" : "batal"}`} style={{ fontSize: 10 }}>
                          {c.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {c.status === "aktif" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setVoidTarget({ couponId: c.id, nomorKupon: c.nomor_kupon });
                              setShowVoidModal(true);
                            }}
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: 10, padding: "2px 8px", color: "var(--rose-700)" }}
                          >
                            Void
                          </button>
                        ) : (
                          <span style={{ fontSize: 10, color: "var(--slate-400)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 18px",
                borderTop: "1px solid var(--border)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <div>
                Menampilkan {historyCoupons.length} dari {totalCount} kupon
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="btn btn-outline btn-sm"
                  style={{ padding: "4px 10px" }}
                >
                  Sebelumnya
                </button>
                <span>Halaman {page} dari {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="btn btn-outline btn-sm"
                  style={{ padding: "4px 10px" }}
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL VOID KUPON (DENGAN APPROVAL OWNER)
          ======================================================== */}
      {showVoidModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: 460 }}>
            <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--rose-100)",
                    color: "var(--rose-700)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Lock size={16} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--navy-950)" }}>
                  Pembatalan (Void) Kupon Fisik
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowVoidModal(false);
                  setVoidError("");
                }}
                className="btn btn-outline btn-sm"
                style={{ padding: "2px 6px" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleVoidSubmit}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {voidError && (
                  <div className="alert alert-danger" style={{ fontSize: 12 }}>
                    <AlertTriangle size={14} /> {voidError}
                  </div>
                )}

                <div
                  style={{
                    background: "var(--slate-50)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "10px 12px",
                    fontSize: 12,
                  }}
                >
                  Target Batal:{" "}
                  <strong style={{ fontFamily: "monospace", color: "var(--rose-700)" }}>
                    {voidTarget?.nomorKupon ? voidTarget.nomorKupon : voidTarget?.batchId ? `Batch #${voidTarget.batchId}` : "Kupon Terpilih"}
                  </strong>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    Kupon yang dibatalkan akan otomatis mengembalikan hak kuota member dan nomor kupon dapat digunakan kembali.
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--navy-900)", display: "block", marginBottom: 4 }}>
                    Alasan Pembatalan (Wajib)
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Contoh: Salah ambil nomor fisik di meja kasir"
                    value={voidAlasan}
                    onChange={(e) => setVoidAlasan(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--navy-900)", display: "block", marginBottom: 4 }}>
                    Nama Petugas yang Membatalkan
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Nama staf/admin"
                    value={voidPetugas}
                    onChange={(e) => setVoidPetugas(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--navy-900)", display: "block", marginBottom: 4 }}>
                    Password Persetujuan Owner (Approval) <span style={{ color: "var(--rose-600)" }}>*</span>
                  </label>
                  <input
                    type="password"
                    required
                    className="input"
                    placeholder="Masukkan password persetujuan Owner"
                    value={voidPassword}
                    onChange={(e) => setVoidPassword(e.target.value)}
                  />
                </div>
              </div>

              <div
                className="modal-footer"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  borderTop: "1px solid var(--border)",
                  padding: "12px 16px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowVoidModal(false)}
                  className="btn btn-outline btn-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={voiding}
                  className="btn btn-sm"
                  style={{ background: "var(--rose-600)", color: "#fff", fontWeight: 700 }}
                >
                  {voiding ? "Memproses..." : "Konfirmasi Void Kupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CouponsPage() {
  return (
    <React.Suspense fallback={<div className="p-10 text-center"><div className="spinner mx-auto" /></div>}>
      <CouponsContent />
    </React.Suspense>
  );
}
