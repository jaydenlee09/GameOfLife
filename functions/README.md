# APEX push notifications

Every ~5 minutes, GitHub Actions runs `.github/workflows/push-notifications.yml`. For each user
with notifications on, it decides what's due (`src/utils/pushSchedule.js`), writes the morning brief
with Gemini (read-only tools), and sends everything through Firebase Cloud Messaging to the
installed web app. It's free because the repo is public, and it needs no card on file.

| Push | Default time | Sent when |
|---|---|---|
| Morning brief | 07:30 | Always (AI-written; template if Gemini fails or the in-app brief already ran) |
| Commitment check | 13:00 | Yesterday's commitment isn't marked kept/missed |
| Daily Log reminder | 20:30 | Today's log is empty, or filled but not submitted for review |
| Streak at risk | 21:00 | Same rules as the in-app streak/habit nudges (18:00 at the earliest) |
| Time block heads-up | 20 min before | Each time block / No Phone block that isn't done |

GitHub often starts scheduled runs 5–20 minutes late, so pushes can be a little late. Daily
pushes have a window of a few hours, and a block that started up to 5 minutes ago still gets a
"starting now" push. Times are set in **My Assistant → Alerts**, in the timezone of the device that
turned notifications on.

## One-time setup (about 10 minutes, all in the browser)

1. **Web push key → your site.** Firebase console → ⚙ *Project settings* → *Cloud Messaging* →
   *Web Push certificates* → **Generate key pair**. Copy the key and add it as
   `VITE_FIREBASE_VAPID_KEY` in:
   - your website host's environment variables, then redeploy the site
   - your local `.env` (only needed for local testing)

2. **Server key → GitHub.** Firebase console → ⚙ *Project settings* → *Service accounts* →
   **Generate new private key**. A `.json` file downloads.
   - GitHub → this repo → *Settings* → *Secrets and variables* → *Actions* → **New repository
     secret**, named `FIREBASE_SERVICE_ACCOUNT`. Open the `.json` file in a text editor and paste
     **all** of it, including the `{ }`.
   - Then delete the downloaded file. It has full admin access to your Firebase project, so never
     commit it or share it.

3. **Gemini key → GitHub** (for the AI morning brief): another repository secret named
   `GEMINI_API_KEY`, set to the key that works on your deployed site. Without it the morning push
   uses a plain template.

4. **Firestore rules.** The app writes `users/{uid}/data/gameOfLife_pushSettings` and reads
   `users/{uid}/data/gameOfLife_pushState`. If your rules already let a signed-in user read and write
   their own `users/{uid}/**`, there's nothing to do.

## On your iPhone (iOS 16.4+)

1. Open the deployed APEX site in **Safari** → *Share* → **Add to Home Screen**.
2. Open APEX **from the Home Screen icon** and sign in.
3. *My Assistant* → **Alerts** → **Turn on** → *Allow*.
4. Tap **Send a test**. To skip the wait, go to GitHub → *Actions* → *Push notifications* →
   **Run workflow**. Otherwise the test arrives on the next scheduled run (usually within 5–20 minutes).

## Keeping it running

- GitHub **pauses scheduled workflows after 60 days with no commits** to the repo. You'll get an
  email; re-enable it from the *Actions* tab (or push any commit).
- Run history and logs: GitHub → *Actions* → *Push notifications*. A run that says
  "FIREBASE_SERVICE_ACCOUNT secret is not set; skipping" means step 2 isn't done yet.
- A `registration-token-not-registered` warning is handled automatically (that device is removed).
  Turn notifications off and on again in Alerts if a device stops receiving.

## Optional: Firebase Cloud Functions (on-time delivery)

`src/index.js` runs the exact same tick as a Firebase scheduled function, which fires on time,
every time. It needs the Blaze plan (card on file; ~$0 at this usage, so set a budget alert). To
switch:

```bash
npm install -g firebase-tools
firebase login
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions
```

Then disable the GitHub workflow (*Actions* → *Push notifications* → ⋯ → *Disable workflow*), so the
two don't both send. Dedupe makes a double send unlikely, but not impossible.
