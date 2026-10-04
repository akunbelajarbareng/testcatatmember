"use client";

import React from "react";
import Image from "next/image";
import type { StatementData, OutletSummary, MonthlyHistory } from "@/lib/calc";

interface Props {
  data: StatementData;
  status?: string; // "draft" | "final"
  revisi?: number;
  showPage1?: boolean;
  showPage2?: boolean;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

function fmtRp(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtTgl(d: string | null | undefined): string {
  if (!d) return "";
  const [yyyy, mm, dd] = d.split("-");
  return `${dd}/${mm}/${yyyy}`;
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
    is_suspended,
    has_devaluasi,
    devaluasi_bulan_poin,
    devaluasi_bulan_kupon,
    sebelumnya_kumulatif_poin,
    sebelumnya_kumulatif_kupon,
    total_devaluasi_kumulatif_poin,
    total_devaluasi_kumulatif_kupon,
  } = data;

  const isDevaluedAccount = Boolean(
    has_devaluasi ||
    is_suspended ||
    (devaluasi_bulan_poin && devaluasi_bulan_poin > 0) ||
    (devaluasi_bulan_kupon && devaluasi_bulan_kupon > 0) ||
    (total_devaluasi_kumulatif_poin && total_devaluasi_kumulatif_poin > 0)
  );

  const hasMonthPointDevaluasi = Boolean(
    (devaluasi_bulan_poin && devaluasi_bulan_poin > 0) ||
    (is_suspended && bulan_transaksi > 0)
  );

  const hasMonthKuponDevaluasi = Boolean(
    (devaluasi_bulan_kupon && devaluasi_bulan_kupon > 0) ||
    (is_suspended && bulan_transaksi > 0)
  );

  const hasCumPointDevaluasi = Boolean(
    (total_devaluasi_kumulatif_poin && total_devaluasi_kumulatif_poin > 0) ||
    (sebelumnya_kumulatif_poin && sebelumnya_kumulatif_poin > kumulatif_poin) ||
    is_suspended
  );

  const hasCumKuponDevaluasi = Boolean(
    (total_devaluasi_kumulatif_kupon && total_devaluasi_kumulatif_kupon > 0) ||
    (sebelumnya_kumulatif_kupon && sebelumnya_kumulatif_kupon > kumulatif_kupon) ||
    is_suspended
  );

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
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  {status !== "draft" ? (
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                      FINAL {revisi > 0 ? `(Rev ${revisi})` : ""}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded">
                      DRAFT
                    </span>
                  )}
                  {isDevaluedAccount ? (
                    <span className="inline-block bg-amber-400 text-slate-950 border border-amber-600 px-2 py-0.5 text-[9px] font-black tracking-wider uppercase rounded shadow-xs">
                      STATUS : SUSPEND/DEVALUASI AKUN
                    </span>
                  ) : data.is_suspended ? (
                    <span className="text-[9.5px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded uppercase">
                      Status Evaluasi Khusus
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Top Grid: Info Member & 4 KPI Boxes */}
            <div className="grid grid-cols-12 gap-4 mb-3 text-[12px]">
              {/* Info Member (Left) */}
              <div className="col-span-5 bg-slate-50 border border-slate-200 rounded p-3 leading-relaxed">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  CUSTOMER PROFILE
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
                {/* Card 1: Point Bulan Berjalan */}
                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Total Point Bulan Berjalan
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl font-black text-slate-950">{fmt(bulan_poin)}</span>
                      <span className="text-[11px] font-semibold text-slate-600">Oriental Point</span>
                    </div>
                    {hasMonthPointDevaluasi && (
                      <div className="text-[9.5px] font-bold text-red-600 mt-0.5 leading-none">
                        (DEVALUASI POINT: -{fmt(devaluasi_bulan_poin || 0)} POINT)
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 2: Point Kumulatif Yang Dimiliki */}
                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Total Point Yang Dimiliki
                      </span>
                      {hasCumPointDevaluasi && (
                        <span className="text-[8px] font-extrabold text-white bg-red-600 px-1 py-0.2 rounded tracking-wider uppercase">
                          DEVALUASI
                        </span>
                      )}
                    </div>
                    {transaksi_terakhir && (
                      <span className="text-[9px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-semibold border border-blue-200">
                        s.d. {fmtTgl(transaksi_terakhir)}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl font-black text-blue-900">{fmt(kumulatif_poin)}</span>
                      <span className="text-[11px] font-semibold text-slate-600">Oriental Point</span>
                    </div>
                    {hasCumPointDevaluasi && Boolean(sebelumnya_kumulatif_poin && sebelumnya_kumulatif_poin > kumulatif_poin) && (
                      <div className="text-[9.5px] font-bold text-slate-500 mt-0.5 leading-none">
                        (SEBELUMNYA {fmt(sebelumnya_kumulatif_poin!)} POINT)
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 3: Kupon Bulan Berjalan */}
                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Total Kupon Bulan Berjalan
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl font-black text-slate-950">{fmt(bulan_kupon)}</span>
                      <span className="text-[11px] font-semibold text-slate-600">lembar Kupon</span>
                    </div>
                    {hasMonthKuponDevaluasi && (
                      <div className="text-[9.5px] font-bold text-red-600 mt-0.5 leading-none">
                        (DEVALUASI KUPON: -{fmt(devaluasi_bulan_kupon || 0)} KUPON)
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 4: Kupon Kumulatif Yang Dimiliki */}
                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Total Kupon Yang Dimiliki
                      </span>
                      {hasCumKuponDevaluasi && (
                        <span className="text-[8px] font-extrabold text-white bg-red-600 px-1 py-0.2 rounded tracking-wider uppercase">
                          DEVALUASI
                        </span>
                      )}
                    </div>
                    {transaksi_terakhir && (
                      <span className="text-[9px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded font-semibold border border-amber-200">
                        s.d. {fmtTgl(transaksi_terakhir)}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl font-black text-amber-900">{fmt(kumulatif_kupon)}</span>
                      <span className="text-[11px] font-semibold text-slate-600">lembar Kupon</span>
                    </div>
                    {hasCumKuponDevaluasi && Boolean(sebelumnya_kumulatif_kupon && sebelumnya_kumulatif_kupon > kumulatif_kupon) && (
                      <div className="text-[9.5px] font-bold text-slate-500 mt-0.5 leading-none">
                        (SEBELUMNYA {fmt(sebelumnya_kumulatif_kupon!)} KUPON)
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Warning Callout Box (Jika Ada Status Devaluasi / Sanksi) */}
            {isDevaluedAccount && (
              <div className="border border-red-300 bg-red-50/90 rounded p-2 mb-3 leading-tight">
                <div className="flex items-center gap-1.5 text-red-700 font-extrabold text-[10.5px] uppercase tracking-wide">
                  <span>⚠️ PEMBERITAHUAN STATUS DEVALUASI / SANKSI PENANGGUHAN AKUN</span>
                </div>
                <p className="text-[10px] text-red-800 font-medium mt-0.5 leading-snug">
                  Berdasarkan hasil evaluasi sistem dan kepatuhan member, akun Anda saat ini berstatus{" "}
                  <strong>
                    {data.suspend_type === "permanent" ? "DEVALUASI PERMANEN" : "DEVALUASI SEMENTARA"}
                  </strong>
                  {data.suspend_dari ? (
                    <span> (Periode: {data.suspend_dari} s/d {data.suspend_sampai || "Tanpa Batas"})</span>
                  ) : null}
                  . Pemberian Poin &amp; Kupon atas transaksi belanja dinonaktifkan/disesuaikan sementara sesuai ketentuan program Oriental One Identity.
                </p>
              </div>
            )}

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
                  {outlets.map((outlet: OutletSummary, idx: number) => {
                    const isDevaluedRow = isDevaluedAccount && (outlet.is_devalued || is_suspended || (outlet.total_transaksi > 0 && outlet.poin === 0));
                    return (
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
                        <td className="py-2 px-3 text-center font-mono border-r border-slate-200">
                          {isDevaluedRow && outlet.poin === 0 && outlet.total_transaksi > 0 ? (
                            <span className="text-red-600 font-bold">{fmt(outlet.poin)} POINT</span>
                          ) : (
                            <span className="text-blue-900 font-semibold">{fmt(outlet.poin)} Point</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-mono">
                          {isDevaluedRow && outlet.kupon === 0 && outlet.total_transaksi > 0 ? (
                            <span className="text-red-600 font-bold">{fmt(outlet.kupon)} KUPON</span>
                          ) : (
                            <span className="text-amber-900 font-semibold">{fmt(outlet.kupon)} Lembar</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
                    <td className="py-2.5 px-3 text-center font-mono font-bold border-r border-slate-300">
                      {isDevaluedAccount && bulan_poin === 0 && bulan_transaksi > 0 ? (
                        <span className="text-red-600 font-black">{fmt(bulan_poin)} POINT</span>
                      ) : (
                        <span className="text-blue-950 font-bold">{fmt(bulan_poin)} Point</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold">
                      {isDevaluedAccount && bulan_kupon === 0 && bulan_transaksi > 0 ? (
                        <span className="text-red-600 font-black">{fmt(bulan_kupon)} KUPON</span>
                      ) : (
                        <span className="text-amber-950 font-bold">{fmt(bulan_kupon)} Lembar</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signature Block (Halaman 1) */}
            <div className="flex justify-end mt-6 pr-6">
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
              {isDevaluedAccount ? (
                <p className="font-bold text-red-600 mt-0.5">
                  *Keterangan: Akun ini dalam status pembatasan hak perolehan poin dan kupon sesuai kebijakan sanksi &amp; evaluasi Oriental One Identity.
                </p>
              ) : data.suspend_note ? (
                <p className="font-bold text-amber-800 italic mt-0.5">{data.suspend_note}</p>
              ) : null}
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
                    priority
                  />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-slate-950 uppercase leading-none">
                    Oriental Customer Statement
                  </h2>
                  <p className="text-[10.5px] text-slate-600 font-semibold tracking-wider uppercase mt-1">
                    Arsip &amp; Riwayat Transaksi 13 Bulan (Internal Audit)
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
                {isDevaluedAccount ? (
                  <div className="mt-1">
                    <span className="inline-block bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[8.5px] font-black tracking-wider uppercase rounded shadow-xs">
                      STATUS EVALUASI KHUSUS
                    </span>
                  </div>
                ) : data.is_suspended ? (
                  <div className="mt-1">
                    <span className="text-[9.5px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded uppercase">
                      Status Evaluasi Khusus
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Top Grid: Info Member & 4 KPI Boxes */}
            <div className="grid grid-cols-12 gap-4 mb-3 text-[12px]">
              <div className="col-span-5 bg-slate-50 border border-slate-200 rounded p-3 leading-relaxed">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  KEPADA YTH,
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

              <div className="col-span-7 grid grid-cols-2 gap-2">
                {/* Card 1: Point Bulan Berjalan */}
                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Total Point Bulan Berjalan
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={`text-xl font-black ${hasMonthPointDevaluasi ? "text-red-600" : "text-slate-950"}`}>
                        {fmt(bulan_poin)}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600">Oriental Point</span>
                    </div>
                    {hasMonthPointDevaluasi && (
                      <div className="text-[9.5px] font-bold text-red-600 mt-0.5 leading-none">
                        (Potensi: {fmt(bulan_poin + (devaluasi_bulan_poin || 0))} − Penalti: {fmt(devaluasi_bulan_poin || 0)})
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 2: Point Kumulatif Yang Dimiliki */}
                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Total Point Yang Dimiliki
                      </span>
                      {hasCumPointDevaluasi && (
                        <span className="text-[7.5px] font-extrabold text-red-700 bg-red-100 border border-red-200 px-1 py-0.2 rounded tracking-wider uppercase">
                          DIBEKUKAN
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl font-black text-blue-900">{fmt(kumulatif_poin)}</span>
                      <span className="text-[11px] font-semibold text-slate-600">Oriental Point</span>
                    </div>
                    <div className="text-[8.5px] text-slate-400 mt-0.5 leading-none">
                      Saldo aktif terverifikasi {transaksi_terakhir ? `(s.d. ${fmtTgl(transaksi_terakhir)})` : ""}
                    </div>
                  </div>
                </div>

                {/* Card 3: Kupon Bulan Berjalan */}
                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Total Kupon Bulan Berjalan
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={`text-xl font-black ${hasMonthKuponDevaluasi ? "text-red-600" : "text-slate-950"}`}>
                        {fmt(bulan_kupon)}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600">lembar Kupon</span>
                    </div>
                    {hasMonthKuponDevaluasi && (
                      <div className="text-[9.5px] font-bold text-red-600 mt-0.5 leading-none">
                        (Potensi: {fmt(bulan_kupon + (devaluasi_bulan_kupon || 0))} − Penalti: {fmt(devaluasi_bulan_kupon || 0)})
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 4: Kupon Kumulatif Yang Dimiliki */}
                <div className="border border-slate-300 rounded p-2.5 bg-white flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Total Kupon Yang Dimiliki
                      </span>
                      {hasCumKuponDevaluasi && (
                        <span className="text-[7.5px] font-extrabold text-red-700 bg-red-100 border border-red-200 px-1 py-0.2 rounded tracking-wider uppercase">
                          DIBEKUKAN
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl font-black text-amber-900">{fmt(kumulatif_kupon)}</span>
                      <span className="text-[11px] font-semibold text-slate-600">lembar Kupon</span>
                    </div>
                    <div className="text-[8.5px] text-slate-400 mt-0.5 leading-none">
                      Kupon aktif {transaksi_terakhir ? `s.d. ${fmtTgl(transaksi_terakhir)}` : ""}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Table 1: Transaksi Perolehan Point Periode 2026-2027 (Internal View) */}
            <div className="mb-4">
              <div className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-t">
                Transaksi Perolehan Point Periode 2026-2027 (Internal View)
              </div>
              <table className="w-full text-[10.5px] border border-slate-300 border-t-0 border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                    <th className="py-1 px-2 w-8 text-center border-r border-slate-300">No</th>
                    <th className="py-1 px-2.5 border-r border-slate-300 text-left">Bulan</th>
                    <th className="py-1 px-2.5 text-right w-36 border-r border-slate-300">Total Transaksi</th>
                    <th className="py-1 px-2.5 text-right w-32 border-r border-slate-300">Point</th>
                    <th className="py-1 px-2.5 text-center w-24 border-r border-slate-300">Bonus Point</th>
                    <th className="py-1 px-2.5 text-right w-28">Kupon</th>
                  </tr>
                </thead>
                <tbody>
                  {histori.map((h: MonthlyHistory, i: number) => {
                    const isCurrent = h.bulan === bulan;
                    const isSuspendedMonth = Boolean(
                      (isCurrent && isDevaluedAccount) ||
                      h.is_suspended ||
                      (h.devaluasi_poin && h.devaluasi_poin > 0) ||
                      (h.devaluasi_kupon && h.devaluasi_kupon > 0)
                    );
                    const voidPoin = h.devaluasi_poin !== undefined ? h.devaluasi_poin : (isCurrent ? (devaluasi_bulan_poin || 0) : 0);
                    const voidKupon = h.devaluasi_kupon !== undefined ? h.devaluasi_kupon : (isCurrent ? (devaluasi_bulan_kupon || 0) : 0);
                    return (
                      <tr
                        key={h.bulan}
                        className={`border-b ${
                          isSuspendedMonth
                            ? "border-red-200 bg-red-50/80 font-bold"
                            : isCurrent
                            ? "border-slate-200 bg-amber-50/70 font-semibold"
                            : i % 2 === 1
                            ? "border-slate-200 bg-slate-50/50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <td className={`py-1 px-2 text-center font-mono border-r ${isSuspendedMonth ? "border-red-200 text-red-700" : "border-slate-200"}`}>
                          {i + 1}
                        </td>
                        <td className={`py-1 px-2.5 uppercase border-r ${isSuspendedMonth ? "border-red-200 text-red-700 font-bold" : "border-slate-200 font-medium"}`}>
                          {h.label}
                          {isSuspendedMonth ? (
                            <span className="text-[7.5px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.2 rounded ml-1.5 font-extrabold uppercase">
                              SANKSI VOID
                            </span>
                          ) : isCurrent ? (
                            <span className="text-[8px] bg-amber-200 text-amber-900 px-1 rounded ml-1 font-bold">
                              Bulan Ini
                            </span>
                          ) : null}
                        </td>
                        <td className={`py-1 px-2.5 text-right font-mono border-r ${isSuspendedMonth ? "border-red-200 text-slate-900 font-bold" : "border-slate-200"}`}>
                          {h.total_transaksi > 0 ? fmtRp(h.total_transaksi) : "Rp.  - "}
                        </td>
                        <td className={`py-1 px-2.5 text-right font-mono border-r ${isSuspendedMonth ? "border-red-200 text-red-600 font-bold" : "border-slate-200"}`}>
                          {isSuspendedMonth && voidPoin > 0 ? (
                            `0 [VOID ${fmt(voidPoin)}]`
                          ) : h.poin > 0 ? (
                            `${fmt(h.poin)} Point`
                          ) : (
                            "Point  - "
                          )}
                        </td>
                        <td className={`py-1 px-2.5 text-center font-mono text-slate-500 border-r ${isSuspendedMonth ? "border-red-200" : "border-slate-200"}`}>
                          Point  - 
                        </td>
                        <td className={`py-1 px-2.5 text-right font-mono ${isSuspendedMonth ? "text-red-600 font-bold" : ""}`}>
                          {isSuspendedMonth && voidKupon > 0 ? (
                            `0 [VOID ${fmt(voidKupon)}]`
                          ) : h.kupon > 0 ? (
                            `${fmt(h.kupon)} Lembar`
                          ) : (
                            "Lembar  - "
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total Row */}
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-slate-950">
                    <td colSpan={2} className="py-1.5 px-3 text-right uppercase tracking-wider border-r border-slate-300 font-extrabold">
                      {isDevaluedAccount ? "TOTAL AKUMULASI DIAKUI" : "Total"}
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono border-r border-slate-300">
                      {fmtRp(totalHistoriTransaksi)}
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono border-r border-slate-300">
                      {fmt(totalHistoriPoin)} Point
                    </td>
                    <td className="py-1.5 px-2.5 text-center font-mono text-slate-500 border-r border-slate-300">
                      Point  - 
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono">
                      {fmt(totalHistoriKupon)} Lembar
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Table 2: Rekapan Bulanan (Rincian Status Outlet) */}
            <div className="mb-3">
              <div className="bg-slate-900 text-white text-[10.5px] font-black uppercase tracking-wider px-3 py-1 rounded-t">
                Rekapan Bulanan {bulan_label} (Rincian Status Outlet)
              </div>
              <table className="w-full text-[10px] border border-slate-300 border-t-0 border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                    <th className="py-1 px-2 w-8 text-center border-r border-slate-300">No</th>
                    <th className="py-1 px-2.5 w-36 border-r border-slate-300 text-left">ID Outlet</th>
                    <th className="py-1 px-2.5 border-r border-slate-300 text-left">Nama Outlet</th>
                    <th className="py-1 px-2.5 text-right w-36 border-r border-slate-300">Total Transaksi</th>
                    <th className="py-1 px-2.5 text-right w-32 border-r border-slate-300">Point</th>
                    <th className="py-1 px-2.5 text-right w-28">Kupon</th>
                  </tr>
                </thead>
                <tbody>
                  {outlets.map((outlet: OutletSummary, idx: number) => {
                    const hasOutletVoidPoint = Boolean(
                      isDevaluedAccount && outlet.is_devalued && outlet.devaluasi_poin && outlet.devaluasi_poin > 0
                    );
                    const hasOutletVoidKupon = Boolean(
                      isDevaluedAccount && outlet.is_devalued && outlet.devaluasi_kupon && outlet.devaluasi_kupon > 0
                    );
                    return (
                      <tr key={outlet.outlet_id} className={`border-b border-slate-200 ${idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}`}>
                        <td className="py-1 px-2 text-center font-mono border-r border-slate-200">{idx + 1}</td>
                        <td className="py-1 px-2.5 font-mono border-r border-slate-200">{outlet.outlet_id}</td>
                        <td className="py-1 px-2.5 font-medium border-r border-slate-200 uppercase">{outlet.nama_outlet}</td>
                        <td className="py-1 px-2.5 text-right font-mono border-r border-slate-200">{fmtRp(outlet.total_transaksi)}</td>
                        <td className="py-1 px-2.5 text-right font-mono border-r border-slate-200">
                          {hasOutletVoidPoint ? (
                            <span className="text-red-600 font-bold">0 [VOID: {fmt(outlet.devaluasi_poin!)}]</span>
                          ) : (
                            <span>{fmt(outlet.poin)} Point</span>
                          )}
                        </td>
                        <td className="py-1 px-2.5 text-right font-mono">
                          {hasOutletVoidKupon ? (
                            <span className="text-red-600 font-bold">0 [VOID: {fmt(outlet.devaluasi_kupon!)}]</span>
                          ) : (
                            <span>{fmt(outlet.kupon)} Lembar</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total Row */}
                  <tr className="bg-slate-100 font-bold border-t border-slate-300 text-slate-950">
                    <td colSpan={3} className="py-1.5 px-3 text-right uppercase border-r border-slate-300">TOTAL</td>
                    <td className="py-1.5 px-2.5 text-right font-mono border-r border-slate-300">{fmtRp(bulan_transaksi)}</td>
                    <td className="py-1.5 px-2.5 text-right font-mono border-r border-slate-300">
                      {isDevaluedAccount && bulan_poin === 0 && bulan_transaksi > 0 ? (
                        <span className="text-red-600 font-black">0 Point</span>
                      ) : (
                        <span>{fmt(bulan_poin)} Point</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2.5 text-right font-mono">
                      {isDevaluedAccount && bulan_kupon === 0 && bulan_transaksi > 0 ? (
                        <span className="text-red-600 font-black">0 Lembar</span>
                      ) : (
                        <span>{fmt(bulan_kupon)} Lembar</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Klausul Legal Berita Acara Audit & Pengesahan Saldo */}
            {isDevaluedAccount && (
              <div className="border border-slate-300 bg-slate-50/90 rounded p-2.5 mb-3 text-[10px] leading-snug">
                <div className="font-bold text-slate-800 uppercase tracking-wide mb-0.5">
                  BERITA ACARA AUDIT &amp; PENGESAHAN SALDO:
                </div>
                <p className="text-slate-600 mb-0.5">
                  Dokumen arsip internal ini mengonfirmasi pembatalan/void {fmt(devaluasi_bulan_poin || 0)} Poin dan {fmt(devaluasi_bulan_kupon || 0)} Kupon periode {bulan_label} akibat status evaluasi khusus.
                </p>
                <p className="font-bold text-slate-950">
                  Total saldo hak akumulasi yang diakui dan sah untuk ditindaklanjuti adalah sebesar {fmt(kumulatif_poin)} Point dan {fmt(kumulatif_kupon)} Lembar Kupon.
                </p>
              </div>
            )}

            {/* Signature Block (Halaman 2: Disetujui oleh Management + Diterima oleh Customer) */}
            <div className="flex justify-between mt-4 px-10">
              <div className="w-56 text-center text-[12px]">
                <p className="font-semibold text-slate-700 mb-12">Disetujui oleh,</p>
                <div className="border-b border-slate-800 w-full mb-1"></div>
                <p className="font-bold uppercase text-slate-900">MANAGEMENT</p>
              </div>

              <div className="w-56 text-center text-[12px]">
                <p className="font-semibold text-slate-700 mb-12">Diterima oleh,</p>
                <div className="border-b border-slate-800 w-full mb-1"></div>
                <p className="font-bold uppercase text-slate-900">{nama_pemilik || "Customer"}</p>
              </div>
            </div>
          </div>

          {/* Footer (Halaman 2) */}
          <div className="pt-3 border-t border-slate-200 text-[10px] text-slate-600 flex justify-between items-center font-medium">
            <div>
              <p className="font-semibold text-slate-700">*Halaman 2 : untuk Pencatatan Internal Audit &amp; Arsip Akuntansi Oriental</p>
              <p>*Perhitungan telah dievaluasi by Sistem</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
