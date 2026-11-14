#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>
#include "DHT.h"
#include "secrets.h"
#include "firebase_ca_roots.h"

// --- Pin Configuration: unchanged from the supplied prototype ---
#define DHTPIN 4
#define DHTTYPE DHT22
#define MQ5_ANALOG_PIN 34

// --- Voltage Divider Constants (R1 = 1kΩ, R2 = 2kΩ) ---
const float R1 = 1000.0;
const float R2 = 2000.0;
const float DIVIDER_RATIO = (R1 + R2) / R2;

// Live value every 5 s; one historical point every 60 s.
// This keeps the Realtime Database workload much lower than a 1.5 s history write.
const unsigned long LIVE_WRITE_INTERVAL_MS = 5000UL;
const unsigned long HISTORY_WRITE_INTERVAL_MS = 60000UL;
const unsigned long TOKEN_REFRESH_MARGIN_MS = 120000UL;
// 10,080 minute slots = 7 days. Slots are overwritten weekly to bound storage.
const uint32_t HISTORY_SLOT_COUNT = 10080UL;

DHT dht(DHTPIN, DHTTYPE);
Preferences preferences;
WiFiClientSecure secureClient;
String idToken;
String refreshToken;
String deviceUid;
unsigned long idTokenExpiresAt = 0;
unsigned long lastLiveWrite = 0;
unsigned long lastHistoryWrite = 0;
unsigned long lastClockSyncAttempt = 0;
bool clockReady = false;

String databaseBaseUrl() {
  String url = String(FIREBASE_DATABASE_URL);
  while (url.endsWith("/")) url.remove(url.length() - 1);
  return url;
}

String urlEncode(const String &value) {
  const char *hex = "0123456789ABCDEF";
  String encoded;
  for (size_t i = 0; i < value.length(); i++) {
    const uint8_t c = static_cast<uint8_t>(value[i]);
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') {
      encoded += static_cast<char>(c);
    } else {
      encoded += '%';
      encoded += hex[(c >> 4) & 0x0F];
      encoded += hex[c & 0x0F];
    }
  }
  return encoded;
}

