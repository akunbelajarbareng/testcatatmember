"use client";
import React from "react";
import Image from "next/image";
import type { StatementData, OutletSummary, MonthlyHistory } from "@/lib/calc";

interface Props {
  data: StatementData;
  status?: string;
  revisi?: number;
  showPage1?: boolean;
  showPage2?: boolean;
}

function fmt(n: number): string {
  return (n || 0).toLocaleString("id-ID");
}

function fmtRp(n: number): string {
  return `Rp ${(n || 0).toLocaleString("id-ID")}`;
}

function fmtTgl(d?: string | null): string {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length < 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function StatementDocument({
  data,
  status = "draft",
  revisi = 0,
  showPage1 = true,
  showPage2 = true,
}: Props) {
  const {
    identity_id,
    nama_pemilik,
    alamat,
    kecamatan,
    kota,
    kode_pos,
    provinsi,
    bulan,
    bulan_label,
    bulan_transaksi,
    bulan_poin,
    bulan_kupon,
    kumulatif_poin,
    kumulatif_kupon,
    transaksi_terakhir,
    outlets,
    histori,
  } = data;

  const totalHistoriTransaksi = histori.reduce((acc: number, h: MonthlyHistory) => acc + h.total_transaksi, 0);
  const totalHistoriPoin = histori.reduce((acc: number, h: MonthlyHistory) => acc + h.poin, 0);
  const totalHistoriKupon = histori.reduce((acc: number, h: MonthlyHistory) => acc + h.kupon, 0);

  return (
    <div className="statement-document-wrapper text-slate-800">
      {/* ========================================================
          HALAMAN 1 — UNTUK CUSTOMER
          ======================================================== */}
      {showPage1 && (
        <div
          className={`print-page page-1 relative flex flex-col justify-between ${
            !showPage2 ? "only-page" : ""
          }`}
        >
          <div>
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 shrink-0">
                  <Image
                    src="/oriental_logo.png"
                    alt="Oriental Logo"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight text-slate-950 uppercase leading-none">
                    Oriental Customer Statement
                  </h1>
                  <p className="text-[11px] text-slate-600 font-semibold tracking-wider uppercase mt-1">
                    Pencatatan Point &amp; Kupon Undian Member
                  </p>
                </div>
              </div>

              {/* Periode Box */}
              <div className="text-right">
                <div className="inline-block bg-slate-900 text-white px-3 py-1 text-[11px] font-bold tracking-widest uppercase rounded">
                  Periode
                </div>
                <div className="text-base font-black text-slate-900 tracking-tight mt-0.5">
                  {bulan_label}
                </div>
                {status !== "draft" ? (
                  <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                    FINAL {revisi > 0 ? `(Rev ${revisi})` : ""}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded">
                    DRAFT
                  </span>
                )}
                {data.is_suspended && (
                  <span className="text-[9.5px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded ml-1.5 uppercase">
                    Status Evaluasi Khusus
                  </span>
                )}
              </div>
            </div>

            {/* Top Grid: Info Member & 4 KPI Boxes */}
            <div className="grid grid-cols-12 gap-4 mb-4 text-[12px]">
              {/* Info Member (Left) */}
              <div className="col-span-5 bg-slate-50 border border-slate-200 rounded p-3 leading-relaxed">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Kepada Yth,
                </div>
                <div className="text-sm font-black text-slate-950 uppercase mb-1">
                  {nama_pemilik || "—"}
                </div>
                <div className="text-slate-700 font-medium">
                  {alamat || "—"}
                </div>
                {kecamatan && (
                  <div className="text-slate-700">
                    Kec. {kecamatan}
                  </div>
                )}
                <div className="text-slate-700 font-medium">
                  {[kota, kode_pos].filter(Boolean).join(" ")}
                </div>
                {provinsi && (
                  <div className="text-slate-700">
                    {provinsi}
                  </div>
                )}
                <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">Oriental One Identity:</span>
                  <span className="font-mono font-bold text-slate-900">{identity_id}</span>
                </div>
              </div>

              {/* 4 KPI Summary Cards (Right) */}
              <div className="col-span-7 grid grid-cols-2 gap-2">
                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Total Point Bulan Berjalan
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-black text-slate-950">{fmt(bulan_poin)}</span>
                    <span className="text-[11px] font-semibold text-slate-600">Oriental Point</span>
                  </div>
                </div>

                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Total Point Yang Dimiliki
                    </span>
                    {transaksi_terakhir && (
                      <span className="text-[9px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-semibold border border-blue-200">
                        s.d. {fmtTgl(transaksi_terakhir)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-black text-blue-900">{fmt(kumulatif_poin)}</span>
                    <span className="text-[11px] font-semibold text-slate-600">Oriental Point</span>
                  </div>
                </div>

                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Total Kupon Bulan Berjalan
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-black text-slate-950">{fmt(bulan_kupon)}</span>
                    <span className="text-[11px] font-semibold text-slate-600">lembar Kupon</span>
                  </div>
                </div>

                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Total Kupon Yang Dimiliki
                    </span>
                    {transaksi_terakhir && (
                      <span className="text-[9px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded font-semibold border border-amber-200">
                        s.d. {fmtTgl(transaksi_terakhir)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-black text-amber-900">{fmt(kumulatif_kupon)}</span>
                    <span className="text-[11px] font-semibold text-slate-600">lembar Kupon</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Table Rekapan Bulanan */}
            <div className="mb-4">
              <div className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-t">
                Rekapan Bulanan {bulan_label}
              </div>
              <table className="w-full text-[11px] border border-slate-300 border-t-0 border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 text-left font-bold">
                    <th className="py-2 px-2.5 w-10 text-center border-r border-slate-300">NO</th>
                    <th className="py-2 px-3 w-44 border-r border-slate-300">ID OUTLET</th>
                    <th className="py-2 px-3 border-r border-slate-300">NAMA OUTLET</th>
                    <th className="py-2 px-3 text-right w-36 border-r border-slate-300">TOTAL TRANSAKSI</th>
                    <th className="py-2 px-3 text-center w-24 border-r border-slate-300">POINT</th>
                    <th className="py-2 px-3 text-center w-24">KUPON</th>
                  </tr>
                </thead>
                <tbody>
                  {outlets.map((outlet: OutletSummary, idx: number) => (
                    <tr key={outlet.outlet_id} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="py-2 px-2.5 text-center font-mono border-r border-slate-200">{idx + 1}</td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-800 border-r border-slate-200">
                        {outlet.outlet_id}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-900 border-r border-slate-200 uppercase">
                        {outlet.nama_outlet}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-900 border-r border-slate-200">
                        {fmtRp(outlet.total_transaksi)}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-semibold text-blue-900 border-r border-slate-200">
                        {fmt(outlet.poin)} Point
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-semibold text-amber-900">
                        {fmt(outlet.kupon)} Lembar
                      </td>
                    </tr>
                  ))}
                  {outlets.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-400 italic">
                        Tidak ada transaksi outlet pada periode ini.
                      </td>
                    </tr>
                  )}
                  {/* Total Row */}
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-slate-950">
                    <td colSpan={3} className="py-2.5 px-3 text-right uppercase tracking-wider border-r border-slate-300">
                      Total
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-950 border-r border-slate-300">
                      {fmtRp(bulan_transaksi)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-blue-950 border-r border-slate-300">
                      {fmt(bulan_poin)} Point
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-950">
                      {fmt(bulan_kupon)} Lembar
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signature Block (Halaman 1) */}
            <div className="flex justify-end mt-8 pr-6">
              <div className="w-56 text-center text-[12px]">
                <p className="font-semibold text-slate-700 mb-14">Diterima oleh,</p>
                <div className="border-b border-slate-800 w-full mb-1"></div>
                <p className="font-bold uppercase text-slate-900">{nama_pemilik || "Customer"}</p>
              </div>
            </div>
          </div>

          {/* Footer (Halaman 1) */}
          <div className="pt-3 border-t border-slate-200 text-[10px] text-slate-600 flex justify-between items-center font-medium">
            <div>
              <p>*Perhitungan telah dievaluasi by Sistem</p>
              {data.suspend_note && (
                <p className="font-bold text-amber-800 italic mt-0.5">{data.suspend_note}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Page break divider for screen and print */}
      {showPage1 && showPage2 && (
        <div className="print-page-break my-6 no-print border-t-2 border-dashed border-slate-300 text-center text-[11px] text-slate-600 py-1">
          ┈┈┈┈┈┈ BATAS HALAMAN 1 (A4) &amp; HALAMAN 2 (A4) ┈┈┈┈┈┈
        </div>
      )}

      {/* ========================================================
          HALAMAN 2 — UNTUK PENCATATAN INTERNAL
          ======================================================== */}
      {showPage2 && (
        <div
          className="print-page page-2 relative flex flex-col justify-between"
        >
          <div>
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 shrink-0">
                  <Image
                    src="/oriental_logo.png"
                    alt="Oriental Logo"
                    fill
                    className="object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight text-slate-950 uppercase leading-none">
                    Oriental Customer Statement
                  </h1>
                  <p className="text-[11px] text-slate-600 font-semibold tracking-wider uppercase mt-1">
                    Arsip &amp; Riwayat Transaksi 13 Bulan (Internal)
                  </p>
                </div>
              </div>

              {/* Periode Box */}
              <div className="text-right">
                <div className="inline-block bg-slate-900 text-white px-3 py-1 text-[11px] font-bold tracking-widest uppercase rounded">
                  Periode
                </div>
                <div className="text-base font-black text-slate-900 tracking-tight mt-0.5">
                  {bulan_label}
                </div>
                {data.is_suspended && (
                  <div className="mt-1">
                    <span className="text-[9.5px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded uppercase">
                      Status Evaluasi Khusus
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Top Grid: Info Member & 4 KPI Boxes */}
            <div className="grid grid-cols-12 gap-4 mb-4 text-[12px]">
              <div className="col-span-5 bg-slate-50 border border-slate-200 rounded p-3 leading-relaxed">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Kepada Yth,
                </div>
                <div className="text-sm font-black text-slate-950 uppercase mb-1">
                  {nama_pemilik || "—"}
                </div>
                <div className="text-slate-700 font-medium">
                  {alamat || "—"}
                </div>
                <div className="text-slate-700">
                  {[kecamatan, kota, kode_pos].filter(Boolean).join(", ")}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">Oriental One Identity:</span>
                  <span className="font-mono font-bold text-slate-900">{identity_id}</span>
                </div>
              </div>

              <div className="col-span-7 grid grid-cols-2 gap-2">
                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Total Point Bulan Berjalan
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-black text-slate-950">{fmt(bulan_poin)}</span>
                    <span className="text-[11px] font-semibold text-slate-600">Oriental Point</span>
                  </div>
                </div>

                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Total Point Yang Dimiliki
                    </span>
                    {transaksi_terakhir && (
                      <span className="text-[9px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-semibold border border-blue-200">
                        s.d. {fmtTgl(transaksi_terakhir)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-black text-blue-900">{fmt(kumulatif_poin)}</span>
                    <span className="text-[11px] font-semibold text-slate-600">Oriental Point</span>
                  </div>
                </div>

                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Total Kupon Bulan Berjalan
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-black text-slate-950">{fmt(bulan_kupon)}</span>
                    <span className="text-[11px] font-semibold text-slate-600">lembar Kupon</span>
                  </div>
                </div>

                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Total Kupon Yang Dimiliki
                    </span>
                    {transaksi_terakhir && (
                      <span className="text-[9px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded font-semibold border border-amber-200">
                        s.d. {fmtTgl(transaksi_terakhir)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-black text-amber-900">{fmt(kumulatif_kupon)}</span>
                    <span className="text-[11px] font-semibold text-slate-600">lembar Kupon</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Table 1: Transaksi Perolehan Point Periode 2026-2027 (13 Bulan) */}
            <div className="mb-4">
              <div className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-t">
                Transaksi Perolehan Point Periode 2026-2027
              </div>
              <table className="w-full text-[10.5px] border border-slate-300 border-t-0 border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                    <th className="py-1 px-2 w-8 text-center border-r border-slate-300">No</th>
                    <th className="py-1 px-2.5 border-r border-slate-300 text-left">Bulan</th>
                    <th className="py-1 px-2.5 text-right w-36 border-r border-slate-300">Total Transaksi</th>
                    <th className="py-1 px-2.5 text-center w-24 border-r border-slate-300">Point</th>
                    <th className="py-1 px-2.5 text-center w-24 border-r border-slate-300">Bonus Point</th>
                    <th className="py-1 px-2.5 text-center w-24">Voucher</th>
                  </tr>
                </thead>
                <tbody>
                  {histori.map((h: MonthlyHistory, i: number) => {
                    const isCurrent = h.bulan === bulan;
                    return (
                      <tr
                        key={h.bulan}
                        className={`border-b border-slate-200 ${isCurrent ? "bg-amber-50/70 font-semibold" : "hover:bg-slate-50"}`}
                      >
                        <td className="py-1 px-2 text-center font-mono border-r border-slate-200">{i + 1}</td>
                        <td className="py-1 px-2.5 font-medium uppercase border-r border-slate-200">
                          {h.label} {isCurrent && <span className="text-[9px] bg-amber-200 text-amber-900 px-1 rounded ml-1">Bulan Ini</span>}
                        </td>
                        <td className="py-1 px-2.5 text-right font-mono border-r border-slate-200">
                          {h.total_transaksi > 0 ? fmtRp(h.total_transaksi) : "Rp.  - "}
                        </td>
                        <td className="py-1 px-2.5 text-center font-mono border-r border-slate-200">
                          {h.poin > 0 ? `${fmt(h.poin)} Point` : "Point  - "}
                        </td>
                        <td className="py-1 px-2.5 text-center font-mono text-slate-600 border-r border-slate-200">
                          Point  - 
                        </td>
                        <td className="py-1 px-2.5 text-center font-mono">
                          {h.kupon > 0 ? `${fmt(h.kupon)} Lembar` : "Lembar  - "}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total Row */}
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-slate-950">
                    <td colSpan={2} className="py-1.5 px-3 text-right uppercase tracking-wider border-r border-slate-300">
                      Total
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono border-r border-slate-300">
                      {fmtRp(totalHistoriTransaksi)}
                    </td>
                    <td className="py-1.5 px-2.5 text-center font-mono border-r border-slate-300">
                      {fmt(totalHistoriPoin)} Point
                    </td>
                    <td className="py-1.5 px-2.5 text-center font-mono text-slate-600 border-r border-slate-300">
                      Point  - 
                    </td>
                    <td className="py-1.5 px-2.5 text-center font-mono">
                      {fmt(totalHistoriKupon)} Lembar
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Table 2: Rekapan Bulanan (Summary Outlet) */}
            <div className="mb-4">
              <div className="bg-slate-800 text-white text-[10.5px] font-black uppercase tracking-wider px-3 py-1 rounded-t">
                Rekapan Bulanan {bulan_label}
              </div>
              <table className="w-full text-[10.5px] border border-slate-300 border-t-0 border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                    <th className="py-1 px-2 w-8 text-center border-r border-slate-300">No</th>
                    <th className="py-1 px-2.5 w-36 border-r border-slate-300 text-left">ID Outlet</th>
                    <th className="py-1 px-2.5 border-r border-slate-300 text-left">Nama Outlet</th>
                    <th className="py-1 px-2.5 text-right w-36 border-r border-slate-300">Total Transaksi</th>
                    <th className="py-1 px-2.5 text-center w-24 border-r border-slate-300">Point</th>
                    <th className="py-1 px-2.5 text-center w-24">Voucher</th>
                  </tr>
                </thead>
                <tbody>
                  {outlets.map((outlet: OutletSummary, idx: number) => (
                    <tr key={outlet.outlet_id} className="border-b border-slate-200">
                      <td className="py-1 px-2 text-center font-mono border-r border-slate-200">{idx + 1}</td>
                      <td className="py-1 px-2.5 font-mono border-r border-slate-200">{outlet.outlet_id}</td>
                      <td className="py-1 px-2.5 font-medium border-r border-slate-200 uppercase">{outlet.nama_outlet}</td>
                      <td className="py-1 px-2.5 text-right font-mono border-r border-slate-200">{fmtRp(outlet.total_transaksi)}</td>
                      <td className="py-1 px-2.5 text-center font-mono border-r border-slate-200">{fmt(outlet.poin)} Point</td>
                      <td className="py-1 px-2.5 text-center font-mono">{fmt(outlet.kupon)} Lembar</td>
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr className="bg-slate-100 font-bold border-t border-slate-300 text-slate-950">
                    <td colSpan={3} className="py-1.5 px-3 text-right uppercase border-r border-slate-300">Total</td>
                    <td className="py-1.5 px-2.5 text-right font-mono border-r border-slate-300">{fmtRp(bulan_transaksi)}</td>
                    <td className="py-1.5 px-2.5 text-center font-mono border-r border-slate-300">{fmt(bulan_poin)} Point</td>
                    <td className="py-1.5 px-2.5 text-center font-mono">{fmt(bulan_kupon)} Lembar</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signature Block (Halaman 2: Disetujui oleh Management + Diterima oleh Customer) */}
            <div className="flex justify-between mt-6 px-10">
              <div className="w-56 text-center text-[12px]">
                <p className="font-semibold text-slate-700 mb-14">Disetujui oleh,</p>
                <div className="border-b border-slate-800 w-full mb-1"></div>
                <p className="font-bold uppercase text-slate-900">Management</p>
              </div>

              <div className="w-56 text-center text-[12px]">
                <p className="font-semibold text-slate-700 mb-14">Diterima oleh,</p>
                <div className="border-b border-slate-800 w-full mb-1"></div>
                <p className="font-bold uppercase text-slate-900">{nama_pemilik || "Customer"}</p>
              </div>
            </div>
          </div>

          {/* Footer (Halaman 2) */}
          <div className="pt-3 border-t border-slate-200 text-[10px] text-slate-600 flex justify-between items-center font-medium">
            <div>
              <p className="font-semibold text-slate-700">*Halaman 2 : untuk Pencatatan Internal</p>
              <p>*Perhitungan telah dievaluasi by Sistem</p>
              {data.suspend_note && (
                <p className="font-bold text-amber-800 italic mt-0.5">{data.suspend_note}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
