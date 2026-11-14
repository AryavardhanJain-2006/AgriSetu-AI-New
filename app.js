# AgriSetu AI camera + shelf-life report integration

This update adds only the requested AI Crop Analysis / AI Reports flow to the supplied project.

## Files changed / added

- `index.html`: loads the isolated AI stylesheet, TensorFlow.js, MobileNet model package, and AI integration script.
- `app.js`: adds Farmer `AI Crop Analysis` and Cold Storage `AI Reports` navigation routes.
- `firebase-integration.js`: adds authorized sensor reads and secure AI report save/load functions.
- `database.rules.json`: adds owner-private farmer reports and facility-only report visibility for accepted bookings.
- `ai-crop-analysis.js` and `ai-crop-analysis.css`: new AI interface and browser-side logic.

All other app features and existing Firebase booking/sensor logic are retained.

## How to use

1. Upload the updated project folder contents to the same GitHub repository root.
2. In Firebase Console → Realtime Database → Rules, publish the complete updated `database.rules.json`.
3. Open the AgriSetu website over HTTPS and sign in as an approved Farmer.
4. Open **AI Crop Analysis**, allow camera access or upload a photo, verify the crop suggestion, and select an accepted booking or choose unbooked produce.
5. For an accepted booking, use **Load Latest Sensors** to fetch authorized facility temperature and humidity. For unbooked produce, enter these values manually.
6. Enter storage duration in days and optional CO₂ if a real CO₂ reading is available. The current ESP32 project sends methane, not CO₂; methane is not substituted for CO₂. When CO₂ is absent, the exact notebook calculation uses the crop profile's `base_co2`, resulting in a neutral CO₂ factor.
7. Generate the report. Booked reports are written to the Farmer's private report list and the matching facility's report list. Unbooked reports are written only to the Farmer's private report list.
8. The corresponding Cold Storage account opens **AI Reports** to see only reports for its assigned facility.

## Classifier limitation

The custom trained ResNet-18 checkpoint is not present in the supplied ZIP or notebook attachment, so this integration uses the pre-trained MobileNetV2 ImageNet classifier in the browser as a fallback. It returns general ImageNet labels and probability scores, not the AgriSetu 15-class ResNet result. Only labels that map to the 15 AgriSetu crop names are auto-selected; the farmer must verify/correct the crop. Some AgriSetu crops may not be recognized by ImageNet, in which case manual crop selection is required.

MobileNetV2 can classify browser image/video/canvas elements using TensorFlow.js. The model and library are fetched from their CDNs on first use, so an internet connection is required for first-time model loading. Live camera use requires HTTPS and browser camera permission.

## Shelf-life formula retained from `AgriSetu.ipynb`, Cell 7

- Same six explicit crop profiles and same `DEFAULT_PROFILE`.
- Same `visual_freshness_score=0.98` default.
- Same Q10 temperature acceleration, humidity stress factor, CO₂ stress factor, combined degradation, remaining shelf-life calculation, spoilage rate, and risk thresholds.
- The image classifier identifies the crop only; it does not assess visible rot/freshness. The notebook's fixed 0.98 freshness score is kept unchanged.

## Sensor data notes

- Temperature and humidity are fetched from `/facilities/{facilityId}/latest` for a farmer who has monitoring authorization or the cold-storage operator assigned to that facility.
- The existing ESP32 feed has methane (`methane_ppm`), not CO₂ (`co2_ppm`). This integration never treats methane as CO₂. If measured CO₂ is not present, it displays CO₂ unavailable and supplies the crop's notebook `base_co2` only as the formula input.
- Storage duration is prefilled from `storageReceivedAt` when locally available; it remains editable because some older/shared booking data may not include a receipt timestamp.

## Verification

`app.js`, `firebase-integration.js`, and `ai-crop-analysis.js` should pass `node --check`. `database.rules.json` should parse as JSON. Static checks do not prove the external classifier CDN, browser camera permissions, or live Firebase security rules are configured; test one accepted booking and one unbooked report after deployment.
