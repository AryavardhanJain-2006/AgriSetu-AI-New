# AgriSetu AI — NEW GitHub + NEW Firebase deployment

This folder is a separate copy of your latest uploaded `AgriSetu-main.zip`, with the live camera + AI crop identification + shelf-life report feature added. It is prepared for a **new GitHub repository and a new Firebase project**. It does not edit or depend on your existing project.

## What is included

- Existing AgriSetu portal pages and workflows from the latest uploaded ZIP.
- Farmer **AI Crop Analysis** page: live camera and image upload.
- Browser-side MobileNetV2 vegetable-classification fallback (no `.pth` file, Colab retraining, paid inference API, or Python model server required).
- Shelf-life report using the crop profiles, Q10 temperature factor, humidity factor, CO2 factor, default freshness score, and risk thresholds ported from your `AgriSetu.ipynb`.
- Farmer-private AI report history and facility AI Reports for a verified accepted booking.
- A copy of the uploaded ESP32 Firebase firmware, CA roots, and safe `secrets.example.h` template.
- New Firebase config placeholders. No old Firebase project ID, API key, or database URL is retained in `firebase-config.js`.

## Important model limitations

The `.pth` weights for your custom ResNet-18 were not included. This deployment therefore uses MobileNetV2 ImageNet in the browser as a temporary classifier. The probability is the generic classifier score, not your custom model's reported accuracy. The farmer should verify the predicted crop. MobileNetV2 may not recognize all 15 notebook crop classes.

The current ESP32 reads temperature, humidity, and methane via MQ-5. Methane is not CO2. The report marks CO2 unavailable and uses the crop profile's `base_co2` as the notebook formula input when no real CO2 reading is available. The notebook's fixed visual freshness score is not a visual rot/bruise detector.

---

# Part A — Create a new Firebase project

1. Open https://console.firebase.google.com/ and choose **Add project**.
2. Give it a new name, for example `AgriSetu-AI-New`. Use a new unique Project ID. Do not select or modify your old `agrisetu-479fe` project.
3. Finish project creation. Analytics can be disabled if you do not need it.
4. In the new project, open **Build → Authentication → Get started → Sign-in method**. Enable **Email/Password** and save.
5. Open **Build → Realtime Database → Create Database**. Choose a region and create the database. Start in locked mode; you will publish the provided rules in Part C. Copy the exact database URL shown by Firebase (it may end in `firebasedatabase.app` or `firebaseio.com`).
6. In Project Overview, click **Add app → Web**. Register a web app (e.g. `AgriSetu Web`). Copy its Firebase config values.
7. Open this project's `firebase-config.js` and replace all `REPLACE_*` values with the exact values from the new Web App config and Realtime Database URL. Do not use values from the old Firebase project. Keep the three `AGRISETU_FACILITIES` entries unless you intentionally use different cold-storage IDs.
8. In **Authentication → Settings → Authorized domains**, add your new GitHub Pages domain, normally `YOUR-GITHUB-USERNAME.github.io`.

## Part B — Create a new GitHub repository

1. On GitHub, choose **New repository**. Name it something like `AgriSetu-AI-New`. This must be a new repository, not the existing AgriSetu repository.
2. Create it (public is simplest for GitHub Pages; do not place private secrets in it).
3. On your computer, extract this ZIP. Open the `AgriSetu-AI-New-Project` folder.
4. Upload the **contents of this folder** to the root of the new repository (upload `index.html`, `app.js`, `firebase-config.js`, folders, etc.; do not upload an extra enclosing folder layer).
5. Commit the files.
6. Open the new repository → **Settings → Pages**. Under Build and deployment, select **Deploy from a branch**, choose `main` and `/(root)`, then Save.
7. Wait for GitHub Pages to publish. Open the generated `https://YOUR-GITHUB-USERNAME.github.io/AgriSetu-AI-New/` URL. Use HTTPS because live camera access requires a secure context.

## Part C — Publish the new Realtime Database rules

1. Open the **new** Firebase project → Realtime Database → Rules.
2. Open this folder's `database.rules.json`, copy its entire `rules` object contents into the Rules editor as the complete rules JSON, and click **Publish**. The file is already wrapped as `{ "rules": { ... } }`; paste the full file.
3. These rules keep the database denied by default and permit only the documented authenticated paths. Do not replace them with public test mode rules.

## Part D — Set up the new cold-storage facility registration code

1. In the **new** Realtime Database → Data, create a root-level node `facilityRegistrationCodes`.
2. Add a child for each configured facility, for example:

```json
{
  "facilityRegistrationCodes": {
    "COLD_BOX_01": "PUT_A_LONG_RANDOM_CODE_HERE",
    "GREEN_FRESH_01": "PUT_ANOTHER_LONG_RANDOM_CODE_HERE",
    "YAMUNA_COLD_01": "PUT_ANOTHER_LONG_RANDOM_CODE_HERE"
  }
}
```

3. Each code must be at least 12 characters. Give a facility's code only to its authorized Cold Storage operator. Do not put these codes in GitHub or `firebase-config.js`. Add new facility IDs to `firebase-config.js` and the existing rules' permitted facility ID list before using additional facilities.

