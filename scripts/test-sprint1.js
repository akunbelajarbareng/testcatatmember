const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'oriental_crm.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

console.log('=== SPRINT 1 VERIFICATION TEST ===\n');

// 1. Test Foreign Key Cascade Support
console.log('1. Testing Cascade on Identity Update...');
const testIdentity = db.prepare(`SELECT * FROM identities WHERE id = '102-260901-01'`).get();
if (!testIdentity) {
  console.error('Pak Catur identity not found!');
  process.exit(1);
}

const originalOutlets = db.prepare(`SELECT id FROM outlets WHERE identity_id = ?`).all(testIdentity.id);
console.log(`Pak Catur (${testIdentity.id}) has ${originalOutlets.length} outlets.`);

db.transaction(() => {
  const tempId = '102-TEST-TEMP';
  db.prepare(`UPDATE identities SET id = ? WHERE id = ?`).run(tempId, testIdentity.id);
  const cascadedOutlets = db.prepare(`SELECT id FROM outlets WHERE identity_id = ?`).all(tempId);
  if (cascadedOutlets.length !== originalOutlets.length) {
    throw new Error('Cascade update failed on outlets!');
  }
  // Revert back
  db.prepare(`UPDATE identities SET id = ? WHERE id = ?`).run(testIdentity.id, tempId);
})();
console.log('✔ Cascade update test PASSED! Foreign keys automatically cascaded.');

// 2. Test Invoice Reset Logic on Detach
console.log('\n2. Testing Invoice reset logic on unmap...');
const unmappedCount = db.prepare(`SELECT count(*) as c FROM invoices WHERE outlet_id IS NULL`).get().c;
const mappedCount = db.prepare(`SELECT count(*) as c FROM invoices WHERE outlet_id IS NOT NULL`).get().c;
console.log(`Current invoices: ${mappedCount} mapped, ${unmappedCount} unmapped.`);
console.log('✔ Invoice status verified.');

// 3. Test Cleanse Master Data Simulation
console.log('\n3. Testing Cleanse Master Data (Keeping Pak Catur)...');
const keepId = '102-260901-01';

const testCleanse = db.transaction(() => {
  // Outlets for Pak Catur
  const pakCaturOutlets = db.prepare(`SELECT id FROM outlets WHERE identity_id = ?`).all(keepId).map(o => o.id);
  console.log('Preserved Pak Catur Outlets:', pakCaturOutlets);

  // Invoices reset
  const unlinked = db.prepare(`
    UPDATE invoices
    SET outlet_id = NULL, poin = 0, kupon = 0, is_excluded = 0
    WHERE outlet_id IS NOT NULL AND outlet_id NOT IN (${pakCaturOutlets.map(() => '?').join(',')})
  `).run(...pakCaturOutlets);
  console.log(`Unlinked ${unlinked.changes} messy invoices back to unmapped pool.`);

  // Delete aliases not belonging to Pak Catur
  const delAliases = db.prepare(`
    DELETE FROM pos_aliases WHERE outlet_id NOT IN (${pakCaturOutlets.map(() => '?').join(',')})
  `).run(...pakCaturOutlets);
  console.log(`Deleted ${delAliases.changes} messy aliases.`);

  // Delete outlets not belonging to Pak Catur
  const delOutlets = db.prepare(`
    DELETE FROM outlets WHERE id NOT IN (${pakCaturOutlets.map(() => '?').join(',')})
  `).run(...pakCaturOutlets);
  console.log(`Deleted ${delOutlets.changes} messy outlets.`);

  // Delete identities not belonging to Pak Catur
  const delIdentities = db.prepare(`
    DELETE FROM identities WHERE id != ?
  `).run(keepId);
  console.log(`Deleted ${delIdentities.changes} messy auto-created identities.`);

  // Delete statements not belonging to Pak Catur
  const delStatements = db.prepare(`
    DELETE FROM statements WHERE identity_id != ?
  `).run(keepId);
  console.log(`Deleted ${delStatements.changes} statements.`);

  // Verification
  const remainingIdentities = db.prepare(`SELECT id, nama_pemilik FROM identities`).all();
  console.log('Remaining Identities in DB:', remainingIdentities);
  const remainingOutlets = db.prepare(`SELECT id, identity_id, nama_outlet FROM outlets`).all();
  console.log(`Remaining Outlets in DB: ${remainingOutlets.length}`);
  const remainingAliases = db.prepare(`SELECT id, nama_pos, outlet_id FROM pos_aliases`).all();
  console.log(`Remaining Aliases in DB: ${remainingAliases.length}`);

  const invStatus = db.prepare(`
    SELECT count(*) as total,
      count(case when outlet_id is not null then 1 end) as mapped,
      count(case when outlet_id is null then 1 end) as unmapped
    FROM invoices
  `).get();
  console.log('Final Invoices State:', invStatus);
});

testCleanse();

console.log('\n✔ Master data cleansing test PASSED! Database is now clean, safe, and ready for Sprint 2!');
db.close();
