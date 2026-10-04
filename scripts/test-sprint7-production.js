/**
 * test-sprint7-production.js — Final End-to-End Go-Live Verification Test
 * Verifies:
 * 1. Production bundle integrity (.next folder, BUILD_ID, server artifacts)
 * 2. Service launcher scripts (start-production.bat, start-silent.vbs)
 * 3. Go-online documentation & disaster recovery SOPs
 * 4. End-to-end production readiness of login, dashboard, statements, and backup
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const PROJECT_ROOT = path.join(__dirname, '..');

async function runProductionReadinessTest() {
  console.log('====================================================');
  console.log('  SPRINT 7 — PRODUCTION & GO-ONLINE READINESS TEST  ');
  console.log('====================================================\n');

  // ---------------------------------------------------------------------------
  // 1. PRODUCTION BUILD ARTIFACTS
  // ---------------------------------------------------------------------------
  console.log('1. Checking Production Build Artifacts:');
  const nextDir = path.join(PROJECT_ROOT, '.next');
  const buildIdPath = path.join(nextDir, 'BUILD_ID');
  const serverDir = path.join(nextDir, 'server');

  const hasNext = fs.existsSync(nextDir);
  const hasBuildId = fs.existsSync(buildIdPath);
  const hasServer = fs.existsSync(serverDir);

  console.log(`   - .next directory: ${hasNext ? '✓ FOUND' : '✗ MISSING'}`);
  console.log(`   - BUILD_ID file: ${hasBuildId ? '✓ FOUND (' + fs.readFileSync(buildIdPath, 'utf8').trim() + ')' : '✗ MISSING'}`);
  console.log(`   - Compiled server routes: ${hasServer ? '✓ COMPILED' : '✗ MISSING'}`);

  if (!hasNext || !hasBuildId || !hasServer) {
    throw new Error('Production build artifacts are missing! Run "npm run build" first.');
  }

  // ---------------------------------------------------------------------------
  // 2. LAUNCHERS & SYSTEM DOCUMENTATION
  // ---------------------------------------------------------------------------
  console.log('\n2. Checking System Launchers & Operational Guides:');
  const filesToCheck = [
    { file: 'start-production.bat', desc: 'Production server launcher' },
    { file: 'start-silent.vbs', desc: 'Silent startup background script' },
    { file: 'scripts/backup-db.js', desc: 'Automated database backup script' },
    { file: 'scripts/setup-windows-task.ps1', desc: 'Task scheduler setup script' },
    { file: 'PANDUAN_GO_ONLINE_CLOUDFLARE.md', desc: 'Official Cloudflare Tunnel guide' },
    { file: 'PANDUAN_BACKUP_RESTORE.md', desc: 'Official Disaster Recovery SOP' },
  ];

  for (const item of filesToCheck) {
    const fullPath = path.join(PROJECT_ROOT, item.file);
    const exists = fs.existsSync(fullPath);
    console.log(`   - ${item.desc} (${item.file}): ${exists ? '✓ READY' : '✗ MISSING'}`);
    if (!exists) throw new Error(`Missing required file: ${item.file}`);
  }

  // ---------------------------------------------------------------------------
  // 3. END-TO-END SYSTEM SANITY CHECK (API & FLOW)
  // ---------------------------------------------------------------------------
  console.log('\n3. Testing End-to-End System Sanity:');

  // A. Public Login Portal
  const loginHtmlRes = await fetch(`${BASE_URL}/login`);
  console.log(`   - Login Portal Page: HTTP ${loginHtmlRes.status} (Expected: 200)`);
  if (loginHtmlRes.status !== 200) throw new Error('Login portal failed to respond!');

  // B. Admin Authentication
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'oriental2026' }),
  });
  const loginJson = await loginRes.json();
  const token = loginRes.headers.get('set-cookie')?.match(/crm_session=([^;]+)/)?.[1];
  console.log(`   - Admin Authentication: ${loginRes.ok && token ? '✓ AUTHENTICATED' : '✗ FAILED'}`);
  if (!token) throw new Error('Failed to obtain session token!');

  const authHeaders = { Cookie: `crm_session=${token}` };

  // C. Dashboard Stats API
  const dashRes = await fetch(`${BASE_URL}/api/dashboard`, { headers: authHeaders });
  const dashJson = await dashRes.json();
  console.log(`   - Dashboard Metrics: HTTP ${dashRes.status} — Total Transaksi: Rp ${dashJson.summary?.totalNilaiTransaksi?.toLocaleString('id-ID') || 0}`);
  if (dashRes.status !== 200) throw new Error('Dashboard API failed!');

  // D. Benchmark Statement (Pak Catur)
  const stmtRes = await fetch(`${BASE_URL}/api/statements/102-260901-01/2026-09`, { headers: authHeaders });
  const stmtJson = await stmtRes.json();
  const poin = stmtJson.data?.bulan_poin;
  const kupon = stmtJson.data?.bulan_kupon;
  console.log(`   - Statement Pak Catur: Poin ${poin} (exp 668), Kupon ${kupon} (exp 217) -> ${poin === 668 && kupon === 217 ? '✓ 100% ACCURATE' : '✗ MISMATCH'}`);
  if (poin !== 668 || kupon !== 217) throw new Error('Statement calculation mismatch!');

  // E. Backup Route Verification
  const backupRes = await fetch(`${BASE_URL}/api/maintenance/backup`, { headers: authHeaders });
  const backupBuffer = Buffer.from(await backupRes.arrayBuffer());
  const isSQLite = backupBuffer.toString('utf8', 0, 16).startsWith('SQLite format 3');
  console.log(`   - One-Click Backup Stream: HTTP ${backupRes.status}, Size ${(backupBuffer.length / 1024).toFixed(1)} KB, SQLite: ${isSQLite ? '✓ VALID' : '✗ INVALID'}`);
  if (!isSQLite) throw new Error('Backup download failed validation!');

  console.log('\n====================================================');
  console.log('  CONGRATULATIONS! THE WEBAPP IS 100% READY FOR ONLINE');
  console.log('====================================================\n');
}

runProductionReadinessTest().catch((err) => {
  console.error('FAIL in production readiness test:', err);
  process.exit(1);
});
