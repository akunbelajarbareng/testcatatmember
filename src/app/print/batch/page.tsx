"use client";
import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer, AlertTriangle, RefreshCw, FileText, CheckCircle2 } from "lucide-react";
import StatementDocument from "@/components/StatementDocument";
import type { StatementData } from "@/lib/calc";

interface BatchItem {
  identity: {
    id: string;
    nama_pemilik: string;
    kota: string;
  };
  statement: {
    status: string;
    revisi: number;
  };
  data: StatementData;
}

function BatchPrintContent() {
  const searchParams = useSearchParams();
  const bulan = searchParams.get("bulan") || "2026-09";

  const [items, setItems] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSelection, setPageSelection] = useState<"all" | "page1" | "page2">("all");

  const loadBatch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/statements/batch?bulan=${bulan}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Gagal memuat batch statement");
      } else {
        setItems(json.statements || []);
      }
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatch();
  }, [bulan]);

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `Batch-Statement-${bulan}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  if (loading) {
    return (
      <div className="p-16 text-center">
        <div className="spinner mx-auto mb-4" />
        <h2 className="text-base font-bold text-slate-800">Menyiapkan Seluruh Statement...</h2>
        <p className="text-xs text-slate-500 mt-1">Mengalkulasi transaksi periode {bulan} untuk semua member.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 print:min-h-0 print:bg-white print:p-0 print:m-0">
      {/* Fixed top control bar (hidden in print) */}
      <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-3 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/statements" className="btn btn-outline btn-sm">
              <ArrowLeft size={14} /> Kembali
            </Link>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-none">
                Batch Cetak Statement: Periode {bulan}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Total <strong>{items.length}</strong> statement siap cetak
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Page selection buttons */}
            <div className="inline-flex rounded-md shadow-xs bg-slate-100 p-0.5 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setPageSelection("all")}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  pageSelection === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Hal 1 &amp; 2
              </button>
              <button
                type="button"
                onClick={() => setPageSelection("page1")}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  pageSelection === "page1" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Halaman 1 Saja
              </button>
              <button
                type="button"
                onClick={() => setPageSelection("page2")}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  pageSelection === "page2" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Halaman 2 Saja
              </button>
            </div>

            {/* Print all button */}
            <button
              onClick={handlePrint}
              disabled={items.length === 0}
              className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-xs"
            >
              <Printer size={15} /> Cetak Semua ({items.length})
            </button>

            <button onClick={loadBatch} className="btn btn-outline btn-sm p-2" title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-6 print:max-w-none print:m-0 print:p-0 print:w-full">
        {error && (
          <div className="no-print alert alert-danger mb-4">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {items.length === 0 ? (
          <div className="no-print bg-white p-12 text-center rounded-lg border border-slate-200 text-slate-500">
            <FileText size={36} className="mx-auto mb-2 text-slate-400" />
            <p className="font-semibold text-slate-700">Belum ada statement untuk periode {bulan}</p>
            <p className="text-xs text-slate-400 mt-1">Pastikan sudah import master customer dan transaksi bulan ini.</p>
          </div>
        ) : (
          <div className="space-y-8 print:space-y-0 print:m-0 print:p-0">
            {items.map((item, idx) => (
              <div key={item.identity.id} className="relative print-customer-group">
                {/* Member header bar for screen preview only */}
                <div className="no-print flex items-center justify-between bg-slate-800 text-white text-xs px-4 py-2 rounded-t font-medium">
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                      #{idx + 1}
                    </span>
                    <span className="font-bold">{item.identity.nama_pemilik}</span>
                    <span className="text-slate-400 font-mono">({item.identity.id})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">
                      Transaksi: Rp {item.data.bulan_transaksi.toLocaleString("id-ID")}
                    </span>
                    <Link
                      href={`/statements/${item.identity.id}/${bulan}`}
                      className="text-amber-400 hover:underline"
                    >
                      Buka Single &rarr;
                    </Link>
                  </div>
                </div>

                {/* The statement printable sheet */}
                <StatementDocument
                  data={item.data}
                  status={item.statement?.status}
                  revisi={item.statement?.revisi}
                  showPage1={pageSelection === "all" || pageSelection === "page1"}
                  showPage2={pageSelection === "all" || pageSelection === "page2"}
                />

                {/* Print separator between customers */}
                {idx < items.length - 1 && (
                  <div className="no-print my-6 border-t-2 border-slate-300" />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function BatchPrintPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center"><div className="spinner mx-auto" /></div>}>
      <BatchPrintContent />
    </Suspense>
  );
}
