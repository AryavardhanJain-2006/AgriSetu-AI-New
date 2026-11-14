/*
 * NEW AgriSetu Firebase project configuration.
 * Replace every REPLACE_* value with the config from your NEW Firebase Web App.
 * Do not copy the credentials from your previous AgriSetu Firebase project.
 */
window.AGRISETU_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDzBcZ5JEl-L62gS-A8pLlQq8MqMrwn_IY",
  authDomain: "agrisetu-ai-new.firebaseapp.com",
  databaseURL: "https://agrisetu-ai-new-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "agrisetu-ai-new",
  storageBucket: "agrisetu-ai-new.firebasestorage.app",
  messagingSenderId: "581986089309",
  appId: "1:581986089309:web:666857ba399d2809bb50b4"
};

/* Keep these IDs consistent with ESP32 FACILITY_ID values and Database paths. */
window.AGRISETU_FACILITIES = {
  COLD_BOX_01: { name: "Agra Cold Storage", location: "Agra", storageKey: "agra-cold-storage" },
  GREEN_FRESH_01: { name: "Green Fresh Storage", location: "Mathura", storageKey: "green-fresh-storage" },
  YAMUNA_COLD_01: { name: "Yamuna Cold Chain", location: "Firozabad", storageKey: "yamuna-cold-chain" }
};
