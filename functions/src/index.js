// ─── APEX Cloud Functions (optional) ──────────────────────────────────────────
// Push notifications currently run from GitHub Actions (src/cli.js). This is the
// same tick as a Firebase scheduled function, for on-time delivery if you ever
// move to the Blaze plan — see README.md. The logic lives in push.js.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { runPushTick } from './push';
import { makeGenerate } from './gemini';

initializeApp();

// Set with: firebase functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

export const sendPushes = onSchedule(
  {
    schedule: 'every 5 minutes',
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 120,
    memory: '512MiB',
    retryCount: 0, // the next tick is the retry; pushes are deduped by id
  },
  async () => {
    const results = await runPushTick({
      db: getFirestore(),
      messaging: getMessaging(),
      generate: makeGenerate(GEMINI_API_KEY.value()),
      log: (msg) => logger.warn(msg),
    });
    const sent = results.flatMap((r) => r.sent || []);
    if (sent.length) logger.info('pushes sent', { sent });
  },
);
