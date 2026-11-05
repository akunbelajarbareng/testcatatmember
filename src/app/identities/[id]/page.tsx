"use client";
import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, FileText, Store, GitMerge, Award, Ticket, Banknote,
  ChevronRight, Edit3, Trash2, X, CheckCircle2, AlertCircle, AlertTriangle,
  Lock, ArrowRight, ShieldCheck, Check, Info, Plus, ArrowRightLeft, Unlink, RefreshCw,
  Power, PowerOff
} from "lucide-react";

function fmt(n: number) { return (n || 0).toLocaleString("id-ID"); }
function fmtRp(n: number) { return `Rp ${fmt(n)}`; }

interface Identity {
  id: string; nama_pemilik: string; alamat: string; kecamatan: string;
  kota: string; kode_pos: string; provinsi: string; status: string;
  whatsapp?: string;
  nonaktif_tipe?: 'manual' | 'otomatis' | null;
  nonaktif_alasan?: string | null;
  nonaktif_tanggal?: string | null;
  nonaktif_oleh?: string | null;
  is_suspended?: number;
  suspend_type?: 'temporary' | 'permanent' | null;
  suspend_dari?: string | null;
  suspend_sampai?: string | null;
  suspend_reason?: string | null;
  suspend_reset_points?: number;
  suspended_at?: string | null;
  suspended_by?: string | null;
}
interface PenaltyRecord {
  id: number;
  identity_id: string;
  jenis_sanksi: 'temporary' | 'permanent';
  reset_saldo_lama: number;
  dari: string;
  sampai?: string | null;
  alasan: string;
  petugas: string;
  voided_coupons_count: number;
  wiped_points: number;
  status: 'aktif' | 'dicabut';
  revoked_at?: string | null;
  revoked_by?: string | null;
  revoked_reason?: string | null;
  created_at: string;
}
interface PenaltyInfo {
  is_suspended: boolean;
  suspend_type?: 'temporary' | 'permanent' | null;
  suspend_dari?: string | null;
  suspend_sampai?: string | null;
  suspend_reason?: string | null;
  suspend_reset_points?: boolean;
  suspended_at?: string | null;
  suspended_by?: string | null;
  active_penalty?: PenaltyRecord | null;
  history: PenaltyRecord[];
}
interface Outlet {
  id: string; tipe: string; nama_outlet: string; id_pos_lama: string | null;
  aktif: number; aliases: string | null;
  nonaktif_tipe?: 'manual' | 'otomatis' | null;
  nonaktif_alasan?: string | null;
  nonaktif_tanggal?: string | null;
  nonaktif_oleh?: string | null;
}
interface Statement {
  id: number; bulan: string; status: string; revisi: number;
  total_transaksi: number; total_poin: number; total_kupon: number;
  kumulatif_poin: number; kumulatif_kupon: number;
}

interface MergePreview {
  canMerge: boolean;
  reasons: string[];
  source: {
    id: string;
    nama_pemilik: string;
    outletsCount: number;
    invoicesCount: number;
    couponsCount?: number;
    batchesCount?: number;
    penaltiesCount?: number;
    months: string[];
  };
  target: {
    id: string;
    nama_pemilik: string;
    outletsCount: number;
    invoicesCount: number;
    couponsCount?: number;
    batchesCount?: number;
    penaltiesCount?: number;
    months: string[];
  };
  collisions: string[];
  monthsMatch: boolean;
}

const BULAN_ID: Record<string, string> = {
  "01":"Januari","02":"Februari","03":"Maret","04":"April","05":"Mei","06":"Juni",
  "07":"Juli","08":"Agustus","09":"September","10":"Oktober","11":"November","12":"Desember",
};
function bulanLabel(yyyyMM: string) {
  const [y, m] = yyyyMM.split("-");
  return `${BULAN_ID[m]} ${y}`;
}

