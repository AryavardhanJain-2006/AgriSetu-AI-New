# AgriSetu AI — new, independent deployment

This is a separate copy of the latest AgriSetu project you uploaded, with the live-camera crop identification and shelf-life report feature added. It is intended for a **new GitHub repository and a new Firebase project**. Your previous GitHub repository and Firebase project are not modified.

## Start here

1. Read [`NEW_PROJECT_SETUP_GUIDE.md`](NEW_PROJECT_SETUP_GUIDE.md) and follow it in order.
2. Create a new Firebase project and replace the `REPLACE_*` values in `firebase-config.js` with that project's Web App configuration and Realtime Database URL.
3. Publish this folder's complete `database.rules.json` in the new Realtime Database.
4. Create a new GitHub repository and upload the contents of this folder to its root. Enable GitHub Pages from `main` / root.
5. Configure the ESP32 with the new Firebase API key, database URL and dedicated device Auth account using `ESP32_Firebase/AgriSetu_ESP32_Firebase/secrets.example.h`.

## Included features

- Existing Farmer, Cold Storage, Porter and Buyer portal pages from the latest uploaded ZIP.
- Farmer AI Crop Analysis with live camera capture and image upload.
- Browser MobileNetV2 image classification fallback.
- Notebook-derived shelf-life and spoilage report.
- Farmer-private AI report history; accepted-booking reports are also shared with the corresponding facility's AI Reports page.
- ESP32 Firebase firmware and safe credential template.

## Important limitations

The custom trained ResNet-18 `.pth` checkpoint was not included, so the browser uses MobileNetV2 ImageNet as a temporary classifier. It is not your custom trained model and may not recognize every AgriSetu crop class. The farmer should verify the suggested crop. The current MQ-5 reading is methane, not CO₂; the report must not treat it as CO₂.

Do not commit `secrets.h`, Wi-Fi passwords, device passwords, or Firebase service-account keys. The `.gitignore` excludes `secrets.h`.
