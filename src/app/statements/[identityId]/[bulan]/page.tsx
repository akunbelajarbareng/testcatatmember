"use client";
import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, CheckCircle, AlertTriangle, RefreshCw, FileText, Layers, Ticket } from "lucide-react";
import StatementDocument from "@/components/StatementDocument";
import type { StatementData } from "@/lib/calc";

interface StatementResponse {
  statement?: {
    status: string;
    revisi: number;
  };
  data?: StatementData;
  peringatan_belum_petakan?: number;
  error?: string;
}

export default function SingleStatementPage({
  params,
}: {
  params: Promise<{ identityId: string; bulan: string }>;
}) {
  const { identityId, bulan } = use(params);

  const [resData, setResData] = useState<StatementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [pageView, setPageView] = useState<"all" | "page1" | "page2">("all");
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/statements/${identityId}/${bulan}`);
      const json = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: json.error || "Gagal memuat statement" });
      } else {
        setResData(json);
      }
    } catch (e) {
      setMsg({ type: "error", text: "Terjadi kesalahan jaringan" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [identityId, bulan]);

  const handleFinalize = async () => {
    if (!confirm("Kunci statement ini menjadi FINAL? Perubahan angka selanjutnya akan membutuhkan revisi berantai.")) {
      return;
    }
    setFinalizing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/statements/${identityId}/${bulan}/finalize`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok) {
        setMsg({ type: "success", text: "Statement berhasil dikunci sebagai FINAL!" });
        loadData();
      } else {
        setMsg({ type: "error", text: json.error || "Gagal mengunci statement" });
      }
    } catch {
      setMsg({ type: "error", text: "Gagal mengunci statement" });
    } finally {
      setFinalizing(false);
    }
  };

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `Statement-${data?.identity_id || "ID"}-${data?.bulan || ""}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="spinner mx-auto mb-3" />
        <p className="text-sm text-slate-500 font-medium">Memuat statement data...</p>
      </div>
    );
  }

  if (!resData || !resData.data) {
    return (
      <div className="p-10 max-w-2xl mx-auto">
        <div className="alert alert-danger mb-4">
          <AlertTriangle size={18} />
          <span>{msg?.text || resData?.error || "Statement tidak dapat dimuat."}</span>
        </div>
        <Link href="/statements" className="btn btn-outline">
          <ArrowLeft size={14} /> Kembali ke Daftar Statement
        </Link>
      </div>
    );
  }

  const { data, statement, peringatan_belum_petakan } = resData;
  const isFinal = statement?.status === "final";

  return (
    <div className="min-h-screen bg-slate-100/70 pb-16 print:min-h-0 print:bg-white print:p-0 print:m-0">
      {/* Top Action Bar (hidden when printing) */}
      <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-3 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/statements" className="btn btn-outline btn-sm">
              <ArrowLeft size={14} /> Kembali
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 leading-none">
                  {data.nama_pemilik}
                </h1>
                <span className="text-xs font-mono text-slate-500">({data.identity_id})</span>
                {isFinal ? (
                  <span className="badge badge-final text-[11px]">
                    FINAL {statement?.revisi ? `Rev ${statement.revisi}` : ""}
                  </span>
                ) : (
                  <span className="badge badge-draft text-[11px]">DRAFT</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Periode: <strong className="text-slate-700">{data.bulan_label}</strong>
              </p>
            </div>
          </div>

          {/* View Toggles & Actions */}
          <div className="flex items-center gap-2.5">
            {/* Page selection buttons */}
            <div className="inline-flex rounded-md shadow-xs bg-slate-100 p-0.5 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setPageView("all")}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  pageView === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Halaman 1 &amp; 2
              </button>
              <button
                type="button"
                onClick={() => setPageView("page1")}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  pageView === "page1" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Hal 1 (Customer)
              </button>
              <button
                type="button"
                onClick={() => setPageView("page2")}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  pageView === "page2" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Hal 2 (Internal)
              </button>
            </div>

            {/* Serahkan Kupon button */}
            <Link
              href={`/coupons?memberId=${encodeURIComponent(identityId)}&periode=${encodeURIComponent(bulan)}`}
              className="btn btn-outline btn-sm flex items-center gap-1.5 text-amber-800 border-amber-300 hover:bg-amber-50"
              title="Serahkan Kupon Fisik untuk Member Ini"
            >
              <Ticket size={15} className="text-amber-600" /> Serahkan Kupon
            </Link>

            {/* Print button */}
            <button
              onClick={handlePrint}
              className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-xs"
            >
              <Printer size={15} /> Cetak / PDF
            </button>

            {/* Finalize button */}
            {!isFinal && (
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="btn btn-gold btn-sm flex items-center gap-1.5"
              >
                <CheckCircle size={15} /> {finalizing ? "Mengunci..." : "Kunci Final"}
              </button>
            )}

            <button onClick={loadData} className="btn btn-outline btn-sm p-2" title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-4 pt-6 print:max-w-none print:m-0 print:p-0 print:w-full">
        {/* Alerts and messages (no-print) */}
        {msg && (
          <div className={`no-print alert alert-${msg.type} mb-4`}>
            {msg.type === "error" ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
            <span>{msg.text}</span>
          </div>
        )}

        {peringatan_belum_petakan && peringatan_belum_petakan > 0 ? (
          <div className="no-print alert alert-warn mb-4">
            <AlertTriangle size={18} />
            <div className="flex-1">
              <strong>Peringatan Pemetaan:</strong> Ada {peringatan_belum_petakan} nama POS pada periode ini yang belum dipetakan ke outlet. Transaksi nama tersebut belum terhitung ke statement.
              <Link href="/aliases" className="ml-2 font-bold underline hover:text-amber-950">
                Petakan sekarang &rarr;
              </Link>
            </div>
          </div>
        ) : null}

        {/* The Printable Document */}
        <div className="py-2 print:p-0 print:m-0">
          <StatementDocument
            data={data}
            status={statement?.status}
            revisi={statement?.revisi}
            showPage1={pageView === "all" || pageView === "page1"}
            showPage2={pageView === "all" || pageView === "page2"}
          />
        </div>
      </main>
    </div>
  );
}
