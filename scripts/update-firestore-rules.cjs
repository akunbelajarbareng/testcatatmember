/**
 * scripts/update-firestore-rules.cjs
 * Memperbarui Firestore Security Rules secara otomatis menggunakan Firebase Rules API
 */

const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

async function updateRules() {
  console.log('====================================================');
  console.log('🛡️ MEMPERBARUI FIRESTORE SECURITY RULES');
  console.log('====================================================\n');

  const keyPath = path.join(process.cwd(), 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    console.error('❌ serviceAccountKey.json tidak ditemukan.');
    process.exit(1);
  }

  const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const projectId = sa.project_id;
  console.log(`📋 Project ID: ${projectId}`);

  const auth = new GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;
  console.log('🔑 Token autentikasi Google Cloud berhasil didapatkan.');

  const rulesContent = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;

  console.log('📤 Mengunggah ruleset baru ke Firebase Rules API...');
  const createRulesetUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`;
  const createRes = await fetch(createRulesetUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: {
        files: [
          {
            name: 'firestore.rules',
            content: rulesContent,
          },
        ],
      },
    }),
  });

  const createJson = await createRes.json();
  if (!createRes.ok) {
    throw new Error(`Gagal membuat ruleset: ${JSON.stringify(createJson)}`);
  }

  const rulesetName = createJson.name;
  console.log(`✅ Ruleset berhasil dibuat: ${rulesetName}`);

  console.log('🚀 Menerapkan (*release*) ruleset ke cloud.firestore...');
  const releaseUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`;
  const releaseRes = await fetch(releaseUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      release: {
        name: `projects/${projectId}/releases/cloud.firestore`,
        rulesetName: rulesetName,
      },
    }),
  });

  const releaseJson = await releaseRes.json();
  if (!releaseRes.ok) {
    // Jika PATCH gagal karena release belum pernah dibuat, coba POST
    console.log('ℹ️ Mencoba POST release jika belum ada...');
    const postReleaseUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`;
    const postRes = await fetch(postReleaseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `projects/${projectId}/releases/cloud.firestore`,
        rulesetName: rulesetName,
      }),
    });
    const postJson = await postRes.json();
    if (!postRes.ok) {
      throw new Error(`Gagal menerapkan release: ${JSON.stringify(postJson)}`);
    }
    console.log('✅ Release berhasil diterapkan via POST!');
  } else {
    console.log('✅ Release berhasil diterapkan via PATCH!');
  }

  console.log('\n====================================================');
  console.log('🎉 FIRESTORE RULES BERHASIL DIUPDATE KE ALLOW READ, WRITE!');
  console.log('====================================================');
}

updateRules().catch(err => {
  console.error('\n❌ Gagal:', err.message);
  process.exit(1);
});
