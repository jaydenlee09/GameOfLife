// ─── Push tick for GitHub Actions ─────────────────────────────────────────────
// Run by .github/workflows/push-notifications.yml every ~5 minutes. One run = one
// tick over every user, exactly like the Cloud Function in index.js.
//
// Secrets (GitHub repo → Settings → Secrets and variables → Actions):
//   FIREBASE_SERVICE_ACCOUNT  the JSON key file from Firebase → Project settings →
//                             Service accounts → Generate new private key
//   GEMINI_API_KEY            for the AI morning brief (optional: templates without it)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { runPushTick } from './push';
import { makeGenerate } from './gemini';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw?.trim()) {
  // Not set up yet: succeed quietly so GitHub doesn't email a failure every 5 minutes.
  console.log('FIREBASE_SERVICE_ACCOUNT secret is not set; skipping. See functions/README.md.');
  process.exit(0);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(raw);
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the whole key file, including the { }.');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });

const results = await runPushTick({
  db: getFirestore(),
  messaging: getMessaging(),
  generate: makeGenerate(process.env.GEMINI_API_KEY),
  log: (msg) => console.warn(msg),
});

const sent = results.flatMap((r) => r.sent || []);
console.log(sent.length ? `Sent: ${sent.join(', ')}` : 'Nothing due.');
