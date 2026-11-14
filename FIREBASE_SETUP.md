# Firebase setup for the NEW AgriSetu AI deployment

This project must connect to a new Firebase project, separate from the previous AgriSetu deployment.

Follow [`NEW_PROJECT_SETUP_GUIDE.md`](NEW_PROJECT_SETUP_GUIDE.md), especially:

- Part A: create a new Firebase project, enable Email/Password Authentication, create Realtime Database, register the Web App and fill `firebase-config.js`.
- Part C: publish the complete `database.rules.json` file in the new Realtime Database.
- Part D: add private facility registration codes.
- Part E: register users and assign administrator access.
- Part F: create a dedicated ESP32 Authentication account and add its `/deviceAccess/{uid}` record.

The new `firebase-config.js` intentionally contains `REPLACE_*` placeholders. Do not use the old project's API key, project ID, auth domain, or database URL. Do not use Firebase public test mode.
