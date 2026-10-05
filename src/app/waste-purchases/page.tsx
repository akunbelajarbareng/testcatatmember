"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Droplets,
  Search,
  Plus,
  Calendar,
  Filter,
  RefreshCw,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Store,
  User,
  Scale,
  DollarSign,
  Award,
  FileText,
  X,
  Save,
} from "lucide-react";
import Pagination from "@/components/Pagination";

interface WasteItem {
  id: number;
  outlet_id: string;
  identity_id: string;
  tanggal: string;
  jenis_waste: string;
  berat_kg: number;
  harga_per_kg: number;
  total_rupiah: number;
  poin: number;
  no_timbangan: string | null;
  catatan: string | null;
  petugas: string;
  nama_outlet: string;
  outlet_tipe: string;
  nama_pemilik: string;
  kota?: string;
  created_at: string;
}

interface OutletOption {
  id: string;
  nama_outlet: string;
  tipe: string;
  identity_id: string;
  nama_pemilik: string;
}

function fmt(n: number) {
  return (n || 0).toLocaleString("id-ID");
}

function fmtRp(n: number) {
  return `Rp ${(n || 0).toLocaleString("id-ID")}`;
}

export default function WastePurchasesPage() {
  const [items, setItems] = useState<WasteItem[]>([]);
  const [summary, setSummary] = useState({
    total_trx: 0,
    total_berat_kg: 0,
    total_rupiah: 0,
    total_poin: 0,
  });
  const [config, setConfig] = useState({
    harga_uco_per_kg: 8000,
    rate_waste_poin: 10000,
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("2026-09");
  const [q, setQ] = useState("");

  // Outlets for modal dropdown
  const [outlets, setOutlets] = useState<OutletOption[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form Fields
  const [formOutletId, setFormOutletId] = useState("");
  const [formTanggal, setFormTanggal] = useState("");
  const [formJenisWaste, setFormJenisWaste] = useState("UCO");
  const [formBeratKg, setFormBeratKg] = useState<number | "">("");
  const [formHargaPerKg, setFormHargaPerKg] = useState<number | "">("");
  const [formTotalRupiah, setFormTotalRupiah] = useState<number | "">("");
  const [formNoTimbangan, setFormNoTimbangan] = useState("");
  const [formCatatan, setFormCatatan] = useState("");

  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load Outlets for selection
  useEffect(() => {
    fetch("/api/outlets")
      .then((res) => res.json())
      .then((json) => {
        setOutlets(json.outlets || []);
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      if (q) params.set("q", q);
      params.set("page", String(page));
      params.set("limit", "25");

      const res = await fetch(`/api/waste-purchases?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setItems(json.items || []);
        setSummary(json.summary || { total_trx: 0, total_berat_kg: 0, total_rupiah: 0, total_poin: 0 });
        if (json.config) setConfig(json.config);
        setTotalPages(json.pagination?.totalPages || 1);
      }
    } catch {
      setNotification({ type: "error", text: "Gagal memuat data waste purchasing" });
    } finally {
      setLoading(false);
    }
  }, [month, q, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Recalculate Total Rp & Preview Poin when Berat or Harga changes
  useEffect(() => {
    if (formBeratKg !== "" && formHargaPerKg !== "") {
      const total = Math.round(Number(formBeratKg) * Number(formHargaPerKg));
      setFormTotalRupiah(total);
    }
  }, [formBeratKg, formHargaPerKg]);

  const openCreateModal = () => {
    setModalMode("create");
    setEditingId(null);
    setFormOutletId(outlets.length > 0 ? outlets[0].id : "");
    setFormTanggal(new Date().toISOString().split("T")[0]);
    setFormJenisWaste("UCO");
    setFormBeratKg("");
    setFormHargaPerKg(config.harga_uco_per_kg || 8000);
    setFormTotalRupiah("");
    setFormNoTimbangan("");
    setFormCatatan("");
    setIsModalOpen(true);
  };

  const openEditModal = (item: WasteItem) => {
    setModalMode("edit");
    setEditingId(item.id);
    setFormOutletId(item.outlet_id);
    setFormTanggal(item.tanggal);
    setFormJenisWaste(item.jenis_waste || "UCO");
    setFormBeratKg(item.berat_kg);
    setFormHargaPerKg(item.harga_per_kg);
    setFormTotalRupiah(item.total_rupiah);
    setFormNoTimbangan(item.no_timbangan || "");
    setFormCatatan(item.catatan || "");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOutletId) {
      alert("Silakan pilih outlet member terlebih dahulu.");
      return;
    }
    if (!formBeratKg || Number(formBeratKg) <= 0) {
      alert("Silakan masukkan berat (kg) yang valid.");
      return;
    }

    setSaving(true);
    setNotification(null);

    const payload = {
      outlet_id: formOutletId,
      tanggal: formTanggal,
      jenis_waste: formJenisWaste,
      berat_kg: Number(formBeratKg),
      harga_per_kg: Number(formHargaPerKg),
      total_rupiah: Number(formTotalRupiah),
      no_timbangan: formNoTimbangan,
      catatan: formCatatan,
    };

    try {
      const url = modalMode === "create" ? "/api/waste-purchases" : `/api/waste-purchases/${editingId}`;
      const method = modalMode === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok) {
        setNotification({
          type: "success",
          text: modalMode === "create" ? "Transaksi waste purchasing berhasil dicatat!" : "Transaksi berhasil diperbarui!",
        });
        setIsModalOpen(false);
        loadData();
      } else {
        alert(json.error || "Gagal menyimpan transaksi");
      }
    } catch {
      alert("Terjadi kesalahan koneksi.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(`Yakin ingin menghapus catatan transaksi waste #${id}? Tindakan ini akan tercatat dalam audit log.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/waste-purchases/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok) {
        setNotification({ type: "success", text: "Transaksi berhasil dihapus" });
        loadData();
      } else {
        alert(json.error || "Gagal menghapus transaksi");
      }
    } catch {
      alert("Terjadi kesalahan koneksi.");
    }
  };

  const previewPoin = formTotalRupiah
    ? Math.floor(Number(formTotalRupiah) / (config.rate_waste_poin || 10000))
    : 0;

  return (
    <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1200 }}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#10b981",
              }}
            >
              <Droplets size={20} />
            </div>
            <h1 className="page-title" style={{ margin: 0 }}>Waste Purchasing (UCO)</h1>
          </div>
          <p className="page-subtitle" style={{ marginTop: 4 }}>
            Pencatatan pembelian minyak jelantah dari outlet member, konversi reward point, dan pendapatan tambahan pelanggan
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <Plus size={16} /> Catat Pembelian Baru
        </button>
      </div>

      {notification && (
        <div className={`alert alert-${notification.type} mb-5`}>
          {notification.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* Card 1: Total Volume */}
        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Total Volume Limbah (UCO)
            </div>
            <div className="text-2xl font-black text-slate-900">
              {summary.total_berat_kg.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <span className="text-sm font-semibold text-slate-500">Kg</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Scale size={20} />
          </div>
        </div>

        {/* Card 2: Total Pembelian Rp */}
        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Total Pembelian Waste
            </div>
            <div className="text-2xl font-black text-emerald-700">
              {fmtRp(summary.total_rupiah)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign size={20} />
          </div>
        </div>

        {/* Card 3: Poin Diberikan */}
        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Poin Reward Diberikan
            </div>
            <div className="text-2xl font-black text-blue-800">
              {fmt(summary.total_poin)} <span className="text-sm font-semibold text-slate-500">Point</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
            <Award size={20} />
          </div>
        </div>

        {/* Card 4: Frekuensi Trx */}
        <div className="card p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Frekuensi Transaksi
            </div>
            <div className="text-2xl font-black text-slate-900">
              {fmt(summary.total_trx)} <span className="text-sm font-semibold text-slate-500">Transaksi</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
            <FileText size={20} />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card p-4 mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          {/* Search */}
          <div style={{ position: "relative", minWidth: 320 }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              className="input"
              style={{ paddingLeft: 36, width: "100%" }}
              placeholder="Cari outlet, nama pemilik, atau no timbangan..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Month Selector */}
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-slate-400" />
            <select
              className="input text-xs font-semibold py-1.5"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua Periode</option>
              <option value="2026-09">September 2026</option>
              <option value="2026-10">Oktober 2026</option>
              <option value="2026-11">November 2026</option>
              <option value="2026-12">Desember 2026</option>
              <option value="2027-01">Januari 2027</option>
            </select>
          </div>
        </div>

        <button
          onClick={loadData}
          className="btn btn-outline btn-sm"
          disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <div className="spinner" style={{ margin: "0 auto" }} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <Droplets size={40} style={{ color: "var(--text-muted)", margin: "0 auto 12px" }} />
            <div style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
              Belum ada catatan pembelian waste pada filter ini
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Klik tombol &ldquo;Catat Pembelian Baru&rdquo; untuk menginput setoran minyak jelantah dari outlet member.
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Tanggal</th>
                    <th style={{ minWidth: 200 }}>Outlet &amp; Member</th>
                    <th style={{ width: 100 }} className="text-center">Kategori</th>
                    <th style={{ width: 110 }} className="text-right">Berat (Kg)</th>
                    <th style={{ width: 110 }} className="text-right">Harga / Kg</th>
                    <th style={{ width: 130 }} className="text-right">Total Pembelian</th>
                    <th style={{ width: 100 }} className="text-center">Reward Poin</th>
                    <th style={{ minWidth: 140 }}>No Timbang &amp; Catatan</th>
                    <th style={{ width: 90 }} className="text-center">Petugas</th>
                    <th style={{ width: 80 }} className="text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono text-xs">{row.tanggal}</td>
                      <td>
                        <div className="font-bold text-slate-900 text-xs uppercase flex items-center gap-1.5">
                          <Store size={12} className="text-slate-400" />
                          {row.nama_outlet}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <User size={11} className="text-slate-400" />
                          <span>{row.nama_pemilik}</span>
                          <span className="font-mono text-[10px] text-slate-400">({row.outlet_id})</span>
                        </div>
                      </td>
                      <td className="text-center">
                        <span className="badge badge-success text-[10px] uppercase font-bold">
                          {row.jenis_waste}
                        </span>
                      </td>
                      <td className="text-right font-mono font-bold text-slate-900 text-xs">
                        {row.berat_kg.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Kg
                      </td>
                      <td className="text-right font-mono text-xs text-slate-600">
                        {fmtRp(row.harga_per_kg)}
                      </td>
                      <td className="text-right font-mono font-extrabold text-emerald-700 text-xs">
                        {fmtRp(row.total_rupiah)}
                      </td>
                      <td className="text-center font-mono font-bold text-blue-700 text-xs">
                        +{fmt(row.poin)} Pt
                      </td>
                      <td className="text-xs text-slate-600">
                        {row.no_timbangan && (
                          <div className="font-mono font-semibold text-slate-800 text-[11px]">
                            #{row.no_timbangan}
                          </div>
                        )}
                        {row.catatan ? (
                          <div className="text-[11px] text-slate-500 italic mt-0.5">{row.catatan}</div>
                        ) : !row.no_timbangan ? (
                          <span className="text-slate-300">—</span>
                        ) : null}
                      </td>
                      <td className="text-center font-mono text-[11px] text-slate-500">
                        {row.petugas}
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditModal(row)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-blue-600"
                            title="Edit Transaksi"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(row.id)}
                            className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-600"
                            title="Hapus Transaksi"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border-color)" }}>
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={summary.total_trx}
                  pageSize={25}
                  itemLabel="transaksi"
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Input Transaksi */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 520,
              padding: 24,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Droplets size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    {modalMode === "create" ? "Catat Pembelian Waste (UCO)" : "Edit Pembelian Waste"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {modalMode === "create"
                      ? "Pencatatan per outlet member & perhitungan poin otomatis"
                      : `Mengedit transaksi ID #${editingId}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Outlet Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Pilih Outlet Member <span className="text-red-500">*</span>
                </label>
                <select
                  className="input w-full font-medium"
                  value={formOutletId}
                  onChange={(e) => setFormOutletId(e.target.value)}
                  required
                  disabled={modalMode === "edit"}
                >
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nama_outlet} — {o.nama_pemilik} ({o.id} / {o.tipe.toUpperCase()})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Pencatatan limbah terikat langsung ke outlet fisik &amp; akun One Identity pemiliknya.
                </p>
              </div>

              {/* Tanggal & Jenis Waste */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tanggal Transaksi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    className="input w-full font-mono"
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Jenis Limbah</label>
                  <select
                    className="input w-full font-medium"
                    value={formJenisWaste}
                    onChange={(e) => setFormJenisWaste(e.target.value)}
                  >
                    <option value="UCO">UCO (Minyak Jelantah)</option>
                  </select>
                </div>
              </div>

              {/* Berat & Harga per Kg */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Berat Pembelian (Kg) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 focus-within:border-emerald-500">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Contoh: 25.5"
                      className="w-full text-sm font-mono font-bold text-slate-900 focus:outline-none"
                      value={formBeratKg}
                      onChange={(e) => setFormBeratKg(e.target.value === "" ? "" : Number(e.target.value))}
                      required
                    />
                    <span className="text-xs text-slate-400 font-semibold">Kg</span>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Harga Beli per Kg (Rp)
                  </label>
                  <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 focus-within:border-emerald-500">
                    <span className="text-xs text-slate-400 font-semibold">Rp</span>
                    <input
                      type="number"
                      step="100"
                      min="0"
                      className="w-full text-sm font-mono font-bold text-slate-900 focus:outline-none"
                      value={formHargaPerKg}
                      onChange={(e) => setFormHargaPerKg(e.target.value === "" ? "" : Number(e.target.value))}
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Acuan sistem: {fmtRp(config.harga_uco_per_kg)}/kg
                  </p>
                </div>
              </div>

              {/* Total Rupiah & Poin Benefit Preview */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-700">Total Nominal Pembelian:</span>
                  <div className="flex items-center gap-1 bg-white border border-emerald-300 rounded px-2 py-1">
                    <span className="text-xs text-emerald-600 font-semibold">Rp</span>
                    <input
                      type="number"
                      className="w-32 text-sm font-mono font-black text-emerald-800 text-right focus:outline-none"
                      value={formTotalRupiah}
                      onChange={(e) => setFormTotalRupiah(e.target.value === "" ? "" : Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px]">
                  <span className="text-slate-500">Estimasi Poin Reward Tambahan:</span>
                  <span className="font-mono font-bold text-blue-700">
                    +{fmt(previewPoin)} Point (0 Kupon)
                  </span>
                </div>
              </div>

              {/* No Timbangan & Catatan */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">No Timbangan / Bukti</label>
                  <input
                    type="text"
                    className="input w-full font-mono"
                    placeholder="Contoh: TMB-0926-001"
                    value={formNoTimbangan}
                    onChange={(e) => setFormNoTimbangan(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Catatan Tambahan</label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="Catatan drum / kualitas..."
                    value={formCatatan}
                    onChange={(e) => setFormCatatan(e.target.value)}
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-outline btn-sm"
                  disabled={saving}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                  disabled={saving}
                >
                  <Save size={13} /> {saving ? "Menyimpan..." : "Simpan Transaksi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
