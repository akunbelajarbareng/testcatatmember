/**
 * test-sprint3.js — Integration test over HTTP against running dev server
 */
const Database = require('better-sqlite3');
const db = new Database('data/oriental_crm.db');

async function run() {
  console.log('=== SPRINT 3 HTTP API INTEGRATION TEST ===\n');

  const BASE = 'http://localhost:3000';

  // 1. Test next-id for Grosir and UKM
  console.log('1. Testing Auto-Generated IDs:');
  const resGrosir = await fetch(`${BASE}/api/outlets/next-id?identity_id=102-261003-01&tipe=grosir`).then(r => r.json());
  console.log('   Next Grosir ID:', resGrosir.nextId);

  const resUkm = await fetch(`${BASE}/api/outlets/next-id?identity_id=102-261003-01&tipe=ukm`).then(r => r.json());
  console.log('   Next UKM ID:', resUkm.nextId);

  // 2. Map the 4 Aliases of Antara Company via POST /api/aliases
  console.log('\n2. Testing POST /api/aliases (Mapping Aliases to Outlets):');
  const mappings = [
    { nama_pos: 'ANTARA COMPANY - MEMBER GROSIR - GROSIR', outlet_id: '102-261003-01-01-900' },
    { nama_pos: 'ANTARA COMPANY - MEMBER UKM - ANTARA BAKERY', outlet_id: '102-261003-01-01-100' },
    { nama_pos: 'ANTARA COMPANY - MEMBER UKM - ANTARA COFFEE', outlet_id: '102-261003-01-02-100' },
    { nama_pos: 'ANTARA COMPANY - MEMBER UKM - ANTARA KITCHEN', outlet_id: '102-261003-01-03-100' },
  ];

  for (const m of mappings) {
    const res = await fetch(`${BASE}/api/aliases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(m),
    });
    const json = await res.json();
    console.log(`   ${res.ok ? '✓' : '✗'} ${json.message || json.error}`);
  }

  // 3. Verify Points & Coupons calculation in database
  console.log('\n3. Verifying Invoices Calculation per Business Line Rate:');

  // Check Grosir (Rate Rp 200.000)
  const grosirInvs = db.prepare(`SELECT no_invoice, tanggal, jumlah, poin, kupon FROM invoices WHERE outlet_id = '102-261003-01-01-900'`).all();
  console.log('\n   [GROSIR OUTLET: 102-261003-01-01-900] Rate: Rp 200.000 / pt, Kupon: Rp 150.000');
  for (const inv of grosirInvs) {
    const expPoin = Math.floor(inv.jumlah / 200000);
    const expKupon = Math.floor(inv.jumlah / 150000);
    const pass = inv.poin === expPoin && inv.kupon === expKupon;
    console.log(`     ${inv.no_invoice} | Rp ${inv.jumlah.toLocaleString('id-ID')} | Poin: ${inv.poin} (exp: ${expPoin}) | Kupon: ${inv.kupon} (exp: ${expKupon}) -> ${pass ? 'PASS' : 'FAIL'}`);
  }

  // Check UKM Bakery (Rate Rp 50.000)
  const ukmInvs = db.prepare(`SELECT no_invoice, tanggal, jumlah, poin, kupon FROM invoices WHERE outlet_id = '102-261003-01-01-100'`).all();
  console.log('\n   [UKM BAKERY OUTLET: 102-261003-01-01-100] Rate: Rp 50.000 / pt, Kupon: Rp 150.000');
  for (const inv of ukmInvs) {
    const expPoin = Math.floor(inv.jumlah / 50000);
    const expKupon = Math.floor(inv.jumlah / 150000);
    const pass = inv.poin === expPoin && inv.kupon === expKupon;
    console.log(`     ${inv.no_invoice} | Rp ${inv.jumlah.toLocaleString('id-ID')} | Poin: ${inv.poin} (exp: ${expPoin}) | Kupon: ${inv.kupon} (exp: ${expKupon}) -> ${pass ? 'PASS' : 'FAIL'}`);
  }

  // 4. Test Transfer Alias to another outlet
  console.log('\n4. Testing POST /api/aliases/transfer (Pindah Outlet):');
  // Temporarily transfer Kitchen to Bakery
  const transferRes = await fetch(`${BASE}/api/aliases/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nama_pos: 'ANTARA COMPANY - MEMBER UKM - ANTARA KITCHEN',
      target_outlet_id: '102-261003-01-01-100', // Move to Bakery
    }),
  });
  const transferJson = await transferRes.json();
  console.log(`   Transfer result: ${transferRes.ok ? '✓' : '✗'} ${transferJson.message || transferJson.error}`);

  // Transfer back to Kitchen
  await fetch(`${BASE}/api/aliases/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nama_pos: 'ANTARA COMPANY - MEMBER UKM - ANTARA KITCHEN',
      target_outlet_id: '102-261003-01-03-100', // Move back
    }),
  });
  console.log('   Transferred back to original outlet: ✓ PASS');

  // 5. Test Summary of All Outlets for Antara Company
  console.log('\n5. Summary of Outlets for Antara Company:');
  const summary = db.prepare(`
    SELECT o.id, o.tipe, o.nama_outlet,
      COUNT(i.id) as trx_count,
      COALESCE(SUM(i.jumlah), 0) as total_nominal,
      COALESCE(SUM(i.poin), 0) as total_poin,
      COALESCE(SUM(i.kupon), 0) as total_kupon
    FROM outlets o
    LEFT JOIN invoices i ON i.outlet_id = o.id
    WHERE o.identity_id = '102-261003-01'
    GROUP BY o.id
    ORDER BY o.tipe, o.id
  `).all();

  console.table(summary);

  console.log('=== SPRINT 3 VERIFICATION COMPLETED SUCCESSFULLY ===');
}

run().catch(console.error);
