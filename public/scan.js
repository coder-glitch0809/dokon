let detector = null;
let stream = null;
let scanning = false;
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
  if (!session.user) {
    location.href = "/";
  }
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
  const result = await api(`/api/barcode?code=${encodeURIComponent(clean)}`);
  if (result.found) showProduct(result.product);
  else showNewProduct(clean);
}

async function scanLoop() {
  if (!scanning || !detector) return;
  try {
    const codes = await detector.detect(video);
    if (codes.length) await checkCode(codes[0].rawValue);
  } catch {}
  requestAnimationFrame(scanLoop);
}

async function startCamera() {
  await ensureLogin();
  if (!("BarcodeDetector" in window)) {
    setStatus("Bu brauzer avtomatik skanerni qo'llab-quvvatlamaydi. Kodni qo'lda kiriting.");
    return;
  }
  detector = new BarcodeDetector({ formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"] });
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  video.srcObject = stream;
  await video.play();
  scanning = true;
  setStatus("Skaner tayyor. Kodni kamera markaziga tuting.");
  scanLoop();
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

ensureLogin().catch(() => location.href = "/");
