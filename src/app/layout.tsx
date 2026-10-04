import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Oriental CRM — Point & Kupon Statement",
  description: "Sistem pencatatan point dan kupon undian Oriental, lengkap dengan statement siap cetak.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${inter.variable} h-full print:h-auto`}>
      <body className="min-h-full flex print:block print:min-h-0 print:bg-white print:overflow-visible">
        {/* Sidebar */}
        <Sidebar />
        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 print:overflow-visible print:block print:w-full print:h-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