export default function IdentityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [allOutletsList, setAllOutletsList] = useState<{ id: string; nama_outlet: string; tipe: string; nama_pemilik: string }[]>([]);
  const [unmappedAliasesList, setUnmappedAliasesList] = useState<{ nama_pos: string; jumlah_transaksi: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Identity Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editId, setEditId] = useState("");
  const [editNama, setEditNama] = useState("");
  const [editAlamat, setEditAlamat] = useState("");
  const [editKecamatan, setEditKecamatan] = useState("");
  const [editKota, setEditKota] = useState("");
  const [editKodePos, setEditKodePos] = useState("");
  const [editProvinsi, setEditProvinsi] = useState("");
  const [editStatus, setEditStatus] = useState("aktif");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Merge Modal State
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [otherMembers, setOtherMembers] = useState<{ id: string; nama_pemilik: string; kota: string }[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");

  // Outlet Modal State (Add / Edit)
  const [showOutletModal, setShowOutletModal] = useState(false);
  const [outletModalMode, setOutletModalMode] = useState<"add" | "edit">("add");
  const [outletTargetId, setOutletTargetId] = useState("");
  const [outletTipe, setOutletTipe] = useState<"ukm" | "grosir" | "retail">("ukm");
  const [outletNama, setOutletNama] = useState("");
  const [outletCustomId, setOutletCustomId] = useState("");
  const [outletPosLama, setOutletPosLama] = useState("");
  const [outletSaving, setOutletSaving] = useState(false);
  const [outletError, setOutletError] = useState("");

  // Transfer Alias Modal State
  const [showTransferAliasModal, setShowTransferAliasModal] = useState(false);
  const [transferringAliasName, setTransferringAliasName] = useState("");
  const [transferCurrentOutletId, setTransferCurrentOutletId] = useState("");
  const [transferTargetOutletId, setTransferTargetOutletId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");

  // Quick Map Alias Modal State
  const [showQuickMapModal, setShowQuickMapModal] = useState(false);
  const [quickMapOutletId, setQuickMapOutletId] = useState("");
  const [quickMapOutletName, setQuickMapOutletName] = useState("");
  const [quickMapSelectedAlias, setQuickMapSelectedAlias] = useState("");
  const [quickMapping, setQuickMapping] = useState(false);
  const [quickMapError, setQuickMapError] = useState("");

  // Delete State
  const [deleting, setDeleting] = useState(false);

  // Penalty State
  const [penaltyInfo, setPenaltyInfo] = useState<PenaltyInfo | null>(null);
  const [showApplyPenaltyModal, setShowApplyPenaltyModal] = useState(false);
  const [showRevokePenaltyModal, setShowRevokePenaltyModal] = useState(false);

  // Apply Penalty Form State
  const [penaltyType, setPenaltyType] = useState<"temporary" | "permanent">("temporary");
  const [penaltyDari, setPenaltyDari] = useState("2026-09-01");
  const [penaltySampai, setPenaltySampai] = useState("2026-09-30");
  const [resetSaldoLama, setResetSaldoLama] = useState(false);
  const [confirmResetAcknowledged, setConfirmResetAcknowledged] = useState(false);
  const [penaltyAlasan, setPenaltyAlasan] = useState("");
  const [penaltyPetugas, setPenaltyPetugas] = useState("");
  const [penaltyPassword, setPenaltyPassword] = useState("");
  const [penaltySubmitting, setPenaltySubmitting] = useState(false);
  const [penaltyError, setPenaltyError] = useState("");

  // Revoke Penalty Form State
  const [revokeAlasan, setRevokeAlasan] = useState("");
  const [revokePetugas, setRevokePetugas] = useState("");
  const [revokePassword, setRevokePassword] = useState("");
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);
  const [revokeError, setRevokeError] = useState("");

  // Deactivate Customer Modal State
  const [showDeactivateCustomerModal, setShowDeactivateCustomerModal] = useState(false);
  const [deactivateCustomerReason, setDeactivateCustomerReason] = useState("");
  const [cascadeOutlets, setCascadeOutlets] = useState(true);
  const [submittingCustomerStatus, setSubmittingCustomerStatus] = useState(false);
  const [customerStatusError, setCustomerStatusError] = useState("");

  // Deactivate Outlet Modal State
  const [selectedOutletForStatus, setSelectedOutletForStatus] = useState<Outlet | null>(null);
  const [showDeactivateOutletModal, setShowDeactivateOutletModal] = useState(false);
  const [deactivateOutletReason, setDeactivateOutletReason] = useState("");
  const [submittingOutletStatus, setSubmittingOutletStatus] = useState(false);
  const [outletStatusError, setOutletStatusError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    const [res, allOutletsRes, unmappedRes, penaltyRes] = await Promise.all([
      fetch(`/api/identities/${encodeURIComponent(id)}`),
      fetch("/api/outlets"),
      fetch("/api/aliases?belum=1"),
      fetch(`/api/penalties/${encodeURIComponent(id)}`),
    ]);

    if (!res.ok) { setLoading(false); return; }
    const json = await res.json();
    setIdentity(json.identity);
    setOutlets(json.outlets || []);
    setStatements(json.statements || []);

    const allO = await allOutletsRes.json();
    setAllOutletsList(allO.outlets || []);

    const uRes = await unmappedRes.json();
    setUnmappedAliasesList(uRes.rows || []);

    if (penaltyRes.ok) {
      const pJson = await penaltyRes.json();
      setPenaltyInfo(pJson.data || null);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Open Edit Identity Modal
  const openEditModal = () => {
    if (!identity) return;
    setEditId(identity.id);
    setEditNama(identity.nama_pemilik);
    setEditAlamat(identity.alamat || "");
    setEditKecamatan(identity.kecamatan || "");
    setEditKota(identity.kota || "WATAMPONE");
    setEditKodePos(identity.kode_pos || "");
    setEditProvinsi(identity.provinsi || "SULAWESI SELATAN");
    setEditStatus(identity.status || "aktif");
    setEditError("");
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNama.trim()) { setEditError("Nama pemilik wajib diisi"); return; }
    if (!editId.trim()) { setEditError("Nomor ID One Identity tidak boleh kosong"); return; }

    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/identities/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_id: editId.trim(),
          nama_pemilik: editNama.trim(),
          alamat: editAlamat.trim(),
          kecamatan: editKecamatan.trim(),
          kota: editKota.trim(),
          kode_pos: editKodePos.trim(),
          provinsi: editProvinsi.trim(),
          status: editStatus,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memperbarui data");
      setShowEditModal(false);
      if (json.id && json.id !== id) {
        router.replace(`/identities/${encodeURIComponent(json.id)}`);
      } else {
        await loadData();
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setSaving(false);
    }
  };

  // Open Apply Penalty Modal
  const openApplyPenaltyModal = () => {
    setPenaltyType("temporary");
    setPenaltyDari("2026-09-01");
    setPenaltySampai("2026-09-30");
    setResetSaldoLama(false);
    setConfirmResetAcknowledged(false);
    setPenaltyAlasan("");
    setPenaltyPetugas("");
    setPenaltyPassword("");
    setPenaltyError("");
    setShowApplyPenaltyModal(true);
  };

  const handleApplyPenalty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!penaltyAlasan.trim()) { setPenaltyError("Alasan penjatuhan sanksi wajib diisi"); return; }
    if (!penaltyPetugas.trim()) { setPenaltyError("Nama petugas yang memproses wajib diisi"); return; }
    if (!penaltyPassword.trim()) { setPenaltyError("Password persetujuan Owner wajib diisi"); return; }
    if (resetSaldoLama && !confirmResetAcknowledged) {
      setPenaltyError("Pilihan Opsi B (Reset Saldo Lama) mewajibkan konfirmasi pemahaman dicentang.");
      return;
    }

    setPenaltySubmitting(true);
    setPenaltyError("");
    try {
      const res = await fetch("/api/penalties/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity_id: id,
          jenis_sanksi: penaltyType,
          dari: penaltyDari,
          sampai: penaltyType === "temporary" ? penaltySampai : undefined,
          reset_saldo_lama: resetSaldoLama,
          alasan: penaltyAlasan.trim(),
          petugas: penaltyPetugas.trim(),
          password: penaltyPassword.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memberlakukan sanksi");

      setShowApplyPenaltyModal(false);
      alert(`Berhasil! Sanksi member diberlakukan.\n• Faktur terdampak: ${json.data.invoices_affected}\n• Kupon fisik di-void: ${json.data.voided_coupons_count}\n• Poin lama dihanguskan: ${json.data.wiped_points}`);
      await loadData();
    } catch (err) {
      setPenaltyError(err instanceof Error ? err.message : "Terjadi kesalahan saat memproses sanksi");
    } finally {
      setPenaltySubmitting(false);
    }
  };

  // Open Revoke Penalty Modal
  const openRevokePenaltyModal = () => {
    setRevokeAlasan("");
    setRevokePetugas("");
    setRevokePassword("");
    setRevokeError("");
    setShowRevokePenaltyModal(true);
  };

  const handleRevokePenalty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeAlasan.trim()) { setRevokeError("Alasan pencabutan sanksi wajib diisi"); return; }
    if (!revokePetugas.trim()) { setRevokeError("Nama petugas yang memproses wajib diisi"); return; }
    if (!revokePassword.trim()) { setRevokeError("Password persetujuan Owner wajib diisi"); return; }

    setRevokeSubmitting(true);
    setRevokeError("");
    try {
      const res = await fetch("/api/penalties/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity_id: id,
          alasan: revokeAlasan.trim(),
          petugas: revokePetugas.trim(),
          password: revokePassword.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mencabut sanksi");

      setShowRevokePenaltyModal(false);
      alert("Berhasil! Status member telah dipulihkan.\n\nCatatan: Sesuai aturan bisnis, transaksi selama masa sanksi tetap bernilai 0 (hangus permanen).");
      await loadData();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Terjadi kesalahan saat mencabut sanksi");
    } finally {
      setRevokeSubmitting(false);
    }
  };

  // Deactivate Customer Handlers
  const handleDeactivateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deactivateCustomerReason.trim()) {
      setCustomerStatusError("Alasan penonaktifan akun wajib diisi");
      return;
    }

    setSubmittingCustomerStatus(true);
    setCustomerStatusError("");
    try {
      const res = await fetch(`/api/identities/${encodeURIComponent(id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deactivate",
          alasan: deactivateCustomerReason.trim(),
          cascadeOutlets,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menonaktifkan akun");

      setShowDeactivateCustomerModal(false);
      await loadData();
    } catch (err) {
      setCustomerStatusError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setSubmittingCustomerStatus(false);
    }
  };

  const handleActivateCustomer = async () => {
    if (!confirm(`Aktifkan kembali akun customer "${identity?.nama_pemilik}" (${id})?`)) return;

    try {
      const res = await fetch(`/api/identities/${encodeURIComponent(id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", cascadeOutlets: true }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengaktifkan akun");

      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  // Deactivate Outlet Handlers
  const handleDeactivateOutlet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutletForStatus) return;
    if (!deactivateOutletReason.trim()) {
      setOutletStatusError("Alasan penonaktifan outlet wajib diisi");
      return;
    }

    setSubmittingOutletStatus(true);
    setOutletStatusError("");
    try {
      const res = await fetch(`/api/outlets/${encodeURIComponent(selectedOutletForStatus.id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deactivate",
          alasan: deactivateOutletReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menonaktifkan outlet");

      setShowDeactivateOutletModal(false);
      setSelectedOutletForStatus(null);
      await loadData();
    } catch (err) {
      setOutletStatusError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setSubmittingOutletStatus(false);
    }
  };

  const handleActivateOutlet = async (o: Outlet) => {
    if (!confirm(`Aktifkan kembali outlet "${o.nama_outlet}" (${o.id})?`)) return;

    try {
      const res = await fetch(`/api/outlets/${encodeURIComponent(o.id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengaktifkan outlet");

      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  // Open Outlet Modal: Add Mode
  const openAddOutletModal = async () => {
    setOutletModalMode("add");
    setOutletTargetId("");
    setOutletTipe("ukm");
    setOutletNama("");
    setOutletPosLama("");
    setOutletError("");
    setOutletCustomId(`${id}-01-100`);
    setShowOutletModal(true);

    try {
      const res = await fetch(`/api/outlets/next-id?identity_id=${encodeURIComponent(id)}&tipe=ukm`);
      const json = await res.json();
      if (json.nextId) setOutletCustomId(json.nextId);
    } catch {
      setOutletCustomId(`${id}-01-100`);
    }
  };

  // Handle Outlet Type Change in Add Modal
  const handleOutletTipeChange = async (newTipe: "ukm" | "grosir" | "retail") => {
    setOutletTipe(newTipe);
    if (outletModalMode === "add") {
      if (newTipe === "retail") setOutletCustomId(id);
      else if (newTipe === "grosir") setOutletCustomId(`${id}-01-900`);
      else setOutletCustomId(`${id}-01-100`);

      try {
        const res = await fetch(`/api/outlets/next-id?identity_id=${encodeURIComponent(id)}&tipe=${newTipe}`);
        const json = await res.json();
        if (json.nextId) setOutletCustomId(json.nextId);
      } catch {
        // Fallback sudah di-set di atas
      }
    }
  };

  // Open Outlet Modal: Edit Mode
  const openEditOutletModal = (o: Outlet) => {
    setOutletModalMode("edit");
    setOutletTargetId(o.id);
    setOutletTipe(o.tipe as "ukm" | "grosir" | "retail");
    setOutletNama(o.nama_outlet);
    setOutletCustomId(o.id);
    setOutletPosLama(o.id_pos_lama || "");
    setOutletError("");
    setShowOutletModal(true);
  };

  // Save Outlet (Create or Update)
  const handleSaveOutlet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outletNama.trim()) { setOutletError("Nama outlet wajib diisi"); return; }

    setOutletSaving(true);
    setOutletError("");

    try {
      if (outletModalMode === "add") {
        const res = await fetch("/api/outlets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: outletCustomId.trim(),
            identity_id: id,
            tipe: outletTipe,
            nama_outlet: outletNama.trim(),
            id_pos_lama: outletPosLama.trim() || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal membuat outlet");
      } else {
        const res = await fetch(`/api/outlets/${encodeURIComponent(outletTargetId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nama_outlet: outletNama.trim(),
            tipe: outletTipe,
            id_pos_lama: outletPosLama.trim() || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal memperbarui outlet");
      }

      setShowOutletModal(false);
      await loadData();
    } catch (err) {
      setOutletError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setOutletSaving(false);
    }
  };

  // Delete Outlet
  const handleDeleteOutlet = async (o: Outlet) => {
    if (!confirm(`Hapus outlet "${o.nama_outlet}" [${o.tipe.toUpperCase()}]?\n\nSeluruh alias dan transaksi yang terhubung ke outlet ini akan dikembalikan ke status antrean belum terpetakan. Transaksi tidak akan hilang.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/outlets/${encodeURIComponent(o.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menghapus outlet");
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menghapus outlet");
    }
  };

  // Open Transfer Alias Modal
  const openTransferAliasModal = (aliasName: string, currentOId: string) => {
    setTransferringAliasName(aliasName);
    setTransferCurrentOutletId(currentOId);
    setTransferTargetOutletId("");
    setTransferError("");
    setShowTransferAliasModal(true);
  };

  const handleExecuteTransferAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTargetOutletId) {
      setTransferError("Pilih outlet tujuan terlebih dahulu");
      return;
    }

    setTransferring(true);
    setTransferError("");

    try {
      const res = await fetch("/api/aliases/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama_pos: transferringAliasName,
          target_outlet_id: transferTargetOutletId,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memindahkan alias");

      setShowTransferAliasModal(false);
      await loadData();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setTransferring(false);
    }
  };

  // Detach Alias
  const handleDetachAlias = async (aliasName: string) => {
    if (!confirm(`Lepaskan alias "${aliasName}" dari outlet ini?\n\nTransaksi kasir dengan nama ini akan dikembalikan ke antrean Belum Dipetakan.`)) {
      return;
    }

    try {
      const res = await fetch("/api/aliases", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: aliasName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal melepaskan alias");
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal melepaskan alias");
    }
  };

  // Open Quick Map Alias Modal
  const openQuickMapModal = (o: Outlet) => {
    setQuickMapOutletId(o.id);
    setQuickMapOutletName(`${o.nama_outlet} [${o.tipe.toUpperCase()}]`);
    setQuickMapSelectedAlias("");
    setQuickMapError("");
    setShowQuickMapModal(true);
  };

  const handleExecuteQuickMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickMapSelectedAlias) {
      setQuickMapError("Pilih nama POS yang akan dipetakan");
      return;
    }

    setQuickMapping(true);
    setQuickMapError("");

    try {
      const res = await fetch("/api/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama_pos: quickMapSelectedAlias,
          outlet_id: quickMapOutletId,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memetakan nama POS");

      setShowQuickMapModal(false);
      await loadData();
    } catch (err) {
      setQuickMapError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setQuickMapping(false);
    }
  };

  // Open Merge Modal
  const openMergeModal = async () => {
    setShowMergeModal(true);
    setSelectedTargetId("");
    setMergePreview(null);
    setOwnerPassword("");
    setMergeError("");

    try {
      const res = await fetch("/api/identities?limit=100");
      const json = await res.json();
      const filtered = (json.identities || []).filter((m: { id: string }) => m.id !== id);
      setOtherMembers(filtered);
    } catch {
      setMergeError("Gagal memuat daftar member tujuan");
    }
  };

  const handleSelectTarget = async (targetId: string) => {
    setSelectedTargetId(targetId);
    setMergePreview(null);
    setMergeError("");
    if (!targetId) return;

    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/identities/merge?source_id=${encodeURIComponent(id)}&target_id=${encodeURIComponent(targetId)}`);
      const json = await res.json();
      if (res.ok) {
        setMergePreview(json);
      } else {
        setMergeError(json.error || "Gagal memverifikasi kelayakan merge");
      }
    } catch {
      setMergeError("Gagal menghubungi server untuk verifikasi");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExecuteMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId) { setMergeError("Pilih akun utama tujuan terlebih dahulu"); return; }
    if (!ownerPassword) { setMergeError("Password Owner wajib diisi untuk persetujuan"); return; }

    setMerging(true);
    setMergeError("");
    try {
      const res = await fetch("/api/identities/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id: id,
          target_id: selectedTargetId,
          owner_password: ownerPassword,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menggabungkan akun");

      setShowMergeModal(false);
      alert(`Berhasil! ${json.message}`);
      router.replace(`/identities/${encodeURIComponent(selectedTargetId)}`);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Terjadi kesalahan saat merge");
    } finally {
      setMerging(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!confirm(`Yakin ingin menghapus member "${identity?.nama_pemilik}" (${identity?.id})?\n\nSemua outlet akan dihapus dan transaksi yang terhubung akan dikembalikan ke status belum terpetakan. Transaksi tidak akan hilang.`)) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/identities/${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menghapus member");
      router.push("/identities");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menghapus member");
      setDeleting(false);
    }
  };

  if (loading) return <div style={{ padding: 60, textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }} /></div>;
  if (!identity) return <div style={{ padding: 40 }}><div className="alert alert-danger">Identity tidak ditemukan.</div></div>;

  return (
    <div className="fade-in" style={{ padding: "28px 32px", maxWidth: 1040 }}>
      {/* Top Navigation & Actions */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Link href="/identities" className="btn btn-outline btn-sm">
            <ArrowLeft size={14} /> Kembali ke Daftar Member
          </Link>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {identity.is_suspended === 1 || penaltyInfo?.is_suspended ? (
              <button
                onClick={openRevokePenaltyModal}
                className="btn btn-sm"
                style={{
                  background: "#16A34A",
                  color: "#fff",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                }}
              >
                <ShieldCheck size={14} /> Cabut Sanksi
              </button>
            ) : (
              <button
                onClick={openApplyPenaltyModal}
                className="btn btn-sm"
                style={{
                  background: "#FEF2F2",
                  color: "#DC2626",
                  border: "1px solid #FCA5A5",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                }}
              >
                <AlertTriangle size={14} /> Beri Sanksi Pelanggaran
              </button>
            )}

            {identity.status === "aktif" ? (
              <button
                onClick={() => {
                  setDeactivateCustomerReason("Toko / bisnis customer telah ditutup oleh pemilik");
                  setCascadeOutlets(true);
                  setCustomerStatusError("");
                  setShowDeactivateCustomerModal(true);
                }}
                className="btn btn-sm"
                style={{
                  background: "#FFF1F2",
                  color: "#E11D48",
                  border: "1px solid #FECDD3",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                }}
              >
                <PowerOff size={14} /> Nonaktifkan Akun
              </button>
            ) : identity.status === "nonaktif" ? (
              <button
                onClick={handleActivateCustomer}
                className="btn btn-sm"
                style={{
                  background: "#F0FDF4",
                  color: "#16A34A",
                  border: "1px solid #BBF7D0",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                }}
              >
                <Power size={14} /> Aktifkan Kembali Akun
              </button>
            ) : null}

            <button
              onClick={openMergeModal}
              className="btn btn-outline btn-sm"
              style={{ display: "flex", alignItems: "center", gap: 6, borderColor: "var(--navy-400)", color: "var(--navy-700)" }}
            >
              <GitMerge size={14} /> Merge Akun
            </button>

            <button onClick={openEditModal} className="btn btn-outline btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Edit3 size={14} /> Edit Profil &amp; Nomor ID
            </button>

            <button
              onClick={handleDeleteMember}
              disabled={deleting}
              className="btn btn-sm"
              style={{
                background: "var(--danger-100)",
                color: "var(--danger-600)",
                border: "1px solid var(--danger-100)",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <Trash2 size={14} /> {deleting ? "Menghapus..." : "Hapus Member"}
            </button>
          </div>
        </div>

        {/* Warning Alert Banner (Jika Member Disanksi) */}
        {(identity.is_suspended === 1 || penaltyInfo?.is_suspended) && (
          <div
            style={{
              background: "linear-gradient(135deg, #FEF2F2 0%, #FFF1F2 100%)",
              border: "2px solid #F87171",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 20,
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              boxShadow: "0 4px 14px rgba(220, 38, 38, 0.08)",
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "#FEE2E2",
                color: "#DC2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              <AlertTriangle size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <h4 style={{ margin: 0, color: "#991B1B", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
                  MEMBER DALAM STATUS SANKSI PENANGGUHAN
                  <span style={{ fontSize: 10, background: "#DC2626", color: "#fff", padding: "2px 8px", borderRadius: 99, textTransform: "uppercase" }}>
                    {identity.suspend_type === "permanent" ? "Permanen" : "Periode Tertentu"}
                  </span>
                </h4>
                <button
                  onClick={openRevokePenaltyModal}
                  className="btn btn-sm"
                  style={{
                    background: "#16A34A",
                    color: "#fff",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 700,
                    fontSize: 12,
                    padding: "6px 14px",
                    borderRadius: 6,
                  }}
                >
                  <ShieldCheck size={14} /> Cabut Sanksi / Pulihkan
                </button>
              </div>
              <p style={{ margin: "6px 0 0", color: "#7F1D1D", fontSize: 13, lineHeight: 1.5 }}>
                <strong>Alasan Sanksi:</strong> {identity.suspend_reason || "Pelanggaran SOP / Ketentuan Bisnis"}
                <br />
                <span style={{ fontSize: 12, color: "#B91C1C" }}>
                  Masa Berlaku: <strong>{identity.suspend_dari || "—"}</strong> s/d <strong>{identity.suspend_sampai || "Tanpa Batas (Permanen)"}</strong> &bull; Diproses oleh: {identity.suspended_by || "Petugas"}
                </span>
              </p>
              <div style={{ marginTop: 10, fontSize: 12, color: "#991B1B", background: "rgba(239, 68, 68, 0.08)", padding: "8px 12px", borderRadius: 6 }}>
                💡 <em>Dampak Sistem: Penyerahan kupon fisik diblokir, transaksi faktur bernilai 0 poin, kupon aktif sebelumnya telah di-void secara otomatis, dan lembar statement menampilkan catatan khusus.</em>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 className="page-title" style={{ fontSize: 24 }}>{identity.nama_pemilik}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "monospace", fontSize: 13, background: "var(--navy-50)", color: "var(--navy-700)", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                {identity.id}
              </span>
              <span className={`badge badge-${identity.status === "aktif" ? "final" : identity.status === "merged" ? "draft" : "ditolak"}`}>
                {identity.status === "merged" ? "Sudah Di-Merge" : identity.status === "aktif" ? "Aktif" : "Nonaktif"}
              </span>
              {identity.status === "nonaktif" && (
                <span className="badge" style={{ background: "#FEE2E2", color: "#991B1B", border: "1px solid #FCA5A5", fontSize: 11 }}>
                  {identity.nonaktif_tipe === "manual" ? "Nonaktif Manual" : "Nonaktif Otomatis"}
                  {identity.nonaktif_alasan ? `: ${identity.nonaktif_alasan}` : ""}
                  {identity.nonaktif_tanggal ? ` (${identity.nonaktif_tanggal.slice(0, 10)})` : ""}
                </span>
              )}
              {(identity.is_suspended === 1 || penaltyInfo?.is_suspended) && (
                <span className="badge" style={{ background: "#DC2626", color: "#fff", fontWeight: 700, letterSpacing: "0.03em" }}>
                  DISANKSI / DITANGGUHKAN
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: 20, alignItems: "start" }}>
        {/* Left Column: Info Card & Outlet List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Info Card */}
          <div className="card" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                Informasi Pemilik (KTP)
              </div>
              <button onClick={openEditModal} style={{ background: "none", border: "none", color: "var(--navy-600)", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <Edit3 size={12} /> Edit
              </button>
            </div>
            {[
              ["Nama", identity.nama_pemilik],
              ["Alamat", identity.alamat || "—"],
              ["Kecamatan", identity.kecamatan || "—"],
              ["Kota", identity.kota || "—"],
              ["Kode Pos", identity.kode_pos || "—"],
              ["Provinsi", identity.provinsi || "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 13 }}>
                <span style={{ color: "var(--text-muted)", minWidth: 80 }}>{k}</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 500, wordBreak: "break-word" }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Outlets Card */}
          <div className="card" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                  Lini Bisnis / Outlet ({outlets.length})
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  Retail (100rb) · UKM (50rb) · Grosir (200rb)
                </div>
              </div>
              <button
                onClick={openAddOutletModal}
                className="btn btn-primary btn-sm"
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", fontSize: 11 }}
              >
                <Plus size={13} /> Tambah Outlet
              </button>
            </div>

            {outlets.map(o => (
              <div
                key={o.id}
                style={{
                  marginBottom: 14,
                  padding: "12px",
                  background: o.aktif ? "var(--bg-page)" : "#FFF7ED",
                  borderRadius: 8,
                  border: o.aktif ? "1px solid var(--border)" : "1px solid #FED7AA",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span className={`badge badge-${o.tipe}`}>{o.tipe}</span>
                    <span
                      className="badge"
                      style={{
                        fontSize: 10,
                        background: o.aktif ? "#DCFCE7" : "#FEE2E2",
                        color: o.aktif ? "#166534" : "#991B1B",
                        border: o.aktif ? "1px solid #BBF7D0" : "1px solid #FECDD3",
                      }}
                    >
                      {o.aktif ? "Aktif" : `Nonaktif (${o.nonaktif_tipe || "manual"})`}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Rate: {o.tipe === "grosir" ? "200rb" : o.tipe === "retail" ? "100rb" : "50rb"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {o.aktif ? (
                      <button
                        onClick={() => {
                          setSelectedOutletForStatus(o);
                          setDeactivateOutletReason("Lini bisnis ditutup pemilik");
                          setOutletStatusError("");
                          setShowDeactivateOutletModal(true);
                        }}
                        title="Nonaktifkan Lini Bisnis Ini"
                        style={{
                          background: "#FFF1F2",
                          border: "1px solid #FECDD3",
                          color: "#E11D48",
                          cursor: "pointer",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <PowerOff size={11} /> Nonaktifkan
                      </button>
                    ) : (
                      <button
                        onClick={() => handleActivateOutlet(o)}
                        title="Aktifkan Kembali Lini Bisnis Ini"
                        style={{
                          background: "#F0FDF4",
                          border: "1px solid #BBF7D0",
                          color: "#16A34A",
                          cursor: "pointer",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <Power size={11} /> Aktifkan
                      </button>
                    )}
                    <button
                      onClick={() => openEditOutletModal(o)}
                      title="Edit Outlet"
                      style={{ background: "none", border: "none", color: "var(--navy-600)", cursor: "pointer", padding: 2 }}
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={() => handleDeleteOutlet(o)}
                      title="Hapus Outlet"
                      style={{ background: "none", border: "none", color: "var(--danger-600)", cursor: "pointer", padding: 2 }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginTop: 2 }}>
                  {o.nama_outlet}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--navy-700)" }}>{o.id}</div>
                {o.id_pos_lama && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>POS Lama: {o.id_pos_lama}</div>
                )}
                {!o.aktif && o.nonaktif_alasan && (
                  <div style={{ fontSize: 11, color: "#C2410C", marginTop: 4, background: "rgba(251, 146, 60, 0.1)", padding: "4px 8px", borderRadius: 4 }}>
                    ⚠️ <strong>Nonaktif:</strong> {o.nonaktif_alasan}
                  </div>
                )}

                {/* Aliases Container */}
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px dashed var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Alias Kasir Terhubung:</span>
                    <button
                      onClick={() => openQuickMapModal(o)}
                      style={{ background: "none", border: "none", color: "var(--navy-600)", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
                    >
                      <Plus size={10} /> Tempel Nama POS
                    </button>
                  </div>

                  {o.aliases ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {o.aliases.split(/\s*\|\|\s*|\s*\|\s*/).filter(Boolean).map((a: string) => (
                        <div key={a} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "white", padding: "3px 6px", borderRadius: 4, border: "1px solid var(--border)", fontSize: 11 }}>
                          <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 190 }} title={a}>
                            {a}
                          </span>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              onClick={() => openTransferAliasModal(a, o.id)}
                              title="Pindahkan alias ke outlet lain"
                              style={{ background: "none", border: "none", color: "var(--navy-600)", cursor: "pointer", padding: 2 }}
                            >
                              <ArrowRightLeft size={11} />
                            </button>
                            <button
                              onClick={() => handleDetachAlias(a)}
                              title="Lepaskan alias ke antrean unmapped"
                              style={{ background: "none", border: "none", color: "var(--danger-600)", cursor: "pointer", padding: 2 }}
                            >
                              <Unlink size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginTop: 2 }}>
                      Belum ada alias terhubung.
                    </div>
                  )}
                </div>
              </div>
            ))}

            {outlets.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <Store size={32} style={{ color: "var(--text-muted)", margin: "0 auto 8px" }} />
                <div style={{ color: "var(--text-secondary)", fontSize: 13, fontWeight: 500 }}>Belum ada outlet terdaftar</div>
                <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>Tambahkan unit usaha (UKM, Grosir, Retail) untuk member ini.</div>
                <button onClick={openAddOutletModal} className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>
                  <Plus size={13} /> Tambah Outlet Pertama
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Statement Records & Actions */}
        <div className="card">
          <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              <FileText size={15} style={{ display: "inline", marginRight: 6 }} /> Riwayat Statement Bulanan
            </div>
          </div>

          {statements.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
              <FileText size={36} style={{ color: "var(--border-strong)", margin: "0 auto 10px" }} />
              <div style={{ fontWeight: 500, color: "var(--text-secondary)" }}>Belum ada statement yang terbentuk</div>
              <p style={{ fontSize: 12, marginTop: 4 }}>Petakan transaksi POS ke outlet member ini untuk menghasilkan statement.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Bulan</th>
                    <th>Status</th>
                    <th className="col-num">Transaksi</th>
                    <th className="col-num"><Award size={11} style={{ display:"inline" }} /> Poin</th>
                    <th className="col-num"><Ticket size={11} style={{ display:"inline" }} /> Kupon</th>
                    <th className="col-num">Kum. Poin</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 500 }}>{bulanLabel(s.bulan)}</td>
                      <td>
                        <span className={`badge badge-${s.status}`}>
                          {s.status}{s.revisi > 0 ? ` (Rev.${s.revisi})` : ""}
                        </span>
                      </td>
                      <td className="col-num" style={{ fontSize: 13 }}>{fmtRp(s.total_transaksi)}</td>
                      <td className="col-num" style={{ fontWeight: 600, color: "var(--gold-700)" }}>{fmt(s.total_poin)}</td>
                      <td className="col-num" style={{ fontWeight: 600, color: "var(--success-600)" }}>{fmt(s.total_kupon)}</td>
                      <td className="col-num" style={{ color: "var(--navy-700)", fontWeight: 600 }}>{fmt(s.kumulatif_poin)}</td>
                      <td>
                        <Link href={`/statements/${identity.id}/${s.bulan}`} className="btn btn-outline btn-sm">
                          Cetak <ChevronRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick Links Footer */}
          <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href={`/statements/${identity.id}/2026-09`} className="btn btn-gold btn-sm">
              <FileText size={13} /> Pratinjau Statement Sep 2026
            </Link>
            <Link href={`/coupons?memberId=${identity.id}`} className="btn btn-outline btn-sm">
              <Ticket size={13} /> Serahkan Kupon Undian
            </Link>
            <Link href={`/aliases?identity=${identity.id}`} className="btn btn-outline btn-sm">
              <GitMerge size={13} /> Kelola Alias POS
            </Link>
          </div>
        </div>

        {/* Riwayat Sanksi Pelanggaran Card */}
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={15} style={{ color: "var(--danger-600)" }} />
              <span>Riwayat Sanksi Pelanggaran &amp; Evaluasi Member</span>
            </div>
            {penaltyInfo?.history && penaltyInfo.history.length > 0 && (
              <span className="badge badge-draft" style={{ fontSize: 11 }}>
                {penaltyInfo.history.length} Catatan
              </span>
            )}
          </div>

          {!penaltyInfo?.history || penaltyInfo.history.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)" }}>
              <ShieldCheck size={32} style={{ color: "var(--emerald-600)", margin: "0 auto 8px" }} />
              <div style={{ fontWeight: 600, color: "var(--navy-900)", fontSize: 13 }}>Tidak Ada Riwayat Sanksi</div>
              <p style={{ fontSize: 12, marginTop: 4, color: "var(--text-muted)" }}>
                Member ini memiliki rekam jejak bersih dan tidak pernah dikenakan sanksi penangguhan.
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Periode Sanksi</th>
                    <th>Jenis &amp; Skema</th>
                    <th>Alasan Pelanggaran</th>
                    <th>Dampak Sanksi</th>
                    <th>Status</th>
                    <th>Petugas</th>
                  </tr>
                </thead>
                <tbody>
                  {penaltyInfo.history.map((h) => (
                    <tr key={h.id}>
                      <td style={{ fontWeight: 600 }}>
                        {h.dari} <span style={{ color: "var(--text-muted)" }}>s/d</span> {h.sampai || "Permanen"}
                      </td>
                      <td>
                        <span className={`badge ${h.jenis_sanksi === "permanent" ? "badge-ditolak" : "badge-draft"}`} style={{ fontSize: 10, textTransform: "uppercase" }}>
                          {h.jenis_sanksi === "permanent" ? "Permanen" : "Tertentu"}
                        </span>
                        {h.reset_saldo_lama === 1 && (
                          <span className="badge badge-ditolak" style={{ fontSize: 9, marginLeft: 4 }}>
                            Reset Saldo
                          </span>
                        )}
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        <div style={{ fontWeight: 500, color: "var(--navy-950)" }}>{h.alasan}</div>
                        {h.status === "dicabut" && h.revoked_reason && (
                          <div style={{ fontSize: 11, color: "var(--emerald-700)", marginTop: 2 }}>
                            <em>Dicabut: {h.revoked_reason}</em>
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: 11 }}>
                          {h.voided_coupons_count > 0 && (
                            <div style={{ color: "var(--rose-700)", fontWeight: 600 }}>
                              • {h.voided_coupons_count} Kupon Di-Void
                            </div>
                          )}
                          {h.wiped_points > 0 && (
                            <div style={{ color: "var(--rose-700)", fontWeight: 600 }}>
                              • {fmt(h.wiped_points)} Poin Dihanguskan
                            </div>
                          )}
                          {h.voided_coupons_count === 0 && h.wiped_points === 0 && (
                            <span style={{ color: "var(--text-muted)" }}>Poin Transaksi Baru = 0</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${h.status === "aktif" ? "badge-ditolak" : "badge-final"}`} style={{ fontSize: 11 }}>
                          {h.status === "aktif" ? "AKTIF" : "DICABUT"}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        <div>{h.petugas}</div>
                        {h.status === "dicabut" && h.revoked_by && (
                          <div style={{ fontSize: 10, color: "var(--emerald-700)" }}>
                            Dicabut: {h.revoked_by}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Tambah / Edit Outlet */}
      {showOutletModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--navy-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--navy-700)" }}>
                  <Store size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                    {outletModalMode === "add" ? "Tambah Unit Usaha / Outlet Baru" : "Edit Outlet"}
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                    Untuk {identity.nama_pemilik} ({identity.id})
                  </p>
                </div>
              </div>
              <button onClick={() => setShowOutletModal(false)} className="btn btn-outline btn-sm" style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveOutlet} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {outletError && (
                <div style={{ padding: "10px 14px", background: "var(--danger-100)", color: "var(--danger-600)", borderRadius: "var(--radius-sm)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={16} />
                  <span>{outletError}</span>
                </div>
              )}

              {/* Tipe Outlet */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                  Pilih Lini Bisnis / Tipe Outlet <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { key: "ukm", label: "UKM", rate: "Rp 50.000 / poin", badge: "badge-ukm", desc: "Bakery, Cafe, Resto" },
                    { key: "grosir", label: "Grosir", rate: "Rp 200.000 / poin", badge: "badge-grosir", desc: "Gudang & Grosir" },
                    { key: "retail", label: "Retail", rate: "Rp 100.000 / poin", badge: "badge-retail", desc: "Swalayan Pribadi" },
                  ].map((t) => (
                    <div
                      key={t.key}
                      onClick={() => handleOutletTipeChange(t.key as "ukm" | "grosir" | "retail")}
                      style={{
                        padding: "10px",
                        borderRadius: 8,
                        border: `2px solid ${outletTipe === t.key ? "var(--navy-600)" : "var(--border)"}`,
                        background: outletTipe === t.key ? "var(--navy-50)" : "white",
                        cursor: "pointer",
                        textAlign: "center"
                      }}
                    >
                      <span className={`badge ${t.badge}`}>{t.label}</span>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>{t.rate}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Nama Outlet */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Nama Outlet / Unit Usaha <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <input
                  className="input"
                  value={outletNama}
                  onChange={(e) => setOutletNama(e.target.value)}
                  placeholder={outletTipe === "ukm" ? "Contoh: ANTARA BAKERY" : outletTipe === "grosir" ? "Contoh: ANTARA GROSIR" : "Contoh: ANTARA RETAIL"}
                  required
                />
              </div>

              {/* Nomor ID Outlet */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                    Nomor ID Outlet
                  </label>
                  {outletModalMode === "add" && (
                    <button
                      type="button"
                      onClick={() => handleOutletTipeChange(outletTipe)}
                      className="btn btn-secondary"
                      style={{ padding: "2px 8px", fontSize: 11, height: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}
                      title="Generate ulang ID Outlet"
                    >
                      <RefreshCw size={11} />
                      Auto ID
                    </button>
                  )}
                </div>
                <input
                  className="input"
                  style={{ fontFamily: "monospace", fontWeight: 600 }}
                  value={outletCustomId}
                  onChange={(e) => setOutletCustomId(e.target.value)}
                  disabled={outletModalMode === "edit"}
                  required
                />
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  Sesuai PRD: UKM (-nn-100), Grosir (-01-900), Retail (tanpa suffix).
                </p>
              </div>

              {/* ID POS Lama */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Kode POS Lama (Opsional)
                </label>
                <input
                  className="input"
                  value={outletPosLama}
                  onChange={(e) => setOutletPosLama(e.target.value)}
                  placeholder="Contoh: 131-000461"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setShowOutletModal(false)}
                  className="btn btn-outline"
                  disabled={outletSaving}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={outletSaving}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  {outletSaving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <CheckCircle2 size={16} />}
                  {outletModalMode === "add" ? "Simpan Outlet Baru" : "Perbarui Outlet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Pindahkan Alias POS */}
      {showTransferAliasModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--navy-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--navy-700)" }}>
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Pindahkan Alias POS</h3>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Arahkan transaksi nama kasir ke outlet yang tepat</p>
                </div>
              </div>
              <button onClick={() => setShowTransferAliasModal(false)} className="btn btn-outline btn-sm" style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExecuteTransferAlias} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {transferError && (
                <div style={{ padding: "10px 14px", background: "var(--danger-100)", color: "var(--danger-600)", borderRadius: "var(--radius-sm)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={16} />
                  <span>{transferError}</span>
                </div>
              )}

              <div style={{ background: "var(--bg-page)", padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Nama Kasir POS yang Dipindahkan:</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--navy-900)", marginTop: 4 }}>
                  {transferringAliasName}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Pilih Outlet Tujuan Baru <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <select
                  className="input select"
                  value={transferTargetOutletId}
                  onChange={(e) => setTransferTargetOutletId(e.target.value)}
                  required
                >
                  <option value="">— Pilih Outlet Tujuan —</option>
                  <optgroup label={`Outlet Milik ${identity.nama_pemilik}`}>
                    {outlets.filter(o => o.id !== transferCurrentOutletId).map(o => (
                      <option key={o.id} value={o.id}>
                        {o.nama_outlet} [{o.tipe.toUpperCase()} - Rate {o.tipe === "grosir" ? "200rb" : o.tipe === "retail" ? "100rb" : "50rb"}]
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Outlet Milik Member Lain">
                    {allOutletsList.filter(o => !outlets.some(mO => mO.id === o.id)).map(o => (
                      <option key={o.id} value={o.id}>
                        {o.nama_pemilik} · {o.nama_outlet} [{o.tipe.toUpperCase()}]
                      </option>
                    ))}
                  </optgroup>
                </select>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  Seluruh transaksi masa lalu dan bulan berjalan dari nama kasir ini akan dihitung ulang menggunakan rate outlet tujuan.
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setShowTransferAliasModal(false)}
                  className="btn btn-outline"
                  disabled={transferring}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={transferring || !transferTargetOutletId}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  {transferring ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <ArrowRightLeft size={16} />}
                  Pindahkan &amp; Hitung Ulang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Quick Map Unmapped Alias ke Outlet Ini */}
      {showQuickMapModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--navy-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--navy-700)" }}>
                  <Plus size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Tempelkan Nama Kasir POS</h3>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Ke outlet: {quickMapOutletName}</p>
                </div>
              </div>
              <button onClick={() => setShowQuickMapModal(false)} className="btn btn-outline btn-sm" style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExecuteQuickMap} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {quickMapError && (
                <div style={{ padding: "10px 14px", background: "var(--danger-100)", color: "var(--danger-600)", borderRadius: "var(--radius-sm)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={16} />
                  <span>{quickMapError}</span>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Pilih Nama Kasir yang Belum Terpetakan <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <select
                  className="input select"
                  value={quickMapSelectedAlias}
                  onChange={(e) => setQuickMapSelectedAlias(e.target.value)}
                  required
                >
                  <option value="">— Pilih Nama Customer di POS —</option>
                  {unmappedAliasesList.map((a) => (
                    <option key={a.nama_pos} value={a.nama_pos}>
                      {a.nama_pos} ({a.jumlah_transaksi} invoice)
                    </option>
                  ))}
                </select>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  Nama ini akan dipetakan ke outlet ini dan seluruh transaksinya langsung dihitung ke poin &amp; kupon member.
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setShowQuickMapModal(false)}
                  className="btn btn-outline"
                  disabled={quickMapping}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={quickMapping || !quickMapSelectedAlias}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  {quickMapping ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <CheckCircle2 size={16} />}
                  Petakan ke Outlet Ini
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Profil & Nomor ID Member */}
      {showEditModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--navy-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--navy-700)" }}>
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Edit Profil &amp; Nomor ID Member</h3>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Perubahan nomor ID otomatis memperbarui outlet &amp; transaksi (Cascade)</p>
                </div>
              </div>
              <button onClick={() => setShowEditModal(false)} className="btn btn-outline btn-sm" style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {editError && (
                <div style={{ padding: "10px 14px", background: "var(--danger-100)", color: "var(--danger-600)", borderRadius: "var(--radius-sm)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={16} />
                  <span>{editError}</span>
                </div>
              )}

              <div style={{ background: "var(--warning-100)", padding: "10px 12px", borderRadius: "var(--radius-sm)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AlertTriangle size={15} style={{ color: "var(--warning-600)", marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "var(--warning-600)" }}>
                  Anda bebas mengedit <strong>Nomor ID</strong> kapan saja. Sistem secara otomatis memperbarui seluruh outlet anak, statement, dan riwayat transaksi.
                </span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Nomor ID One Identity (Format: 102-YYMMDD-NN)
                </label>
                <input
                  className="input"
                  style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 14 }}
                  value={editId}
                  onChange={e => setEditId(e.target.value)}
                  placeholder="102-260901-01"
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Nama Pemilik Resmi (KTP) <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <input
                  className="input"
                  value={editNama}
                  onChange={e => setEditNama(e.target.value)}
                  placeholder="Nama Pemilik"
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Status Member
                </label>
                <select
                  className="input select"
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                >
                  <option value="aktif">Aktif (Bisa Cetak &amp; Hitung Statement)</option>
                  <option value="nonaktif">Nonaktif</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Kota
                  </label>
                  <input
                    className="input"
                    value={editKota}
                    onChange={e => setEditKota(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Kecamatan
                  </label>
                  <input
                    className="input"
                    value={editKecamatan}
                    onChange={e => setEditKecamatan(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Alamat Lengkap
                </label>
                <textarea
                  className="input"
                  style={{ height: 60, resize: "none", fontSize: 13 }}
                  value={editAlamat}
                  onChange={e => setEditAlamat(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-outline"
                  disabled={saving}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <CheckCircle2 size={16} />}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Merge / Penggabungan Akun Member */}
      {showMergeModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 620 }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--navy-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--navy-700)" }}>
                  <GitMerge size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Merge Akun Member</h3>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Leburkan akun ganda/mirip ke dalam satu Akun Utama resmi</p>
                </div>
              </div>
              <button onClick={() => setShowMergeModal(false)} className="btn btn-outline btn-sm" style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExecuteMerge} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {mergeError && (
                <div style={{ padding: "10px 14px", background: "var(--danger-100)", color: "var(--danger-600)", borderRadius: "var(--radius-sm)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={16} />
                  <span>{mergeError}</span>
                </div>
              )}

              <div style={{ background: "var(--bg-page)", padding: "14px 16px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Akun Sumber (Akan Dileburkan &amp; Dinonaktifkan)
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{identity.nama_pemilik}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--navy-700)", marginLeft: 8 }}>({identity.id})</span>
                  </div>
                  <span className="badge badge-warning" style={{ fontSize: 11 }}>Akan Disembunyikan</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  Unit Usaha: {outlets.length} outlet terdaftar
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Pilih Akun Utama Tujuan (Penerima) <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <select
                  className="input select"
                  value={selectedTargetId}
                  onChange={(e) => handleSelectTarget(e.target.value)}
                  required
                >
                  <option value="">— Pilih Member Tujuan —</option>
                  {otherMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama_pemilik} ({m.id}) {m.kota ? `· ${m.kota}` : ""}
                    </option>
                  ))}
                </select>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  Semua transaksi, alias POS, dan outlet dari akun sumber akan disatukan ke akun ini.
                </p>
              </div>

              {loadingPreview ? (
                <div style={{ padding: 20, textAlign: "center" }}>
                  <div className="spinner" style={{ margin: "0 auto 8px" }} />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Memeriksa nomor invoice dan bulan transaksi...</span>
                </div>
              ) : mergePreview ? (
                <div style={{ background: mergePreview.canMerge ? "var(--success-100)" : "var(--danger-100)", padding: "14px 16px", borderRadius: 8, border: `1px solid ${mergePreview.canMerge ? "var(--success-600)" : "var(--danger-600)"}` }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: mergePreview.canMerge ? "var(--success-600)" : "var(--danger-600)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    {mergePreview.canMerge ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span>{mergePreview.canMerge ? "Syarat Penggabungan Terpenuhi (Aman Digabung)" : "Syarat Penggabungan Belum Terpenuhi"}</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: mergePreview.collisions.length === 0 ? "var(--text-primary)" : "var(--danger-600)" }}>
                      <span style={{ width: 16, height: 16, borderRadius: "50%", background: mergePreview.collisions.length === 0 ? "var(--success-600)" : "var(--danger-600)", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>
                        {mergePreview.collisions.length === 0 ? "✓" : "✕"}
                      </span>
                      <span>
                        <strong>Syarat 1:</strong> Nomor invoice wajib beda ({mergePreview.collisions.length === 0 ? "Tidak ada tabrakan invoice" : `${mergePreview.collisions.length} invoice bertabrakan`})
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: mergePreview.monthsMatch ? "var(--text-primary)" : "var(--danger-600)" }}>
                      <span style={{ width: 16, height: 16, borderRadius: "50%", background: mergePreview.monthsMatch ? "var(--success-600)" : "var(--danger-600)", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>
                        {mergePreview.monthsMatch ? "✓" : "✕"}
                      </span>
                      <span>
                        <strong>Syarat 2:</strong> Transaksi di bulan yang sama ({mergePreview.monthsMatch ? "Bulan sesuai & terverifikasi" : "Bulan transaksi berbeda"})
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
                      <span style={{ width: 16, height: 16, borderRadius: "50%", background: "var(--success-600)", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>
                        ✓
                      </span>
                      <span>
                        <strong>Syarat 3:</strong> Akun sumber ({identity.id}) otomatis disembunyikan permanen dari daftar member
                      </span>
                    </div>

                    <div style={{ marginTop: 6, paddingTop: 8, borderTop: "1px dashed #A7F3D0", display: "flex", alignItems: "center", gap: 8, color: "#065F46", fontSize: 11 }}>
                      <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#059669", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>
                        ★
                      </span>
                      <span>
                        <strong>Aset &amp; Relasi Dialihkan:</strong> {mergePreview.source.outletsCount} outlet, {mergePreview.source.invoicesCount} invoice POS, <strong>{mergePreview.source.couponsCount ?? 0} kupon fisik</strong> ({mergePreview.source.batchesCount ?? 0} batch), {mergePreview.source.penaltiesCount ?? 0} catatan sanksi.
                      </span>
                    </div>
                  </div>

                  {mergePreview.reasons.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed var(--danger-600)", fontSize: 12, color: "var(--danger-600)" }}>
                      {mergePreview.reasons.map((r, i) => (
                        <div key={i}>• {r}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <div style={{ background: "var(--bg-page)", padding: "14px 16px", borderRadius: 8, border: "1px solid var(--border)" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                  <Lock size={13} style={{ display: "inline", marginRight: 4 }} />
                  Syarat 4: Approval Password Owner Universal <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="Masukkan Password Owner (Default: oriental2026)"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  required
                />
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  Tindakan ini permanen. Memindahkan seluruh relasi transaksi dan melebur akun ke pemilik baru.
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="btn btn-outline"
                  disabled={merging}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={merging || !selectedTargetId || (mergePreview ? !mergePreview.canMerge : true) || !ownerPassword}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  {merging ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <GitMerge size={16} />}
                  Setujui &amp; Gabungkan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: BERI SANKSI PELANGGARAN MEMBER
          ======================================================== */}
      {showApplyPenaltyModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 580 }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", color: "#DC2626" }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#991B1B" }}>
                    Beri Sanksi Pelanggaran Member
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                    {identity.nama_pemilik} ({identity.id})
                  </p>
                </div>
              </div>
              <button onClick={() => setShowApplyPenaltyModal(false)} className="btn-icon">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleApplyPenalty} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {penaltyError && (
                <div className="alert alert-danger" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 13 }}>
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{penaltyError}</span>
                </div>
              )}

              {/* Pemilihan Skema Saldo: Opsi A vs Opsi B */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--navy-950)", marginBottom: 8 }}>
                  1. Perlakuan Saldo Poin &amp; Kupon <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {/* Opsi A */}
                  <div
                    onClick={() => { setResetSaldoLama(false); setConfirmResetAcknowledged(false); }}
                    style={{
                      border: !resetSaldoLama ? "2px solid #2563EB" : "1px solid var(--border)",
                      background: !resetSaldoLama ? "#EFF6FF" : "#fff",
                      borderRadius: 8,
                      padding: 12,
                      cursor: "pointer",
                      transition: "all .15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: !resetSaldoLama ? "#1E40AF" : "var(--navy-900)" }}>
                        Opsi A (Standar)
                      </span>
                      <input type="radio" checked={!resetSaldoLama} onChange={() => setResetSaldoLama(false)} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      <strong>Penangguhan Poin Baru:</strong> Poin masa sanksi = 0, kupon fisik dibatalkan (auto-void), tetapi <em>saldo historis lama tetap utuh</em>.
                    </div>
                  </div>

                  {/* Opsi B */}
                  <div
                    onClick={() => setResetSaldoLama(true)}
                    style={{
                      border: resetSaldoLama ? "2px solid #DC2626" : "1px solid var(--border)",
                      background: resetSaldoLama ? "#FEF2F2" : "#fff",
                      borderRadius: 8,
                      padding: 12,
                      cursor: "pointer",
                      transition: "all .15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: resetSaldoLama ? "#991B1B" : "var(--navy-900)" }}>
                        Opsi B (Sanksi Berat)
                      </span>
                      <input type="radio" checked={resetSaldoLama} onChange={() => setResetSaldoLama(true)} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      <strong>Reset Total Saldo:</strong> Seluruh poin historis lama yang telah terkumpul langsung <em>dihanguskan jadi 0</em>.
                    </div>
                  </div>
                </div>

                {/* Dialog Konfirmasi Ganda untuk Opsi B */}
                {resetSaldoLama && (
                  <div
                    style={{
                      marginTop: 12,
                      background: "#FEF2F2",
                      border: "1px solid #F87171",
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#991B1B", fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
                      <AlertTriangle size={16} /> PERINGATAN KERAS: HANGUS PERMANEN
                    </div>
                    <p style={{ margin: "0 0 10px", fontSize: 11, color: "#7F1D1D", lineHeight: 1.4 }}>
                      Apakah Anda benar-benar yakin? Tindakan penghangusan saldo lama ini <strong>TIDAK DAPAT DIKEMBALIKAN</strong> setelah disimpan.
                    </p>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, color: "#991B1B", cursor: "pointer", fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={confirmResetAcknowledged}
                        onChange={(e) => setConfirmResetAcknowledged(e.target.checked)}
                        style={{ marginTop: 2 }}
                        required
                      />
                      <span>Saya memahami konsekuensi ini dan telah mendapat instruksi langsung dari Owner untuk menghanguskan saldo lama member ini.</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Jenis Sanksi & Rentang Tanggal */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--navy-950)", marginBottom: 6 }}>
                  2. Jenis &amp; Masa Berlaku Sanksi <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="penaltyType"
                      checked={penaltyType === "temporary"}
                      onChange={() => setPenaltyType("temporary")}
                    />
                    <span>Periode Tertentu (Temporary)</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="penaltyType"
                      checked={penaltyType === "permanent"}
                      onChange={() => setPenaltyType("permanent")}
                    />
                    <span>Permanen / Tanpa Batas Selesai</span>
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: penaltyType === "temporary" ? "1fr 1fr" : "1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>
                      Tanggal Mulai Sanksi (YYYY-MM-DD)
                    </label>
                    <input
                      type="date"
                      required
                      className="input"
                      value={penaltyDari}
                      onChange={(e) => setPenaltyDari(e.target.value)}
                    />
                  </div>
                  {penaltyType === "temporary" && (
                    <div>
                      <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>
                        Tanggal Selesai Sanksi (YYYY-MM-DD)
                      </label>
                      <input
                        type="date"
                        required
                        className="input"
                        value={penaltySampai}
                        onChange={(e) => setPenaltySampai(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Alasan Pelanggaran */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--navy-950)", marginBottom: 4 }}>
                  3. Alasan Sanksi Pelanggaran <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  className="input"
                  placeholder="Misal: Keterlambatan pembayaran tagihan POS > 45 hari / Pelanggaran retur barang"
                  value={penaltyAlasan}
                  onChange={(e) => setPenaltyAlasan(e.target.value)}
                  style={{ resize: "vertical", fontSize: 13 }}
                />
              </div>

              {/* Petugas & Password Persetujuan Owner */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--navy-950)", marginBottom: 4 }}>
                    4. Nama Petugas <span style={{ color: "var(--danger-600)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Nama staf pemroses"
                    value={penaltyPetugas}
                    onChange={(e) => setPenaltyPetugas(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--navy-950)", marginBottom: 4 }}>
                    5. Password Owner <span style={{ color: "var(--danger-600)" }}>*</span>
                  </label>
                  <input
                    type="password"
                    required
                    className="input"
                    placeholder="Default: oriental2026"
                    value={penaltyPassword}
                    onChange={(e) => setPenaltyPassword(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setShowApplyPenaltyModal(false)}
                  className="btn btn-outline"
                  disabled={penaltySubmitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={penaltySubmitting || (resetSaldoLama && !confirmResetAcknowledged)}
                  className="btn"
                  style={{
                    background: "#DC2626",
                    color: "#fff",
                    border: "none",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {penaltySubmitting ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <AlertTriangle size={16} />}
                  Terapkan Sanksi Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: PENCABUTAN SANKSI (UN-SUSPEND)
          ======================================================== */}
      {showRevokePenaltyModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--emerald-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "#16A34A" }}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--navy-950)" }}>
                    Pencabutan Sanksi &amp; Pemulihan Member
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
                    {identity.nama_pemilik} ({identity.id})
                  </p>
                </div>
              </div>
              <button onClick={() => setShowRevokePenaltyModal(false)} className="btn-icon">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRevokePenalty} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {revokeError && (
                <div className="alert alert-danger" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 13 }}>
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{revokeError}</span>
                </div>
              )}

              {/* Ketentuan Bisnis Pencabutan Sanksi */}
              <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12, color: "#166534", marginBottom: 4 }}>
                  <Info size={15} /> Aturan Bisnis (Hangus Permanen)
                </div>
                <p style={{ margin: 0, fontSize: 11, color: "#14532D", lineHeight: 1.4 }}>
                  Pencabutan sanksi akan memulihkan hak member untuk mengumpulkan poin dan kupon pada <strong>transaksi belanja baru ke depan</strong>. Seluruh faktur transaksi yang terjadi selama masa sanksi <strong>tetap bernilai 0 (hangus permanen)</strong>.
                </p>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--navy-950)", marginBottom: 4 }}>
                  Alasan Pencabutan Sanksi <span style={{ color: "var(--danger-600)" }}>*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  className="input"
                  placeholder="Misal: Tagihan telah dilunasi penuh / Kewajiban administratif telah diselesaikan"
                  value={revokeAlasan}
                  onChange={(e) => setRevokeAlasan(e.target.value)}
                  style={{ resize: "vertical", fontSize: 13 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--navy-950)", marginBottom: 4 }}>
                    Nama Petugas <span style={{ color: "var(--danger-600)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Nama staf pemroses"
                    value={revokePetugas}
                    onChange={(e) => setRevokePetugas(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--navy-950)", marginBottom: 4 }}>
                    Password Owner <span style={{ color: "var(--danger-600)" }}>*</span>
                  </label>
                  <input
                    type="password"
                    required
                    className="input"
                    placeholder="Default: oriental2026"
                    value={revokePassword}
                    onChange={(e) => setRevokePassword(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setShowRevokePenaltyModal(false)}
                  className="btn btn-outline"
                  disabled={revokeSubmitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={revokeSubmitting}
                  className="btn"
                  style={{
                    background: "#16A34A",
                    color: "#fff",
                    border: "none",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {revokeSubmitting ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <ShieldCheck size={16} />}
                  Cabut Sanksi &amp; Pulihkan Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Deaktivasi Akun Customer */}
      {showDeactivateCustomerModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8, color: "#BE123C" }}>
                <PowerOff size={18} /> Nonaktifkan Akun Customer
              </h3>
              <button onClick={() => setShowDeactivateCustomerModal(false)} className="btn btn-ghost btn-sm">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleDeactivateCustomer}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {customerStatusError && (
                  <div className="alert alert-danger" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <AlertTriangle size={16} />
                    <span>{customerStatusError}</span>
                  </div>
                )}

                <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#9F1239" }}>{identity.nama_pemilik}</div>
                  <div style={{ fontSize: 11, color: "#BE123C", fontFamily: "monospace", marginTop: 2 }}>
                    ID: {identity.id} &bull; Total Lini Bisnis: {outlets.length} outlet
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  💡 <em>Poin dan kupon undian yang telah terkumpul tetap aman tersimpan selama periode program. Akun ini tidak akan muncul pada pilihan transaksi baru kecuali diaktifkan kembali.</em>
                </div>

                <div>
                  <label className="label" style={{ fontSize: 12, fontWeight: 600 }}>Alasan Penonaktifan *</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                    {[
                      "Toko / bisnis customer telah ditutup oleh pemilik",
                      "Permintaan langsung dari customer / owner",
                      "Vakum transaksi operasional",
                    ].map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setDeactivateCustomerReason(p)}
                        className="btn btn-ghost btn-sm"
                        style={{
                          textAlign: "left",
                          justifyContent: "flex-start",
                          fontSize: 11,
                          padding: "6px 10px",
                          border: deactivateCustomerReason === p ? "1px solid #F43F5E" : "1px solid var(--border)",
                          background: deactivateCustomerReason === p ? "#FFF1F2" : "white",
                          color: deactivateCustomerReason === p ? "#BE123C" : "var(--text-primary)",
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Tulis alasan spesifik jika diperlukan..."
                    value={deactivateCustomerReason}
                    onChange={(e) => setDeactivateCustomerReason(e.target.value)}
                    required
                    style={{ fontSize: 12, width: "100%", resize: "vertical" }}
                  />
                </div>

                <div style={{ background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={cascadeOutlets}
                      onChange={(e) => setCascadeOutlets(e.target.checked)}
                    />
                    <span>Nonaktifkan juga seluruh outlet / lini bisnis di bawah akun ini ({outlets.length} outlet)</span>
                  </label>
                </div>
              </div>

              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowDeactivateCustomerModal(false)}
                  disabled={submittingCustomerStatus}
                  className="btn btn-outline btn-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingCustomerStatus || !deactivateCustomerReason.trim()}
                  className="btn btn-sm"
                  style={{
                    background: "#E11D48",
                    color: "white",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 600,
                  }}
                >
                  <PowerOff size={13} />
                  {submittingCustomerStatus ? "Memproses..." : "Konfirmasi Nonaktifkan Akun"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Deaktivasi Outlet */}
      {showDeactivateOutletModal && selectedOutletForStatus && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8, color: "#BE123C" }}>
                <PowerOff size={18} /> Nonaktifkan Lini Bisnis
              </h3>
              <button onClick={() => setShowDeactivateOutletModal(false)} className="btn btn-ghost btn-sm">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleDeactivateOutlet}>
              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {outletStatusError && (
                  <div className="alert alert-danger" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <AlertTriangle size={16} />
                    <span>{outletStatusError}</span>
                  </div>
                )}

                <div style={{ background: "#FFF1F2", border: "1px solid #FECDD3", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#9F1239" }}>{selectedOutletForStatus.nama_outlet}</div>
                  <div style={{ fontSize: 11, color: "#BE123C", fontFamily: "monospace", marginTop: 2 }}>
                    ID: {selectedOutletForStatus.id} &bull; Tipe: {selectedOutletForStatus.tipe.toUpperCase()}
                  </div>
                </div>

                <div>
                  <label className="label" style={{ fontSize: 12, fontWeight: 600 }}>Alasan Penonaktifan *</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                    {[
                      "Lini bisnis ditutup pemilik",
                      "Vakum transaksi / berhenti beroperasi sementara",
                      "Permintaan dari pemilik",
                    ].map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setDeactivateOutletReason(p)}
                        className="btn btn-ghost btn-sm"
                        style={{
                          textAlign: "left",
                          justifyContent: "flex-start",
                          fontSize: 11,
                          padding: "6px 10px",
                          border: deactivateOutletReason === p ? "1px solid #F43F5E" : "1px solid var(--border)",
                          background: deactivateOutletReason === p ? "#FFF1F2" : "white",
                          color: deactivateOutletReason === p ? "#BE123C" : "var(--text-primary)",
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Tulis alasan spesifik jika diperlukan..."
                    value={deactivateOutletReason}
                    onChange={(e) => setDeactivateOutletReason(e.target.value)}
                    required
                    style={{ fontSize: 12, width: "100%", resize: "vertical" }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowDeactivateOutletModal(false)}
                  disabled={submittingOutletStatus}
                  className="btn btn-outline btn-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingOutletStatus || !deactivateOutletReason.trim()}
                  className="btn btn-sm"
                  style={{
                    background: "#E11D48",
                    color: "white",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 600,
                  }}
                >
                  <PowerOff size={13} />
                  {submittingOutletStatus ? "Memproses..." : "Konfirmasi Nonaktifkan Lini Bisnis"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
