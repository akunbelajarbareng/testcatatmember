"use client";
import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize?: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  className?: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize = 10,
  itemLabel = "data",
  onPageChange,
  className = "",
}: PaginationProps) {
  if (totalItems <= 0) return null;

  const start = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const end = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers with ellipsis if many pages
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
      }
    }
    return pages;
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/60 text-xs text-slate-600 rounded-b-lg ${className}`}
    >
      {/* Counter */}
      <div className="font-medium text-slate-600">
        Menampilkan <span className="font-bold text-slate-900">{start}</span> –{" "}
        <span className="font-bold text-slate-900">{end}</span> dari{" "}
        <span className="font-bold text-slate-900">{totalItems.toLocaleString("id-ID")}</span> {itemLabel}
      </div>

      {/* Buttons */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
            title="Halaman Sebelumnya"
          >
            <ChevronLeft size={14} />
            <span className="hidden sm:inline">Sebelumnya</span>
          </button>

          <div className="flex items-center gap-1">
            {getPageNumbers().map((p, idx) =>
              p === "..." ? (
                <span key={`dots-${idx}`} className="px-1.5 py-0.5 text-slate-400 select-none">
                  …
                </span>
              ) : (
                <button
                  key={`page-${p}`}
                  type="button"
                  onClick={() => onPageChange(Number(p))}
                  className={`min-w-[28px] h-7 px-2 rounded text-xs font-semibold transition flex items-center justify-center ${
                    currentPage === p
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {p}
                </button>
              )
            )}
          </div>

          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-2xs"
            title="Halaman Selanjutnya"
          >
            <span className="hidden sm:inline">Selanjutnya</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
