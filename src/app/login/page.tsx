"use client";

import React, { useState, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Lock,
  User,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  ShieldCheck,
  Store,
  Sparkles,
  ArrowRight,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Silakan masukkan username dan password");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Username atau password salah");
      } else {
        // Berhasil login, arahkan ke halaman tujuan
        router.push(nextUrl);
        router.refresh();
      }
    } catch {
      setError("Gagal terhubung ke server. Periksa koneksi internet Anda.");
    } finally {
      setLoading(false);
    }
  };

  const fillQuick = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError(null);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #070e1b 0%, #0d1b2a 50%, #112240 100%)",
        padding: "24px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative ambient background glows */}
      <div
        style={{
          position: "absolute",
          top: "-15%",
          right: "-10%",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(212, 175, 55, 0.12) 0%, rgba(212, 175, 55, 0) 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-20%",
          left: "-10%",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(30, 58, 138, 0.25) 0%, rgba(30, 58, 138, 0) 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(212, 175, 55, 0.25)",
          borderRadius: 16,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(212, 175, 55, 0.08)",
          padding: "36px 32px 32px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Header with Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 16px",
              borderRadius: 14,
              background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 100%)",
              border: "1px solid rgba(212, 175, 55, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 16px rgba(0,0,0,0.3)",
              overflow: "hidden",
            }}
          >
            <Image
              src="/oriental_logo.png"
              alt="Oriental Logo"
              width={52}
              height={52}
              style={{ objectFit: "contain" }}
              priority
            />
          </div>

          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#FFFFFF",
              letterSpacing: "-0.02em",
              margin: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            Oriental CRM
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#D4AF37",
                background: "rgba(212, 175, 55, 0.15)",
                border: "1px solid rgba(212, 175, 55, 0.4)",
                padding: "2px 8px",
                borderRadius: 999,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Secure Portal
            </span>
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "rgba(255, 255, 255, 0.6)",
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            Pencatatan Poin, Undian Kupon & Cetak Statement
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(225, 29, 72, 0.15)",
              border: "1px solid rgba(225, 29, 72, 0.4)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 20,
              color: "#FECDD3",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <AlertCircle size={16} style={{ color: "#FB7185", flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          {/* Username Field */}
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "rgba(255, 255, 255, 0.75)",
                marginBottom: 6,
              }}
            >
              Username
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "rgba(255, 255, 255, 0.4)",
                  pointerEvents: "none",
                }}
              >
                <User size={16} />
              </div>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username Anda"
                required
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 38px",
                  fontSize: 13,
                  color: "#FFFFFF",
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: 8,
                  outline: "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#D4AF37";
                  e.target.style.boxShadow = "0 0 0 2px rgba(212, 175, 55, 0.2)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255, 255, 255, 0.15)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>
          </div>

          {/* Password Field */}
          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "rgba(255, 255, 255, 0.75)",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "rgba(255, 255, 255, 0.4)",
                  pointerEvents: "none",
                }}
              >
                <Lock size={16} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password"
                required
                style={{
                  width: "100%",
                  padding: "10px 40px 10px 38px",
                  fontSize: 13,
                  color: "#FFFFFF",
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: 8,
                  outline: "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#D4AF37";
                  e.target.style.boxShadow = "0 0 0 2px rgba(212, 175, 55, 0.2)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(255, 255, 255, 0.15)";
                  e.target.style.boxShadow = "none";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 255, 255, 0.5)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                }}
                title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 700,
              color: "#0A192F",
              background: "linear-gradient(135deg, #F3E5AB 0%, #D4AF37 50%, #AA7C11 100%)",
              border: "none",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 4px 14px rgba(212, 175, 55, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "transform 0.1s ease, filter 0.2s ease",
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16, borderTopColor: "#0A192F" }} />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <>
                <LogIn size={16} />
                <span>Masuk ke Sistem</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Credentials Assistant (Hanya Tampil di Mode Pengembangan Lokal) */}
        {process.env.NODE_ENV !== 'production' && (
          <div
            style={{
              marginTop: 24,
              paddingTop: 18,
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(255, 255, 255, 0.4)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
                textAlign: "center",
              }}
            >
              Mode Uji Coba Lokal (Akun Bawaan)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                type="button"
                onClick={() => fillQuick("admin", "oriental2026")}
                style={{
                  padding: "8px 10px",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(212, 175, 55, 0.3)",
                  borderRadius: 6,
                  color: "#F3E5AB",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(212, 175, 55, 0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                }}
              >
                <ShieldCheck size={13} style={{ color: "#D4AF37" }} />
                <span>Admin / Owner</span>
              </button>

              <button
                type="button"
                onClick={() => fillQuick("kasir", "kasir2026")}
                style={{
                  padding: "8px 10px",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(147, 197, 253, 0.3)",
                  borderRadius: 6,
                  color: "#93C5FD",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(147, 197, 253, 0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                }}
              >
                <Store size={13} style={{ color: "#60A5FA" }} />
                <span>Kasir / Petugas</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer info */}
        <div
          style={{
            marginTop: 20,
            textAlign: "center",
            fontSize: 10,
            color: "rgba(255, 255, 255, 0.3)",
          }}
        >
          Hak Cipta © 2026 Toko Oriental. Dilindungi Sistem Keamanan Sesi.
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "#070e1b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div className="spinner" style={{ width: 28, height: 28, borderTopColor: "#D4AF37" }} />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
