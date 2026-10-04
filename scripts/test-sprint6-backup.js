/**
 * test-sprint6-backup.js — Automated Verification Test for Sprint 6
 * Verifies:
 * 1. GET /api/maintenance/backup security (blocks unauth 401, blocks staff 403)
 * 2. GET /api/maintenance/backup downloads genuine, valid SQLite binary file
 * 3. Daily backup script (scripts/backup-db.js) produces valid database file with verified tables
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { runBackup } = require('./backup-db');

const BASE_URL = 'http://localhost:3000';

async function runBackupTests() {
  console.log('====================================================');
  console.log('   SPRINT 6 — DISASTER RECOVERY & BACKUP TEST       ');
  console.log('====================================================\n');

  // 1. Authenticate Admin and Staff
  const adminRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'oriental2026' }),
  });
  const adminCookie = adminRes.headers.get('set-cookie')?.match(/crm_session=([^;]+)/)?.[1] || '';

  const staffRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'kasir', password: 'kasir2026' }),
  });
  const staffCookie = staffRes.headers.get('set-cookie')?.match(/crm_session=([^;]+)/)?.[1] || '';

  // ---------------------------------------------------------------------------
  // TEST 1: API SECURITY GUARD ON /api/maintenance/backup
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Security Guard on Backup Download Endpoint ---');

  // No cookie
  const unauthRes = await fetch(`${BASE_URL}/api/maintenance/backup`);
  console.log(`✓ Backup without auth: HTTP ${unauthRes.status} (Expected: 401)`);
  if (unauthRes.status !== 401) throw new Error('Unauthenticated access was allowed!');

  // Staff cookie (should be 403)
  const staffBackupRes = await fetch(`${BASE_URL}/api/maintenance/backup`, {
    headers: { Cookie: `crm_session=${staffCookie}` },
  });
  console.log(`✓ Backup by Staff role: HTTP ${staffBackupRes.status} (Expected: 403 Forbidden)`);
  if (staffBackupRes.status !== 403) throw new Error('Staff was allowed to download backup!');

  // ---------------------------------------------------------------------------
  // TEST 2: ONE-CLICK DOWNLOAD INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Admin One-Click Backup Download & File Integrity ---');

  const adminBackupRes = await fetch(`${BASE_URL}/api/maintenance/backup`, {
    headers: { Cookie: `crm_session=${adminCookie}` },
  });
  console.log(`✓ Backup by Admin role: HTTP ${adminBackupRes.status} (Expected: 200 OK)`);
  if (adminBackupRes.status !== 200) throw new Error('Admin backup download failed!');

  const contentDisposition = adminBackupRes.headers.get('content-disposition') || '';
  console.log(`✓ Content-Disposition header: "${contentDisposition}"`);
  if (!contentDisposition.includes('.db')) throw new Error('Invalid filename in header');

  const arrayBuffer = await adminBackupRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`✓ Downloaded buffer size: ${(buffer.length / 1024).toFixed(1)} KB`);

  // Verify SQLite file header magic string ("SQLite format 3\0")
  const magic = buffer.toString('utf-8', 0, 16);
  const isSQLite = magic.startsWith('SQLite format 3');
  console.log(`✓ SQLite Header Magic Verification: ${isSQLite ? '✓ VALID SQLite File' : '✗ INVALID'}`);
  if (!isSQLite) throw new Error('Downloaded file is not a valid SQLite database!');

  // Save to temporary test file and open with better-sqlite3 to verify schema & data
  const testRestorePath = path.join(__dirname, '..', 'data', 'backups', 'test_verified_restore.db');
  fs.writeFileSync(testRestorePath, buffer);

  const testDb = new Database(testRestorePath);
  const idCount = testDb.prepare(`SELECT count(*) as c FROM identities`).get().c;
  const invCount = testDb.prepare(`SELECT count(*) as c FROM invoices`).get().c;
  const ruleCount = testDb.prepare(`SELECT count(*) as c FROM rules_config`).get().c;
  testDb.close();
  fs.unlinkSync(testRestorePath);

  console.log(`✓ Restored DB Integrity Check: ${idCount} Identities, ${invCount} Invoices, ${ruleCount} Rules`);

  // ---------------------------------------------------------------------------
  // TEST 3: AUTOMATED DAILY BACKUP SCRIPT INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Daily Backup Script (scripts/backup-db.js) ---');
  const backupResult = await runBackup();
  console.log(`✓ Script executed successfully! File: ${path.basename(backupResult.destinationFile)}`);

  const diskDb = new Database(backupResult.destinationFile);
  const diskIdCount = diskDb.prepare(`SELECT count(*) as c FROM identities`).get().c;
  diskDb.close();
  console.log(`✓ Disk backup verified: ${diskIdCount} identities preserved.`);

  console.log('\n====================================================');
  console.log('   ALL SPRINT 6 BACKUP & RECOVERY TESTS PASSED!    ');
  console.log('====================================================\n');
}

runBackupTests().catch((err) => {
  console.error('FAIL in backup test:', err);
  process.exit(1);
});