## Part E — Register accounts and assign access

1. Open the new GitHub Pages site and register a Farmer account. Email/Password authentication creates the account in the new Firebase project.
2. Register each Cold Storage operator with the exact storage name and its private facility registration code.
3. For every new account, open Firebase → Authentication → Users, copy its UID, and verify the matching `/userAccess/{UID}` record appears in Realtime Database.
4. A booking created by a farmer is written to `/storageBookings/{facilityId}/{bookingId}`. When the assigned operator accepts it, the app writes the accepted status and the farmer's `/monitoringAccess/{farmerUid}/facilityIds/{facilityId}` grant.
5. For a new administrator, create the Auth account in Firebase Authentication, copy the UID, and manually add `/userAccess/{UID}` in Realtime Database using the Firebase Console:

```json
{ "active": true, "role": "Admin" }
```

Public registration cannot create Admin accounts.

## Part F — Connect the ESP32 to the NEW Firebase project

1. Open `ESP32_Firebase/AgriSetu_ESP32_Firebase/`.
2. Copy `secrets.example.h` and rename the copy to `secrets.h`. Keep `secrets.h` local; `.gitignore` excludes it.
3. Fill `WIFI_SSID`, `WIFI_PASSWORD`, `FIREBASE_API_KEY` (from the new Firebase Web App), `FIREBASE_DATABASE_URL` (from the new Realtime Database), `DEVICE_AUTH_EMAIL`, `DEVICE_AUTH_PASSWORD`, and `FACILITY_ID`.
4. In the new Firebase project → Authentication → Users, add a dedicated device account using Email/Password. Use the same email/password in `secrets.h`.
5. Copy the device account's Firebase Auth UID. In the new Realtime Database → Data, create:

```json
{
  "deviceAccess": {
    "PASTE_DEVICE_AUTH_UID_HERE": {
      "enabled": true,
      "facilityId": "COLD_BOX_01"
    }
  }
}
```

6. Open `AgriSetu_ESP32_Firebase.ino` in Arduino IDE. Ensure `secrets.h` and `firebase_ca_roots.h` are in the same sketch folder. Install the ESP32 board package and the libraries required by the sketch (`DHT sensor library`, `ArduinoJson`, plus ESP32 built-in Wi-Fi/HTTP/Preferences libraries). Select your board and COM port, then upload.
7. Open Serial Monitor at 115200 baud. Check that the device authenticates and writes to `/facilities/COLD_BOX_01/latest`. The device prints its dynamic IPv4 address; no IP address is needed in the website because the board writes directly to Firebase.

## Part G — Test the complete workflow

1. Sign in as a Farmer. Open **Book Storage** and create a booking for one facility.
2. Sign in as the matching Cold Storage operator in another browser/device. Open **Booking Requests** and accept the booking.
3. Return to the Farmer account. Open **AI Crop Analysis**. Choose the accepted booking.
4. Allow camera access or upload a clear image of one vegetable. Wait for MobileNetV2 to load (first use requires internet). Review the suggested crop and correct it if needed.
5. Load the latest temperature/humidity from the facility sensor or enter values manually. Enter storage duration. Leave CO2 empty if you do not have a real CO2 sensor.
6. Generate the shelf-life report. The farmer sees the private report; the corresponding assigned Cold Storage operator sees its facility copy under **AI Reports**.
7. Repeat with **No booking / private report**. That report should appear only to the farmer and not to the Cold Storage Portal.

## Troubleshooting

- **Firebase not configured:** Check that no `REPLACE_*` values remain in `firebase-config.js`; verify the database URL is exact.
- **Unauthorized domain:** Add `YOUR-GITHUB-USERNAME.github.io` to Authentication → Settings → Authorized domains.
- **Camera unavailable:** Open the GitHub Pages HTTPS URL, permit camera access, and use a supported browser.
- **MobileNet fails to load:** Check internet access / CDN availability, then hard-refresh. This browser classifier requires internet on first load.
- **Sensor write denied:** Confirm device Authentication UID matches the key under `/deviceAccess`, `enabled` is true, and `facilityId` matches the sketch `FACILITY_ID`.
- **Farmer cannot view sensors:** Confirm booking status is `ACCEPTED`, the booking was created while signed in to this new Firebase project, and its facility mapping matches.
- **AI report not shared:** The farmer report must use the exact accepted booking ID, batch ID, and facility ID written to the new project's `/storageBookings` path.

## Scope and limitations

- This is a separate copy. No changes are made to your old GitHub repository or old Firebase project.
- The current AI image classifier is MobileNetV2 ImageNet fallback, not the custom ResNet-18 trained checkpoint.
- The browser identifies likely image classes; it does not grade rot, bruising, or food safety.
- The AI report uses the notebook's formulas/profiles; current MQ-5 methane is not treated as CO2.
- Most other legacy workflows remain as they were in your latest uploaded project; this deployment does not silently migrate all localStorage-only legacy records into the new Firebase project. New bookings used for shared AI reports must be created in this new project.