bool postJson(const String &url, const String &payload, String &responseBody) {
  HTTPClient http;
  if (!http.begin(secureClient, url)) {
    Serial.println("HTTPS begin failed");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(12000);
  const int code = http.POST(payload);
  responseBody = code > 0 ? http.getString() : http.errorToString(code);
  Serial.printf("Firebase POST/REST response: %d\n", code);
  if (code < 200 || code >= 300) Serial.println(responseBody);
  http.end();
  return code >= 200 && code < 300;
}

bool authenticateDevice() {
  StaticJsonDocument<384> requestDoc;
  requestDoc["email"] = DEVICE_AUTH_EMAIL;
  requestDoc["password"] = DEVICE_AUTH_PASSWORD;
  requestDoc["returnSecureToken"] = true;
  String body;
  serializeJson(requestDoc, body);

  const String url = String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + FIREBASE_API_KEY;
  String response;
  if (!postJson(url, body, response)) {
    Serial.println("Firebase device sign-in failed. Check device email/password and API key.");
    return false;
  }

  StaticJsonDocument<1536> responseDoc;
const DeserializationError error = deserializeJson(responseDoc, response);

if (error ||
    !responseDoc["idToken"].is<const char *>() ||
    !responseDoc["refreshToken"].is<const char *>() ||
    !responseDoc["localId"].is<const char *>()) {

  Serial.println("Could not parse Firebase sign-in response.");
  return false;
}

idToken = responseDoc["idToken"].as<String>();
refreshToken = responseDoc["refreshToken"].as<String>();

// Get the actual authenticated Firebase UID
deviceUid = responseDoc["localId"].as<String>();

Serial.println("--------------------------------");
Serial.println("FIREBASE AUTHENTICATION SUCCESS");
Serial.print("Authenticated Device UID: ");
Serial.println(deviceUid);
Serial.println("--------------------------------");
  const unsigned long seconds = responseDoc["expiresIn"].as<String>().toInt() > 0
      ? responseDoc["expiresIn"].as<String>().toInt() : 3600UL;
  idTokenExpiresAt = millis() + seconds * 1000UL;
  preferences.putString("refreshToken", refreshToken);
  Serial.println("Firebase device authenticated.");
  return true;
}

bool refreshDeviceToken() {
  if (refreshToken.isEmpty()) return authenticateDevice();
  const String form = String("grant_type=refresh_token&refresh_token=") + urlEncode(refreshToken);
  HTTPClient http;
  const String url = String("https://securetoken.googleapis.com/v1/token?key=") + FIREBASE_API_KEY;
  if (!http.begin(secureClient, url)) return false;
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");
  http.setTimeout(12000);
  const int code = http.POST(form);
  const String response = code > 0 ? http.getString() : http.errorToString(code);
  http.end();
  if (code < 200 || code >= 300) {
    Serial.printf("Token refresh failed: HTTP %d\n", code);
    Serial.println(response);
    idToken = "";
    return authenticateDevice();
  }

  StaticJsonDocument<1536> responseDoc;
  if (deserializeJson(responseDoc, response)) return false;
  idToken = responseDoc["id_token"].as<String>();
  refreshToken = responseDoc["refresh_token"].as<String>();
  const unsigned long seconds = responseDoc["expires_in"].as<String>().toInt() > 0
      ? responseDoc["expires_in"].as<String>().toInt() : 3600UL;
  if (idToken.isEmpty() || refreshToken.isEmpty()) return false;
  idTokenExpiresAt = millis() + seconds * 1000UL;
  preferences.putString("refreshToken", refreshToken);
  Serial.println("Firebase ID token refreshed.");
  return true;
}

bool ensureDeviceToken() {
  if (idToken.isEmpty()) {
    if (!refreshToken.isEmpty()) return refreshDeviceToken();
    return authenticateDevice();
  }
  // Rollover-safe millis comparison.
  if ((long)(idTokenExpiresAt - millis()) <= (long)TOKEN_REFRESH_MARGIN_MS) {
    return refreshDeviceToken();
  }
  return true;
}

String makeReadingJson(float temperature, float humidity, float methane,
                       int rawADC, float sensorVoltage, unsigned long deviceTime) {
  StaticJsonDocument<512> doc;
  doc["facility_id"] = FACILITY_ID;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["methane_ppm"] = methane;
  doc["raw_adc"] = rawADC;
  doc["sensor_voltage"] = sensorVoltage;
  doc["device_timestamp_ms"] = deviceTime;
  // Use a numeric Unix timestamp in milliseconds. This directly satisfies
  // the Realtime Database rule: received_at must be a number greater than 0.
  const uint64_t receivedAtMs = static_cast<uint64_t>(time(nullptr)) * 1000ULL;
  doc["received_at"] = receivedAtMs;
  String payload;
  serializeJson(doc, payload);
  return payload;
}

bool writeFirebasePath(const String &path, const String &payload, const char *method) {
  if (!ensureDeviceToken()) {
    Serial.println("No valid Firebase ID token; data not sent.");
    return false;
  }

  Serial.print("Authenticated Firebase UID used for write: ");
  Serial.println(deviceUid.length() ? deviceUid : String("(not printed yet; inspect initial sign-in log)"));

  const String url = databaseBaseUrl() + path + ".json?auth=" + urlEncode(idToken);
  HTTPClient http;
  if (!http.begin(secureClient, url)) {
    Serial.println("Could not open Firebase Realtime Database HTTPS connection.");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(12000);
  Serial.println("Firebase write diagnostic:");
Serial.print("Target path: ");
Serial.println(path);

Serial.println("Payload:");
Serial.println(payload);
  int code = (strcmp(method, "PUT") == 0) ? http.PUT(payload) : http.POST(payload);
  String response = code > 0 ? http.getString() : http.errorToString(code);
  http.end();

  // Firebase returns this exact response when a valid request is denied by
  // Realtime Database Security Rules. Refreshing the same user's token cannot
  // fix a UID/facility/rule mismatch, so report it directly instead of retrying.
  if (code == 401 && response.indexOf("Permission denied") >= 0) {
    Serial.println("Database rules rejected this write (Permission denied).");
    Serial.println("Compare the UID printed above with the child key under /deviceAccess.");
    Serial.println("Also confirm facilityId is exactly COLD_BOX_01 and rules are published.");
    Serial.println("The ID token was accepted far enough to reach the database rules; refreshing it will not fix this denial.");
  } else if (code == 401) {
    Serial.println("Firebase returned 401 for an authentication/token error. Refreshing token once.");
    if (!refreshDeviceToken()) return false;
    const String retryUrl = databaseBaseUrl() + path + ".json?auth=" + urlEncode(idToken);
    if (!http.begin(secureClient, retryUrl)) return false;
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(12000);
    code = (strcmp(method, "PUT") == 0) ? http.PUT(payload) : http.POST(payload);
    response = code > 0 ? http.getString() : http.errorToString(code);
    http.end();
  }

  if (code >= 200 && code < 300) return true;
  Serial.printf("Firebase write failed. HTTP %d\n", code);
  Serial.println(response);
  if (code == 401 || code == 403) {
    Serial.println("Check Firebase Auth device account, deviceAccess UID mapping and database rules.");
  }
  return false;
}

bool syncClock() {
  lastClockSyncAttempt = millis();
  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
  struct tm timeInfo;
  if (getLocalTime(&timeInfo, 15000)) {
    const time_t epoch = time(nullptr);
    if (epoch > 1700000000) {
      clockReady = true;
      Serial.println("System clock synchronized; HTTPS certificate validation is ready.");
      return true;
    }
  }
  clockReady = false;
  Serial.println("NTP time sync failed. Firebase HTTPS writes will wait until time is valid.");
  return false;
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 30000UL) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Wi-Fi connected.");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi connection timed out; will retry in loop.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  dht.begin();
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  // TLS certificate validation is enabled. Do not replace with setInsecure().
  secureClient.setCACert(FIREBASE_ROOT_CA_BUNDLE);

  preferences.begin("agrisetu-fb", false);

// Clear the previously saved Firebase refresh token.
// This forces a fresh login using secrets.h.
preferences.remove("refreshToken");

refreshToken = "";

Serial.println("Old Firebase token cleared.");
Serial.println("A fresh device login will be performed.");

connectWiFi();
  if (WiFi.status() == WL_CONNECTED) syncClock();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    delay(1000);
    return;
  }

  if (!clockReady) {
    if (millis() - lastClockSyncAttempt >= 30000UL) syncClock();
    delay(250);
    return;
  }

  const time_t currentEpoch = time(nullptr);
  if (currentEpoch <= 1700000000) {
    clockReady = false;
    return;
  }

  const unsigned long now = millis();
  if (now - lastLiveWrite < LIVE_WRITE_INTERVAL_MS) {
    delay(50);
    return;
  }
  lastLiveWrite = now;

  // 1. Read environmental sensors.
  const float temperature = dht.readTemperature();
  const float humidity = dht.readHumidity();

  // 2. Read MQ-5 ADC using the original 1kΩ / 2kΩ voltage divider.
  const int rawGasADC = analogRead(MQ5_ANALOG_PIN);
  const float pinVoltage = (rawGasADC / 4095.0f) * 3.3f;
  const float actualSensorVoltage = pinVoltage * DIVIDER_RATIO;

  // 3. Original dynamic gas estimate calculation: retained unchanged.
  const float v_clean_air = 0.4f;
  float gasPPM = 1.9f;
  if (actualSensorVoltage > v_clean_air) {
    const float deltaV = actualSensorVoltage - v_clean_air;
    gasPPM = 1.9f + (deltaV * 65.0f) + (deltaV * deltaV * 30.0f);
    if (gasPPM > 500.0f) gasPPM = 500.0f;
  } else {
    gasPPM = 1.9f - ((v_clean_air - actualSensorVoltage) * 0.5f);
    if (gasPPM < 1.0f) gasPPM = 1.0f;
  }

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Warning: Failed to read from DHT22 sensor; skipped this upload.");
    return;
  }

  Serial.printf("Facility: %s | Temp: %.1f C | Hum: %.1f %% | ADC: %d | Pin: %.2f V | Sensor: %.2f V | Gas estimate: %.1f ppm\n",
                FACILITY_ID, temperature, humidity, rawGasADC,
                pinVoltage, actualSensorVoltage, gasPPM);

  const String payload = makeReadingJson(temperature, humidity, gasPPM,
                                         rawGasADC, actualSensorVoltage, now);

  // Latest value is overwritten every 5 seconds for the live dashboard.
  const String latestPath = String("/facilities/") + FACILITY_ID + "/latest";
  if (writeFirebasePath(latestPath, payload, "PUT")) {
    Serial.println("Latest sensor reading saved to Firebase.");
  }

  // Historical data is appended once per minute to reduce free-tier write usage.
  if (now - lastHistoryWrite >= HISTORY_WRITE_INTERVAL_MS) {
    lastHistoryWrite = now;
    const uint32_t slot = (uint32_t)((currentEpoch / 60) % HISTORY_SLOT_COUNT);
    const String historyPath = String("/facilities/") + FACILITY_ID + "/history/slot_" + String(slot);
    if (writeFirebasePath(historyPath, payload, "PUT")) {
      Serial.printf("Historical sensor sample saved to rolling 7-day slot %lu.\n", (unsigned long)slot);
    }
  }
}
