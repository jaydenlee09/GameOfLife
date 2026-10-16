# APEX push notifications

`sendPushes` runs every 5 minutes. For each user with notifications on, it decides
what's due (`src/utils/pushSchedule.js`), writes the morning brief with Gemini
(read-only tools), and sends everything through Firebase Cloud Messaging to the
installed web app.

| Push | Default time | Sent when |
|---|---|---|
| Morning brief | 07:30 | Always (AI-written; template if Gemini fails or the in-app brief already ran) |
| Commitment check | 13:00 | Yesterday's commitment isn't marked kept/missed |
| Daily Log reminder | 20:30 | Today's log is empty, or filled but not submitted for review |
| Streak at risk | 21:00 | Same rules as the in-app streak/habit nudges (18:00 at the earliest) |
| Time block heads-up | 10 min before | Each time block / No Phone block that isn't done |

Times are set per user in **My Assistant → Alerts**, in the timezone of the device that turned
notifications on.

## One-time setup

1. **Upgrade Firebase to Blaze.** Cloud Functions need the pay-as-you-go plan: Firebase console →
   ⚙ → *Usage and billing* → *Details & settings* → *Modify plan*. Then add a budget alert
   (e.g. $1) in Google Cloud Billing → *Budgets & alerts*. Expected cost at one user is $0. One
   scheduler job (3 free), ~8,600 invocations a month (2M free), and ~6k Firestore reads a day
   (50k free).

2. **Create the web push key.** Firebase console → ⚙ *Project settings* → *Cloud Messaging* →
   *Web Push certificates* → *Generate key pair*. Copy the key into:
   - your local `.env` as `VITE_FIREBASE_VAPID_KEY=...`
   - your website host's environment variables (same name), then redeploy the site.

3. **Install the Firebase CLI and sign in:**
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

4. **Give the function a Gemini key** (use the key that works on your deployed site):
   ```bash
   firebase functions:secrets:set GEMINI_API_KEY
   ```

5. **Deploy** (from the project root; it builds `functions/lib` first):
   ```bash
   firebase deploy --only functions
   ```
   The first deploy may ask to enable Cloud Functions, Cloud Build, Artifact Registry, Cloud
   Scheduler and Secret Manager. Say yes.

6. **Firestore rules.** The app writes `users/{uid}/data/gameOfLife_pushSettings` and reads
   `users/{uid}/data/gameOfLife_pushState`. If your rules already allow a signed-in user to
   read/write their own `users/{uid}/**`, nothing to do.

## On your iPhone (iOS 16.4+)

1. Open the deployed APEX site in **Safari** → *Share* → **Add to Home Screen**.
2. Open APEX **from the Home Screen icon** and sign in.
3. *My Assistant* → **Alerts** → **Turn on** → *Allow*.
4. Tap **Send a test**. It arrives within 5 minutes (the next scheduler tick).

## Troubleshooting

```bash
firebase functions:log --only sendPushes
```

- No test push: check the log for `send … failed`. A `registration-token-not-registered` token is
  removed automatically; turn notifications off and on again in Alerts.
- Build fails with a lucide-react error: the build stubs that package (see `build.mjs`), so check
  that `src/utils` didn't start importing some other browser-only module.
