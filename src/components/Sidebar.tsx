"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Upload,
  CheckSquare,
  FileText,
  GitMerge,
  Settings,
  Store,
  ChevronRight,
  Ticket,
  LogOut,
  ShieldCheck,
  User,
} from "lucide-react";
import Image from "next/image";

const nav = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/identities", icon: Users, label: "Daftar Member" },
  { href: "/outlets", icon: Store, label: "Outlet" },
  { href: "/coupons", icon: Ticket, label: "Kupon Undian" },
  { href: "/statements", icon: FileText, label: "Statement" },
  { href: "/import", icon: Upload, label: "Import Data" },
  { href: "/aliases", icon: GitMerge, label: "Pemetaan Alias" },
  { href: "/approvals", icon: CheckSquare, label: "Antrean Approval" },
  { href: "/settings", icon: Settings, label: "Pengaturan" },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{
    id: number;
    username: string;
    nama: string;
    role: "admin" | "staff";
  } | null>(null);

  useEffect(() => {
    if (path.startsWith("/print") || path === "/login") return;

    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated && data?.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, [path]);

  // Hide sidebar on print pages and login page
  if (path.startsWith("/print") || path === "/login") return null;

  const handleLogout = async () => {
    if (!confirm("Apakah Anda yakin ingin keluar dari sistem CRM?")) return;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    }
  };

  return (
    <>
      <aside
        className="no-print flex flex-col shrink-0"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 230,
          height: "100vh",
          overflowY: "auto",
          zIndex: 40,
          background: "var(--navy-900)",
          borderRight: "1px solid rgba(255,255,255,.06)",
        }}
      >
      {/* Logo */}
      <div
        style={{
          padding: "20px 18px 16px",
          borderBottom: "1px solid rgba(255,255,255,.07)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "rgba(255,255,255,.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <Image
              src="/oriental_logo.png"
              alt="Oriental"
              width={32}
              height={32}
              style={{ objectFit: "contain" }}
            />
          </div>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "-.01em",
                lineHeight: 1.2,
              }}
            >
              Oriental CRM
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 1 }}>
              Point & Kupon
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,.3)",
            padding: "6px 8px 8px",
          }}
        >
          Menu Utama
        </div>

        {nav.map(({ href, icon: Icon, label }) => {
          const isActive =
            href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`nav-link${isActive ? " active" : ""}`}
            >
              <Icon size={16} className="icon" />
              <span style={{ flex: 1 }}>{label}</span>
              {isActive && (
                <ChevronRight size={14} style={{ opacity: 0.5 }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Current User Badge & Footer */}
      <div
        style={{
          padding: "12px 10px",
          borderTop: "1px solid rgba(255,255,255,.07)",
          background: "rgba(0, 0, 0, 0.15)",
        }}
      >
        {currentUser && (
          <div
            style={{
              padding: "8px 10px",
              background: "rgba(255, 255, 255, 0.04)",
              borderRadius: 8,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: currentUser.role === "admin" ? "rgba(212, 175, 55, 0.2)" : "rgba(59, 130, 246, 0.2)",
                color: currentUser.role === "admin" ? "var(--gold-400)" : "#93C5FD",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {currentUser.role === "admin" ? <ShieldCheck size={15} /> : <User size={15} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentUser.nama}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: currentUser.role === "admin" ? "var(--gold-400)" : "rgba(255, 255, 255, 0.4)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                }}
              >
                {currentUser.role === "admin" ? "Owner / Admin" : "Staff CRM"}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 4 }}>
          <Link
            href="/settings"
            className="nav-link"
            style={{ flex: 1, padding: "7px 10px", fontSize: 12 }}
            title="Pengaturan Sistem"
          >
            <Settings size={15} className="icon" />
            <span>Pengaturan</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="nav-link"
            style={{
              padding: "7px 10px",
              color: "#FB7185",
              fontSize: 12,
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
            title="Keluar dari sistem (Logout)"
          >
            <LogOut size={15} style={{ color: "#FB7185" }} />
          </button>
        </div>

        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,.25)",
            padding: "8px 8px 0",
            lineHeight: 1.4,
            textAlign: "center",
          }}
        >
          Oriental CRM v1.0 • Sep 2026 - Sep 2027
        </div>
      </div>
    </aside>
    {/* Spacer to push main content on desktop when sidebar is fixed */}
    <div className="no-print shrink-0" style={{ width: 230 }} aria-hidden="true" />
  </>
  );
}
