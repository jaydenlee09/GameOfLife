// ─── APEX Cloud Functions ─────────────────────────────────────────────────────
// sendPushes: every 5 minutes, decides which notifications are due for each user
// (see src/utils/pushSchedule.js) and sends them through FCM. The logic lives in
// push.js; this file only wires it to Firebase.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { GoogleGenAI } from '@google/genai';
import { MODEL } from '../../src/utils/assistantUtils';
import { runPushTick, READ_ONLY_DECLARATIONS } from './push';

initializeApp();

// Set with: firebase functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const makeGenerate = (apiKey) => {
  const ai = new GoogleGenAI({ apiKey });
  return ({ contents, systemPrompt, allowTools }) => ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 8192,
      tools: [{ functionDeclarations: READ_ONLY_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: allowTools ? 'AUTO' : 'NONE' } },
    },
  });
};

export const sendPushes = onSchedule(
  {
    schedule: 'every 5 minutes',
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 120,
    memory: '512MiB',
    retryCount: 0, // the next tick is the retry; pushes are deduped by id
  },
  async () => {
    const apiKey = GEMINI_API_KEY.value();
    const results = await runPushTick({
      db: getFirestore(),
      messaging: getMessaging(),
      generate: apiKey ? makeGenerate(apiKey) : null,
      log: (msg) => logger.warn(msg),
    });
    const sent = results.flatMap((r) => r.sent || []);
    if (sent.length) logger.info('pushes sent', { sent });
  },
);
