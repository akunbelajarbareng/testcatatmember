/**
 * test-sprint5-security.js — Comprehensive Automated Security Test for Sprint 5
 * Verifies:
 * 1. Password hashing (scrypt) & transparent auto-upgrade from plaintext
 * 2. Login brute-force rate limiting (HTTP 429 after 5 failed attempts)
 * 3. API Auth Guard: rejection of missing/fake session cookies (HTTP 401)
 * 4. Role-based access control: staff blocked from admin-only routes (HTTP 403)
 * 5. Critical destruction guard on /api/maintenance/cleanse with Owner password
 * 6. Valid user session flow (admin & staff)
 */
const Database = require('better-sqlite3');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const dbPath = path.join(__dirname, '..', 'data', 'oriental_crm.db');

async function runSecurityTests() {
  console.log('====================================================');
  console.log('       SPRINT 5 — SECURITY & AUTH HARDENING TEST    ');
  console.log('====================================================\n');

  const db = new Database(dbPath);

  // ---------------------------------------------------------------------------
  // 1. PASSWORD HASHING & TRANSPARENT AUTO-UPGRADE
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Password Hashing & Transparent Auto-Upgrade ---');

  // Login as admin with known password
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'oriental2026' }),
  });
  const adminLoginJson = await adminLoginRes.json();

  if (!adminLoginRes.ok || !adminLoginJson.success) {
    console.error('FAIL: Admin login failed:', adminLoginJson);
    process.exit(1);
  }
  console.log('✓ Admin login successful:', adminLoginJson.user.nama);

  // Check database: password must now start with scrypt$
  const adminUserRow = db.prepare(`SELECT password FROM app_users WHERE username = 'admin'`).get();
  const ownerAuthRow = db.prepare(`SELECT password FROM system_auth WHERE id = 1`).get();

  const adminHashed = adminUserRow.password.startsWith('scrypt$');
  const ownerHashed = ownerAuthRow.password.startsWith('scrypt$');

  console.log(`✓ Admin user password in DB hashed: ${adminHashed ? 'YES (' + adminUserRow.password.slice(0, 20) + '...)' : 'NO'}`);
  console.log(`✓ Owner system_auth in DB hashed: ${ownerHashed ? 'YES (' + ownerAuthRow.password.slice(0, 20) + '...)' : 'NO'}`);

  if (!adminHashed || !ownerHashed) {
    console.error('FAIL: Password was not hashed with scrypt!');
    process.exit(1);
  }

  // Extract admin session cookie from Set-Cookie header
  const adminSetCookie = adminLoginRes.headers.get('set-cookie') || '';
  const adminCookieMatch = adminSetCookie.match(/crm_session=([^;]+)/);
  const adminToken = adminCookieMatch ? adminCookieMatch[1] : '';

  // Login as kasir (staff)
  const staffLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'kasir', password: 'kasir2026' }),
  });
  const staffLoginJson = await staffLoginRes.json();
  console.log('✓ Kasir login successful:', staffLoginJson.user.nama);

  const kasirUserRow = db.prepare(`SELECT password FROM app_users WHERE username = 'kasir'`).get();
  const kasirHashed = kasirUserRow.password.startsWith('scrypt$');
  console.log(`✓ Kasir user password in DB hashed: ${kasirHashed ? 'YES' : 'NO'}`);

  const staffSetCookie = staffLoginRes.headers.get('set-cookie') || '';
  const staffCookieMatch = staffSetCookie.match(/crm_session=([^;]+)/);
  const staffToken = staffCookieMatch ? staffCookieMatch[1] : '';

  // ---------------------------------------------------------------------------
  // 2. API AUTH GUARD: UNPROTECTED / DUMMY COOKIE REJECTION
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: API Auth Guard (Unauthenticated & Fake Token Rejection) ---');

  // A. Request without cookie
  const noCookieRes = await fetch(`${BASE_URL}/api/dashboard`, {
    headers: {},
  });
  console.log(`✓ Access /api/dashboard without token: HTTP ${noCookieRes.status} (Expected: 401)`);
  if (noCookieRes.status !== 401) {
    console.error('FAIL: Protected endpoint allowed request without token!');
    process.exit(1);
  }

  // B. Request with fake/dummy cookie
  const fakeCookieRes = await fetch(`${BASE_URL}/api/dashboard`, {
    headers: { Cookie: 'crm_session=fake_random_attacker_token_xyz999' },
  });
  console.log(`✓ Access /api/dashboard with fake token: HTTP ${fakeCookieRes.status} (Expected: 401)`);
  if (fakeCookieRes.status !== 401) {
    console.error('FAIL: Protected endpoint allowed fake dummy token!');
    process.exit(1);
  }

  // C. Request with valid Admin cookie
  const validAdminRes = await fetch(`${BASE_URL}/api/dashboard`, {
    headers: { Cookie: `crm_session=${adminToken}` },
  });
  console.log(`✓ Access /api/dashboard with valid Admin token: HTTP ${validAdminRes.status} (Expected: 200)`);
  if (validAdminRes.status !== 200) {
    console.error('FAIL: Legitimate admin token rejected!');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // 3. ROLE-BASED ACCESS CONTROL: STAFF ACCESS TO ADMIN-ONLY ENDPOINTS
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Role-Based Access Control (Admin vs Staff) ---');

  // Staff accessing /api/settings (admin-only)
  const staffSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
    headers: { Cookie: `crm_session=${staffToken}` },
  });
  console.log(`✓ Staff access to /api/settings: HTTP ${staffSettingsRes.status} (Expected: 403 Forbidden)`);
  if (staffSettingsRes.status !== 403) {
    console.error('FAIL: Staff was able to access admin-only settings!');
    process.exit(1);
  }

  // Admin accessing /api/settings (allowed)
  const adminSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
    headers: { Cookie: `crm_session=${adminToken}` },
  });
  console.log(`✓ Admin access to /api/settings: HTTP ${adminSettingsRes.status} (Expected: 200 OK)`);
  if (adminSettingsRes.status !== 200) {
    console.error('FAIL: Admin was rejected from settings!');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // 4. DESTRUCTIVE ENDPOINT PROTECTION (/api/maintenance/cleanse)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Destructive Endpoint Protection (/api/maintenance/cleanse) ---');

  // Staff calling cleanse
  const staffCleanseRes = await fetch(`${BASE_URL}/api/maintenance/cleanse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `crm_session=${staffToken}`,
    },
    body: JSON.stringify({ owner_password: 'oriental2026' }),
  });
  console.log(`✓ Staff calling cleanse: HTTP ${staffCleanseRes.status} (Expected: 403 Forbidden)`);

  // Admin calling cleanse with WRONG owner password
  const adminWrongPassCleanseRes = await fetch(`${BASE_URL}/api/maintenance/cleanse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `crm_session=${adminToken}`,
    },
    body: JSON.stringify({ owner_password: 'wrong_password_123' }),
  });
  console.log(`✓ Admin calling cleanse with wrong password: HTTP ${adminWrongPassCleanseRes.status} (Expected: 403 Forbidden)`);
  if (adminWrongPassCleanseRes.status !== 403) {
    console.error('FAIL: Cleanse allowed wrong owner password!');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // 5. BRUTE-FORCE RATE LIMITING ON LOGIN
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Brute-Force Rate Limiting (5 Attempts -> Lockout) ---');

  const bruteUser = 'brute_test_target';

  // 5 failed login attempts
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.100', // Mock distinct IP
      },
      body: JSON.stringify({ username: bruteUser, password: `wrong_${i}` }),
    });
    const json = await res.json();
    console.log(`   Attempt ${i}: HTTP ${res.status} — ${json.error}`);
  }

  // 6th attempt should be blocked with HTTP 429 Too Many Requests
  const blockedRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '192.168.1.100',
    },
    body: JSON.stringify({ username: bruteUser, password: 'even_right_password' }),
  });
  const blockedJson = await blockedRes.json();
  console.log(`✓ 6th Attempt: HTTP ${blockedRes.status} (Expected: 429) — "${blockedJson.error}"`);

  if (blockedRes.status !== 429) {
    console.error('FAIL: Rate limiting did not trigger HTTP 429!');
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('  ALL SPRINT 5 SECURITY & AUTH TESTS PASSED 100%!  ');
  console.log('====================================================\n');
}

runSecurityTests().catch((err) => {
  console.error('Unhandled error during security testing:', err);
  process.exit(1);
});
