let detector = null;
let stream = null;
let scanning = false;
let starting = false;
let zxingControls = null;
let scanFrame = 0;
let lastCode = "";
let lastSeenAt = 0;

const $ = (id) => document.getElementById(id);
const statusEl = $("scanStatus");
const video = $("scanVideo");
const manualCode = $("manualCode");
const resultCard = $("resultCard");
const resultTitle = $("resultTitle");
const resultText = $("resultText");
const newProductForm = $("newProductForm");
const barcodeField = $("barcodeField");

function setStatus(text) {
  statusEl.textContent = text;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const response = await fetch(path, { credentials: "include", ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || "So'rov bajarilmadi");
  return body;
}

async function ensureLogin() {
  const session = await api("/api/session");
  return !!session.user;
}

function showProduct(product) {
  newProductForm.hidden = true;
  resultCard.hidden = false;
  resultTitle.textContent = product.name;
  resultText.textContent = `Qoldiq: ${product.qty} ${product.unit} · Narx: ${Math.round(product.price).toLocaleString("uz-UZ")} UZS · Barcode: ${product.barcode || "-"}`;
}

function showNewProduct(code) {
  resultCard.hidden = false;
  resultTitle.textContent = "Tovar topilmadi";
  resultText.textContent = `Barcode: ${code}`;
  barcodeField.value = code;
  newProductForm.hidden = false;
}

async function checkCode(code) {
  const clean = String(code || "").trim();
  if (!clean) return;
  const now = Date.now();
  if (clean === lastCode && now - lastSeenAt < 1500) return;
  lastCode = clean;
  lastSeenAt = now;
  manualCode.value = clean;
  setStatus(`Kod o'qildi: ${clean}`);
  try {
    const result = await api(`/api/barcode?code=${encodeURIComponent(clean)}`);
    if (result.found) showProduct(result.product);
    else showNewProduct(clean);
  } catch (error) {
    resultCard.hidden = false;
    resultTitle.textContent = "Kamera kodni o'qidi";
    resultText.innerHTML = `Barcode: <b>${esc(clean)}</b><br>${esc(error.message || "Bazadan tekshirish uchun tizimga kiring.")}`;
    newProductForm.hidden = true;
  }
}

async function scanLoop() {
  if (!scanning || !detector) return;
  try {
    const codes = await detector.detect(video);
    if (codes.length) await checkCode(codes[0].rawValue);
  } catch {}
  scanFrame = requestAnimationFrame(scanLoop);
}

async function startNativeDetector() {
  if (!("BarcodeDetector" in window)) return false;
  const wantedFormats = ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"];
  const supportedFormats = typeof BarcodeDetector.getSupportedFormats === "function"
    ? await BarcodeDetector.getSupportedFormats()
    : wantedFormats;
  const formats = wantedFormats.filter((format) => supportedFormats.includes(format));
  if (!formats.length) return false;
  detector = new BarcodeDetector({ formats });
  setStatus("Skaner tayyor. Kodni kamera markaziga tuting.");
  scanLoop();
  return true;
}

async function startZxingDetector() {
  if (!stream || !window.ZXingBrowser?.BrowserMultiFormatReader) return false;
  const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
  if (typeof reader.decodeFromStream !== "function") return false;
  zxingControls = await reader.decodeFromStream(stream, video, (result) => {
    if (result?.getText) checkCode(result.getText()).catch((error) => setStatus(error.message));
  });
  setStatus("Skaner tayyor. Kodni kamera markaziga tuting.");
  return true;
}

function stopCamera() {
  scanning = false;
  starting = false;
  detector = null;
  if (scanFrame) cancelAnimationFrame(scanFrame);
  scanFrame = 0;
  if (zxingControls?.stop) zxingControls.stop();
  zxingControls = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
}

async function openCameraStream() {
  const attempts = [
    { facingMode: { exact: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    true
  ];
  let lastError = null;
  for (const videoConstraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    } catch (error) {
      lastError = error;
      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") throw error;
    }
  }
  throw lastError || new Error("Qurilmada ishlaydigan kamera topilmadi.");
}

function cameraErrorMessage(error) {
  if (!window.isSecureContext) return "Kamera faqat HTTPS orqali ishlaydi. Saytni xavfsiz HTTPS manzilida oching.";
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Kamera ruxsati bloklangan. Brauzer sozlamasida ushbu sayt uchun Camera ruxsatini Allow qiling va qayta bosing.";
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") return "Qurilmada kamera topilmadi.";
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") return "Kamera boshqa ilovada band. Uni yoping va kamerani qayta oching.";
  return error?.message || "Kamera ochilmadi.";
}

async function startCamera() {
  if (starting || (scanning && stream?.active)) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus(window.isSecureContext
      ? "Bu brauzer kamerani qo'llab-quvvatlamaydi. Sahifani Chrome yoki Safari brauzerida oching."
      : "Kamera faqat HTTPS orqali ishlaydi. Saytni xavfsiz HTTPS manzilida oching.");
    return;
  }
  stopCamera();
  starting = true;
  setStatus("Kamera ochilmoqda...");
  try {
    stream = await openCameraStream();
    video.srcObject = stream;
    await video.play();
    scanning = true;
    starting = false;
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener("ended", () => {
        if (!document.hidden) {
          stopCamera();
          setStatus("Kamera uzildi. Qayta ochish uchun tugmani bosing.");
        }
      }, { once: true });
    }
  } catch (error) {
    stopCamera();
    setStatus(cameraErrorMessage(error));
    return;
  }

  try {
    if (await startNativeDetector()) return;
  } catch {}
  try {
    if (await startZxingDetector()) return;
  } catch {}
  setStatus("Kamera ochildi. Avtomatik kod o'qish mavjud emas; kodni qo'lda ham kiritishingiz mumkin.");
  starting = false;
}

$("startBtn").addEventListener("click", () => {
  startCamera().catch((error) => setStatus(error.message || "Kamera ochilmadi"));
});

$("checkBtn").addEventListener("click", () => {
  checkCode(manualCode.value).catch((error) => setStatus(error.message));
});

manualCode.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    checkCode(manualCode.value).catch((error) => setStatus(error.message));
  }
});

newProductForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  try {
    const result = await api("/api/products", { method: "POST", body: JSON.stringify(data) });
    showProduct(result.product);
    event.target.reset();
    barcodeField.value = data.barcode;
    setStatus("Yangi tovar saqlandi.");
  } catch (error) {
    setStatus(error.message);
  }
});

window.addEventListener("pagehide", () => {
  stopCamera();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopCamera();
    return;
  }
  startCamera().catch((error) => setStatus(cameraErrorMessage(error)));
});

window.addEventListener("pageshow", () => {
  startCamera().catch((error) => setStatus(cameraErrorMessage(error)));
});

startCamera().catch((error) => setStatus(cameraErrorMessage(error)));
