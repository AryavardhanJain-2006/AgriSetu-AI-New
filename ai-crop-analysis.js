/* AgriSetu AI Crop Analysis - camera + fallback browser classifier + notebook formula. */
(function () {
  "use strict";

  const CROPS = ["Bean", "Bitter_Gourd", "Bottle_Gourd", "Brinjal", "Broccoli", "Cabbage", "Capsicum", "Carrot", "Cauliflower", "Cucumber", "Papaya", "Potato", "Pumpkin", "Radish", "Tomato"];

  // Exact profiles and default profile copied from AgriSetu.ipynb, Cell 7.
  const CROP_AGRONOMY_PROFILES = {
    Tomato: { opt_temp: 12.0, opt_rh: 90.0, base_shelf_days: 14.0, q10: 2.2, base_co2: 450 },
    Potato: { opt_temp: 7.0, opt_rh: 92.0, base_shelf_days: 90.0, q10: 1.8, base_co2: 420 },
    Carrot: { opt_temp: 2.0, opt_rh: 95.0, base_shelf_days: 28.0, q10: 2.0, base_co2: 430 },
    Capsicum: { opt_temp: 8.0, opt_rh: 90.0, base_shelf_days: 18.0, q10: 2.1, base_co2: 460 },
    Broccoli: { opt_temp: 1.0, opt_rh: 95.0, base_shelf_days: 10.0, q10: 2.5, base_co2: 500 },
    Cucumber: { opt_temp: 11.0, opt_rh: 95.0, base_shelf_days: 12.0, q10: 2.2, base_co2: 440 }
  };
  const DEFAULT_PROFILE = { opt_temp: 8.0, opt_rh: 90.0, base_shelf_days: 14.0, q10: 2.0, base_co2: 450 };

  const LABEL_MAP = [
    [/\b(bitter melon|bitter gourd)\b/i, "Bitter_Gourd"],
    [/\b(bottle gourd|calabash)\b/i, "Bottle_Gourd"],
    [/\b(eggplant|aubergine)\b/i, "Brinjal"],
    [/\bbroccoli\b/i, "Broccoli"],
    [/\b(head cabbage|cabbage)\b/i, "Cabbage"],
    [/\b(bell pepper|sweet pepper|capsicum)\b/i, "Capsicum"],
    [/\bcarrot\b/i, "Carrot"],
    [/\bcauliflower\b/i, "Cauliflower"],
    [/\b(cucumber|gherkin|zucchini)\b/i, "Cucumber"],
    [/\b(papaya|papaw)\b/i, "Papaya"],
    [/\bpotato\b/i, "Potato"],
    [/\b(pumpkin|butternut squash|acorn squash|spaghetti squash)\b/i, "Pumpkin"],
    [/\bradish\b/i, "Radish"],
    [/\btomato\b/i, "Tomato"],
    [/\b(bean|green bean|runner bean)\b/i, "Bean"]
  ];

  state.aiImageDataUrl = state.aiImageDataUrl || "";
  state.aiImageName = state.aiImageName || "";
  state.aiImagePredictions = state.aiImagePredictions || [];
  state.aiSuggestedCrop = state.aiSuggestedCrop || "";
  state.aiMatchedLabel = state.aiMatchedLabel || "";
  state.aiClassifierConfidence = Number(state.aiClassifierConfidence || 0);
  state.aiSelectedBooking = state.aiSelectedBooking || "";
  state.aiSensorReading = state.aiSensorReading || null;
  state.aiReports = state.aiReports || [];
  state.aiReportsLoadedFor = state.aiReportsLoadedFor || "";
  state.aiReportsLoading = false;
  state.aiCameraStream = null;
  let mobilenetModel = null;
  let modelPromise = null;

  function h(value) { return typeof escapeHtml === "function" ? escapeHtml(String(value ?? "")) : String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function asNumber(id) { const raw = document.getElementById(id)?.value; return raw === "" || raw == null ? null : Number(raw); }
  function aiUid() { return state.firebaseUser?.uid || ""; }
  function aiAcceptedBookings() {
    if (state.role !== "Farmer") return [];
    const sources = [];
    try { sources.push(...(typeof getFarmerBookings === "function" ? getFarmerBookings() : [])); } catch (_) {}
    try { sources.push(...(typeof readStore === "function" ? readStore("bookings", []) : [])); } catch (_) {}
    const byId = new Map();
    sources.forEach(b => { if (b && b.id) byId.set(String(b.id), { ...(byId.get(String(b.id)) || {}), ...b }); });
    return [...byId.values()].filter(b =>
      b.status === "ACCEPTED" || b.storageAccepted === true || b.jobStatus === "STORED" || b.status === "STORED"
    ).map(b => ({ ...b, facilityId: b.facilityId || (window.resolveMonitoringFacilityId ? window.resolveMonitoringFacilityId(b) : "") }))
      .filter(b => b.facilityId && b.batchId);
  }

  function estimateCropShelfLife(cropName, tempCelsius, humidityPct, co2Ppm, daysAlreadyStored = 0, visualFreshnessScore = 0.98) {
    const profile = CROP_AGRONOMY_PROFILES[cropName] || DEFAULT_PROFILE;
    const tempDiff = Math.max(0.0, tempCelsius - profile.opt_temp);
    const tempAccel = Math.pow(profile.q10, tempDiff / 10.0);
    const rhDiff = Math.abs(humidityPct - profile.opt_rh);
    const rhAccel = 1.0 + (rhDiff / 100.0) * 1.5;
    const co2Ratio = Math.max(1.0, co2Ppm / profile.base_co2);
    const co2Accel = 1.0 + (co2Ratio - 1.0) * 0.4;
    const totalDegradationRate = tempAccel * rhAccel * co2Accel;
    const effectiveBaseShelf = profile.base_shelf_days * visualFreshnessScore;
    const remainingShelfLife = Math.max(0.0, (effectiveBaseShelf - daysAlreadyStored) / totalDegradationRate);
    const dailySpoilageRate = Math.min(100.0, (1.0 / Math.max(0.5, remainingShelfLife)) * 100.0);
    let riskLevel, recommendation;
    if (remainingShelfLife <= 3.0 || dailySpoilageRate >= 30.0) {
      riskLevel = "HIGH RISK";
      recommendation = `⚠️ High Spoilage Risk! Produce will degrade within ${remainingShelfLife.toFixed(1)} days. Move to Marketplace or Porter immediately.`;
    } else if (remainingShelfLife <= 6.0) {
      riskLevel = "MEDIUM RISK";
      recommendation = "🟡 Moderate Risk. Storage condition deviations detected. Monitor cooling system.";
    } else {
      riskLevel = "LOW RISK (SAFE)";
      recommendation = "🟢 Produce is in optimal storage conditions.";
    }
    return {
      crop: cropName,
      remaining_shelf_life_days: Number(remainingShelfLife.toFixed(1)),
      spoilage_rate_pct_day: Number(dailySpoilageRate.toFixed(1)),
      risk_level: riskLevel,
      recommendation,
      temp_accel: Number(tempAccel.toFixed(2)),
      profile
    };
  }

  async function loadMobileNet() {
    if (mobilenetModel) return mobilenetModel;
    if (modelPromise) return modelPromise;
    if (!window.mobilenet || !window.tf) throw new Error("The browser image classifier did not load. Refresh the page with an internet connection and try again.");
    modelPromise = window.mobilenet.load({ version: 2, alpha: 1.0 });
    try { mobilenetModel = await modelPromise; return mobilenetModel; }
    catch (error) { modelPromise = null; throw error; }
  }

  function stopAICamera() {
    if (state.aiCameraStream) state.aiCameraStream.getTracks().forEach(track => track.stop());
    state.aiCameraStream = null;
  }

  window.aiStartCamera = async function () {
    const status = document.getElementById("ai-camera-status");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Live camera requires HTTPS and a browser that supports camera access. You can upload an image instead.");
      stopAICamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      state.aiCameraStream = stream;
      const video = document.getElementById("ai-camera-video");
      if (!video) { stopAICamera(); return; }
      const preview = document.getElementById("ai-image-preview");
      const placeholder = document.querySelector(".ai-camera-placeholder");
      if (preview) preview.hidden = true;
      if (placeholder) placeholder.hidden = true;
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      if (status) status.textContent = "Camera is live. Place one vegetable in the frame and capture it.";
    } catch (error) {
      if (status) status.textContent = error.message || "Camera could not be started.";
    }
  };

  window.aiCapturePhoto = function () {
    const video = document.getElementById("ai-camera-video");
    if (!video || !video.videoWidth) return alert("Start the camera first.");
    const canvas = document.getElementById("ai-capture-canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    state.aiImageDataUrl = canvas.toDataURL("image/jpeg", 0.88);
    state.aiImageName = "Live camera capture";
    stopAICamera();
    video.hidden = true;
    const preview = document.getElementById("ai-image-preview");
    const placeholder = document.querySelector(".ai-camera-placeholder");
    preview.src = state.aiImageDataUrl;
    preview.hidden = false;
    if (placeholder) placeholder.hidden = true;
    const status = document.getElementById("ai-camera-status");
    if (status) status.textContent = "Photo captured. Identifying the crop…";
    window.aiClassifyCurrentImage();
  };

  window.aiHandleImageUpload = function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please choose an image file.");
    if (file.size > 10 * 1024 * 1024) return alert("Please choose an image smaller than 10 MB.");
    stopAICamera();
    const reader = new FileReader();
    reader.onload = () => {
      state.aiImageDataUrl = String(reader.result || "");
      state.aiImageName = file.name;
      const preview = document.getElementById("ai-image-preview");
      const placeholder = document.querySelector(".ai-camera-placeholder");
      preview.src = state.aiImageDataUrl;
      preview.hidden = false;
      if (placeholder) placeholder.hidden = true;
      const status = document.getElementById("ai-camera-status");
      if (status) status.textContent = "Image uploaded. Identifying the crop…";
      window.aiClassifyCurrentImage();
    };
    reader.onerror = () => alert("Could not read this image. Please try another file.");
    reader.readAsDataURL(file);
  };

  window.aiClassifyCurrentImage = async function () {
    if (!state.aiImageDataUrl) return alert("Capture or upload a produce image first.");
    const status = document.getElementById("ai-camera-status");
    const image = document.getElementById("ai-image-preview");
    state.aiSuggestedCrop = "";
    state.aiMatchedLabel = "";
    state.aiClassifierConfidence = 0;
    state.aiImagePredictions = [];
    const cropSelect = document.getElementById("ai-crop");
    if (cropSelect) cropSelect.value = "";
    const top = document.getElementById("ai-top-predictions");
    if (top) top.innerHTML = "";
    if (status) status.textContent = "Loading the browser image model and analysing the image…";
    try {
      if (!image.complete || !image.naturalWidth) await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      const model = await loadMobileNet();
      const predictions = await model.classify(image, 5);
      state.aiImagePredictions = predictions;
      let match = null;
      for (const prediction of predictions) {
        const mapped = LABEL_MAP.find(([regex]) => regex.test(prediction.className));
        if (mapped) { match = { crop: mapped[1], probability: prediction.probability, label: prediction.className }; break; }
      }
      if (match) {
        state.aiSuggestedCrop = match.crop;
        state.aiMatchedLabel = match.label;
        state.aiClassifierConfidence = match.probability;
        const cropSelect = document.getElementById("ai-crop");
        if (cropSelect) cropSelect.value = match.crop;
        if (status) status.textContent = `Suggested crop: ${match.crop} · ${ (match.probability * 100).toFixed(1) }% ImageNet score (${match.label}). Please verify the selected crop.`;
      } else {
        state.aiSuggestedCrop = "";
        state.aiMatchedLabel = "";
        state.aiClassifierConfidence = 0;
        if (status) status.textContent = "The fallback model did not return a supported AgriSetu vegetable label. Please select the crop manually from the list.";
      }
      const top = document.getElementById("ai-top-predictions");
      if (top) top.innerHTML = predictions.map(p => `<span class="ai-pred-chip">${h(p.className)} ${(p.probability * 100).toFixed(1)}%</span>`).join("");
    } catch (error) {
      state.aiSuggestedCrop = "";
      state.aiMatchedLabel = "";
      state.aiClassifierConfidence = 0;
      if (status) status.textContent = error.message || "Image classification failed. You can still select the crop manually.";
    }
  };

  window.aiBookingChanged = async function () {
    const picker = document.getElementById("ai-booking");
    const optionIndex = picker ? picker.value : "";
    const bookings = state.aiBookingOptions || [];
    const booking = optionIndex === "" ? null : bookings[Number(optionIndex)];
    state.aiSelectedBooking = booking ? String(booking.id) : "";
    state.aiSensorReading = null;
    const status = document.getElementById("ai-sensor-status");
    const duration = document.getElementById("ai-storage-days");
    const facility = document.getElementById("ai-facility-label");
    if (!booking) {
      if (facility) facility.textContent = "Unbooked produce · report will remain private to your farmer account.";
      if (duration) duration.value = "0";
      if (status) status.textContent = "Enter temperature and humidity manually for unbooked produce.";
      return;
    }
    if (facility) facility.textContent = `${booking.storage || "Booked cold storage"} · ${booking.facilityId} · accepted booking`;
    if (duration) {
      const storedAt = Number(booking.storageReceivedAt || 0);
      duration.value = storedAt ? Math.max(0, (Date.now() - storedAt) / 86400000).toFixed(1) : "0";
    }
    if (status) status.textContent = "Loading the latest authorized facility sensor reading…";
    try {
      const reading = await window.getAICropSensorReading(booking.facilityId);
      state.aiSensorReading = reading;
      const t = document.getElementById("ai-temperature");
      const rh = document.getElementById("ai-humidity");
      const co2 = document.getElementById("ai-co2");
      if (t) t.value = Number.isFinite(reading.temperature) ? reading.temperature : "";
      if (rh) rh.value = Number.isFinite(reading.humidity) ? reading.humidity : "";
      if (co2) co2.value = reading.co2Ppm == null ? "" : reading.co2Ppm;
      if (status) status.textContent = `Live sensor values loaded${reading.receivedAt ? ` · ${new Date(reading.receivedAt).toLocaleString()}` : ""}. CO₂ ${reading.co2Ppm == null ? "is not available from the current ESP32 sensor feed" : "reading received"}.`;
    } catch (error) {
      if (status) status.textContent = `${error.message} Enter temperature and humidity manually if no sensor feed is available.`;
    }
  };

  function formatDate(ts) { return ts ? new Date(ts).toLocaleString() : "—"; }
  function reportCard(report, showFarmer) {
    const riskClass = report.riskLevel === "HIGH RISK" ? "high" : report.riskLevel === "MEDIUM RISK" ? "medium" : "low";
    return `<article class="card ai-report-card ${riskClass}">
      <div class="ai-report-head"><div><span class="ai-report-kicker">${report.booked ? "ACCEPTED BOOKING · SHARED REPORT" : "PRIVATE FARMER REPORT"}</span><h3>${h(report.crop)}${report.batchId ? ` · ${h(report.batchId)}` : ""}</h3><p class="muted">${showFarmer ? `Farmer: ${h(report.farmerName || "Farmer")} · ` : ""}${formatDate(Number(report.createdAt))}</p></div><span class="ai-risk-pill">${h(report.riskLevel)}</span></div>
      <div class="ai-report-grid">
        <div><span>Image classification</span><b>${h(report.classifier === "Manual crop selection" ? "Manual crop selection" : `MobileNetV2 · ${(Number(report.confidence || 0) * 100).toFixed(1)}%`)}</b></div>
        <div><span>Temperature</span><b>${Number(report.temperatureC).toFixed(1)} °C</b></div>
        <div><span>Humidity</span><b>${Number(report.humidityPct).toFixed(1)} %</b></div>
        <div><span>CO₂</span><b>${report.co2Available ? `${Number(report.co2Ppm).toFixed(0)} ppm` : "Unavailable · baseline used"}</b></div>
        <div><span>Storage duration</span><b>${Number(report.storageDurationDays).toFixed(1)} days</b></div>
        <div><span>Remaining shelf life</span><b>${Number(report.remainingShelfLifeDays).toFixed(1)} days</b></div>
        <div><span>Spoilage rate</span><b>${Number(report.spoilageRatePctDay).toFixed(1)}% / day</b></div>
        <div><span>Storage facility</span><b>${h(report.booked ? report.facilityId : "Not booked")}</b></div>
      </div><p class="ai-recommendation">${h(report.recommendation)}</p>
    </article>`;
  }

  function ensureReportsLoaded() {
    const uid = aiUid();
    const key = `${state.role}:${uid}:${state.firebaseAccess?.facilityId || ""}`;
    if (!uid || !window.loadAICropAnalysisReports || state.aiReportsLoadedFor === key || state.aiReportsLoading) return;
    state.aiReportsLoading = true;
    window.loadAICropAnalysisReports().then(reports => {
      state.aiReports = reports || [];
      state.aiReportsLoadedFor = key;
      state.aiReportsLoading = false;
      if (["ai", "ai-reports", "dashboard"].includes(state.page)) render();
    }).catch(error => {
      state.aiReportsLoadError = error.message || "Could not load AI reports.";
      state.aiReportsLoading = false;
      if (["ai", "ai-reports"].includes(state.page)) render();
    });
  }

  window.aiCropAnalysisPage = function () {
    if (state.role !== "Farmer") return `<div class="card">AI Crop Analysis is available in the Farmer Portal.</div>`;
    ensureReportsLoaded();
    const bookings = aiAcceptedBookings();
    state.aiBookingOptions = bookings;
    const selectedIndex = bookings.findIndex(b => String(b.id) === String(state.aiSelectedBooking));
    const selected = selectedIndex >= 0 ? selectedIndex : "";
    const latestReport = state.aiReports && state.aiReports.length ? state.aiReports[0] : null;
    return `<div class="page-head"><div class="page-icon">✦</div><div><h1>AI Crop Analysis</h1><p>Capture a produce image, identify the crop, and calculate shelf life using the AgriSetu notebook formula.</p></div></div>
      <div class="ai-model-note"><b>Image classifier:</b> Browser MobileNetV2 (ImageNet fallback). This is not the custom-trained AgriSetu ResNet-18. Confirm the crop selection before generating the report. ImageNet labels may not cover every one of the 15 AgriSetu crop classes.</div>
      <div class="ai-analysis-layout">
        <section class="card ai-camera-card"><div class="section-header"><div><h2>1. Capture or upload produce</h2><p class="muted">Use one vegetable per image for the clearest classification.</p></div></div>
          <div class="ai-camera-frame"><video id="ai-camera-video" autoplay playsinline muted hidden></video><img id="ai-image-preview" alt="Captured produce preview" src="${state.aiImageDataUrl || ""}" ${state.aiImageDataUrl ? "" : "hidden"}><div class="ai-camera-placeholder" ${state.aiImageDataUrl ? "hidden" : ""}>📷<span>Camera preview or uploaded image appears here</span></div></div>
          <div class="ai-camera-actions"><button class="btn btn-outline" type="button" onclick="aiStartCamera()">Open Live Camera</button><button class="btn btn-primary" type="button" onclick="aiCapturePhoto()">Capture Photo</button><label class="btn btn-outline ai-upload-btn">Upload Image<input id="ai-image-file" type="file" accept="image/*" capture="environment" onchange="aiHandleImageUpload(event)"></label></div>
          <p id="ai-camera-status" class="ai-status">Allow camera access or upload a photo. MobileNetV2 loads on first classification and requires internet access.</p>
          <div id="ai-top-predictions" class="ai-predictions">${(state.aiImagePredictions || []).map(p => `<span class="ai-pred-chip">${h(p.className)} ${(p.probability * 100).toFixed(1)}%</span>`).join("")}</div>
          <canvas id="ai-capture-canvas" hidden></canvas>
        </section>
        <section class="card ai-input-card"><div class="section-header"><div><h2>2. Batch and sensor information</h2><p class="muted">Accepted bookings are linked to the correct cold-storage facility.</p></div></div>
          <div class="field"><label>Produce / accepted booking</label><select id="ai-booking" onchange="aiBookingChanged()"><option value="">No booking · private farmer report</option>${bookings.map((b,i)=>`<option value="${i}" ${i===selectedIndex?"selected":""}>${h(b.product || "Produce")} · ${h(b.batchId)} · ${h(b.storage || "Cold storage")}</option>`).join("")}</select><small id="ai-facility-label" class="ai-help">${selected ? `${h(bookings[selectedIndex].storage || "Cold storage")} · ${h(bookings[selectedIndex].facilityId)}` : "Unbooked produce · report will remain private to your farmer account."}</small></div>
          <div class="field"><label>Identified crop (verify / correct)</label><select id="ai-crop" required><option value="">Select crop after image analysis</option>${CROPS.map(c => `<option value="${c}" ${state.aiSuggestedCrop === c ? "selected" : ""}>${c.replaceAll("_", " ")}</option>`).join("")}</select></div>
          <div class="ai-two-fields"><div class="field"><label>Temperature (°C)</label><input id="ai-temperature" type="number" step="0.1" min="-40" max="100" value="${state.aiSensorReading && Number.isFinite(state.aiSensorReading.temperature) ? state.aiSensorReading.temperature : ""}" placeholder="Live sensor or enter manually"></div><div class="field"><label>Humidity (%)</label><input id="ai-humidity" type="number" step="0.1" min="0" max="100" value="${state.aiSensorReading && Number.isFinite(state.aiSensorReading.humidity) ? state.aiSensorReading.humidity : ""}" placeholder="Live sensor or enter manually"></div><div class="field"><label>CO₂ (ppm, optional)</label><input id="ai-co2" type="number" step="1" min="0" placeholder="Not connected in current ESP32"></div><div class="field"><label>Storage duration (days)</label><input id="ai-storage-days" type="number" step="0.1" min="0" max="3650" value="${selected && bookings[selectedIndex].storageReceivedAt ? Math.max(0, (Date.now() - Number(bookings[selectedIndex].storageReceivedAt)) / 86400000).toFixed(1) : "0"}"></div></div>
          <p id="ai-sensor-status" class="ai-status">${selected ? "Use Load Latest Sensors to fetch current facility temperature and humidity." : "For unbooked produce, enter its current temperature and humidity."}</p>
          <button class="btn btn-outline" type="button" onclick="aiLoadSelectedSensors()" ${selected ? "" : "disabled"}>Load Latest Sensors</button>
          <button class="btn btn-primary ai-generate-btn" type="button" onclick="aiGenerateShelfLifeReport()">Generate Shelf-Life Report</button>
        </section>
      </div>
      <div id="ai-report-result">${state.aiLastResult ? reportCard(state.aiLastResult, false) : ""}</div>
      <section class="ai-history-section"><div class="section-header"><div><h2>My AI Prediction Reports</h2><p class="muted">Booked batch reports are also visible to the corresponding cold-storage operator.</p></div></div>${state.aiReportsLoadError ? `<p class="error">${h(state.aiReportsLoadError)}</p>` : ""}${latestReport ? state.aiReports.map(r => reportCard(r, false)).join("") : `<div class="card empty-state"><h3>No AI reports yet</h3><p>Your generated reports will appear here. Reports for unbooked produce remain private.</p></div>`}</section>`;
  };

  window.aiLoadSelectedSensors = async function () {
    const picker = document.getElementById("ai-booking");
    const idx = picker && picker.value !== "" ? Number(picker.value) : -1;
    const booking = idx >= 0 ? (state.aiBookingOptions || [])[idx] : null;
    if (!booking) return alert("Select an accepted booking first.");
    // Sync selection with the current dropdown index before fetching.
    state.aiSelectedBooking = booking.id;
    await window.aiBookingChanged();
  };

  window.aiGenerateShelfLifeReport = async function () {
    const imageData = state.aiImageDataUrl;
    const crop = document.getElementById("ai-crop")?.value || "";
    const temperature = asNumber("ai-temperature");
    const humidity = asNumber("ai-humidity");
    const co2Value = asNumber("ai-co2");
    const storageDays = asNumber("ai-storage-days");
    const bookingIndex = document.getElementById("ai-booking")?.value ?? "";
    const booking = bookingIndex === "" ? null : (state.aiBookingOptions || [])[Number(bookingIndex)];
    if (!imageData) return alert("Capture or upload a produce image first.");
    if (!crop || !CROPS.includes(crop)) return alert("Please select or verify the detected crop.");
    if (temperature == null || !Number.isFinite(temperature) || temperature < -40 || temperature > 100) return alert("Enter valid temperature in °C or load the facility sensor reading.");
    if (humidity == null || !Number.isFinite(humidity) || humidity < 0 || humidity > 100) return alert("Enter valid humidity between 0 and 100%.");
    if (storageDays == null || !Number.isFinite(storageDays) || storageDays < 0 || storageDays > 3650) return alert("Enter valid storage duration in days.");
    if (co2Value != null && (!Number.isFinite(co2Value) || co2Value < 0)) return alert("Enter a valid CO₂ reading or leave it blank.");
    if (booking && booking.status !== "ACCEPTED" && booking.storageAccepted !== true && booking.jobStatus !== "STORED") return alert("Only an accepted booking can be shared with a cold-storage portal.");

    const profile = CROP_AGRONOMY_PROFILES[crop] || DEFAULT_PROFILE;
    const co2Available = co2Value != null;
    const co2Used = co2Available ? co2Value : profile.base_co2;
    const result = estimateCropShelfLife(crop, temperature, humidity, co2Used, storageDays, 0.98);
    const prediction = {
      crop,
      confidence: state.aiSuggestedCrop === crop ? state.aiClassifierConfidence : 0,
      classifier: state.aiSuggestedCrop === crop ? "MobileNetV2 ImageNet fallback" : "Manual crop selection",
      classificationLabel: state.aiSuggestedCrop === crop ? (state.aiMatchedLabel || state.aiImagePredictions?.[0]?.className || "MobileNetV2 label") : "Farmer-confirmed crop",
      temperatureC: temperature,
      humidityPct: humidity,
      co2Available,
      co2Ppm: co2Available ? co2Value : null,
      co2UsedPpm: co2Used,
      storageDurationDays: storageDays,
      remainingShelfLifeDays: result.remaining_shelf_life_days,
      spoilageRatePctDay: result.spoilage_rate_pct_day,
      riskLevel: result.risk_level,
      recommendation: result.recommendation,
      booked: !!booking,
      facilityId: booking ? booking.facilityId : "",
      bookingId: booking ? booking.id : "",
      batchId: booking ? booking.batchId : "",
      farmerName: (typeof currentAccount === "function" && currentAccount().name) || state.user
    };
    const resultHolder = document.getElementById("ai-report-result");
    if (resultHolder) resultHolder.innerHTML = `<div class="ai-saving">Calculating shelf life and saving the prediction report…</div>`;
    try {
      if (typeof window.saveAICropAnalysisReport !== "function") throw new Error("The Firebase AI report integration is not loaded. Refresh the website and try again.");
      const saved = await window.saveAICropAnalysisReport(prediction);
      state.aiLastResult = saved;
      state.aiReports = [saved, ...(state.aiReports || []).filter(r => r.id !== saved.id)].sort((a,b) => Number(b.createdAt)-Number(a.createdAt));
      state.aiReportsLoadedFor = `${state.role}:${aiUid()}:${state.firebaseAccess?.facilityId || ""}`;
      if (resultHolder) resultHolder.innerHTML = reportCard(saved, false);
      const status = document.getElementById("ai-camera-status");
      if (status) status.textContent = booking ? "Report saved. It is visible to you and the cold-storage operator assigned to this accepted booking." : "Private report saved to your Farmer account. No cold-storage operator can view this unbooked report.";
      const history = document.querySelector(".ai-history-section");
      if (history) history.outerHTML = `<section class="ai-history-section"><div class="section-header"><div><h2>My AI Prediction Reports</h2><p class="muted">Booked batch reports are also visible to the corresponding cold-storage operator.</p></div></div>${state.aiReports.map(r => reportCard(r, false)).join("")}</section>`;
    } catch (error) {
      if (resultHolder) resultHolder.innerHTML = `<div class="error">${h(error.message || "Could not save the AI prediction report.")}</div>`;
    }
  };

  window.aiCropReportsPage = function () {
    if (state.role !== "Cold Storage") return `<div class="card">AI Reports are available to assigned Cold Storage accounts.</div>`;
    ensureReportsLoaded();
    return `<div class="page-head"><div class="page-icon">✦</div><div><h1>AI Shelf-Life Reports</h1><p>Reports shared by farmers whose bookings have been accepted by this facility.</p></div></div>
      <div class="ai-model-note">Only accepted-booking reports for your assigned facility are visible here. Reports for farmers' unbooked produce remain private.</div>
      ${state.aiReportsLoadError ? `<div class="error">${h(state.aiReportsLoadError)}</div>` : ""}
      ${state.aiReports && state.aiReports.length ? state.aiReports.map(r => reportCard(r, true)).join("") : `<div class="card empty-state"><h3>No shared AI reports yet</h3><p>Farmer reports will appear after an accepted booking is analyzed and saved.</p></div>`}`;
  };

  window.aiDashboardSummaryHtml = function () {
    if (state.role !== "Farmer") return "";
    ensureReportsLoaded();
    const reports = state.aiReports || [];
    return `<section class="ai-dashboard-summary"><div class="section-header"><div><h2>Latest AI Shelf-Life Predictions</h2><p class="muted">Your latest crop reports, including reports for accepted storage batches.</p></div><button class="link-btn" onclick="navigate('ai')">Open AI Crop Analysis</button></div>${reports.length ? reports.slice(0, 2).map(r => reportCard(r, false)).join("") : `<div class="card empty-state"><p>No AI prediction reports yet.</p><button class="btn btn-outline" onclick="navigate('ai')">Analyze Produce</button></div>`}</section>`;
  };

  // Insert latest report cards into the existing Farmer dashboard without
  // replacing any of its existing metrics, controls, or content.
  const originalDashboard = window.dashboard;
  if (typeof originalDashboard === "function") {
    window.dashboard = function () {
      return originalDashboard.apply(this, arguments) + window.aiDashboardSummaryHtml();
    };
  }

  // Stop the camera when navigating away; keep all existing renderer behavior.
  const originalNavigate = window.navigate;
  if (typeof originalNavigate === "function") {
    window.navigate = function (page) {
      if (page !== "ai") stopAICamera();
      state.aiReportsLoadError = "";
      return originalNavigate.apply(this, arguments);
    };
  }

  window.AGRISETU_AI_CROP_PROFILES = CROP_AGRONOMY_PROFILES;
  window.AGRISETU_AI_ESTIMATE_SHELF_LIFE = estimateCropShelfLife;
})();
