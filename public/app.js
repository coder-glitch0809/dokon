const money = new Intl.NumberFormat("uz-UZ", { style: "currency", currency: "UZS", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 3 });

const navItems = [
  ["dashboard", "Dashboard", "Kunlik, oylik va umumiy foyda nazorati."],
  ["inventory", "Ombor", "Kirim, qoldiq va yetishmovchilik."],
  ["sales", "Savdo", "Sotuv, tannarx va foyda."],
  ["bakery", "Nonvoyxona", "Un, qop, non ishlab chiqarish va sotuv."],
  ["expenses", "Rasxodlar", "Minus harakatlar va ochilish xarajatlari."],
  ["accounts", "Karta va hisob", "Kassa, karta va bank qoldiqlari."],
  ["workers", "Ishchilar", "Login, parol va rollar."],
  ["profile", "Profil", "Parol va xavfsizlik."],
  ["archive", "Arxiv", "Audit va saqlangan tarix."]
];

let state = null;
let session = null;
let activeView = "dashboard";
const API_ORIGIN = "";

const $ = (id) => document.getElementById(id);
const fmtMoney = (value) => money.format(Math.round(Number(value || 0)));
const fmtQty = (value, unit = "") => `${number.format(Number(value || 0))}${unit ? ` ${unit}` : ""}`;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const track = (eventName, params = {}) => {
  if (typeof window.zamonLogEvent === "function") window.zamonLogEvent(eventName, params);
};

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("zamonTheme", theme);
  if ($("themeBtn")) $("themeBtn").textContent = theme === "dark" ? "Light mode" : "Dark mode";
}
setTheme(localStorage.getItem("zamonTheme") || "light");

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (session?.csrfToken && options.method && options.method !== "GET") headers["x-csrf-token"] = session.csrfToken;
  let response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, { credentials: "include", ...options, headers });
  } catch {
    throw new Error("Serverga ulanib bo'lmadi. Lokal muhitda npm run dev ishlayotganini, Vercel muhitida esa /api yo'llari deploy qilinganini tekshiring.");
  }
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || "So'rov bajarilmadi");
  return body;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function refresh() {
  session = await api("/api/session");
  if (!session.user) {
    $("loginScreen").style.display = "grid";
    $("app").style.display = "none";
    return;
  }
  state = await api("/api/state");
  $("loginScreen").style.display = "none";
  $("app").style.display = "grid";
  activeView = state.allowedViews.includes(activeView) ? activeView : state.allowedViews[0];
  showView(activeView);
}

function table(el, headers, rows) {
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = `<tbody><tr><td class="empty">Hozircha ma'lumot yo'q</td></tr></tbody>`;
    return;
  }
  el.innerHTML = `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

function accountName(id) {
  return state.accounts.find((a) => a.id === id)?.name || "Noma'lum hisob";
}

function renderNav() {
  const side = $("sideNav");
  const mobile = $("mobileNav");
  side.innerHTML = "";
  mobile.innerHTML = "";
  navItems.filter(([id]) => state.allowedViews.includes(id)).forEach(([id, title]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = title;
    btn.className = id === activeView ? "active" : "";
    btn.onclick = () => showView(id);
    side.appendChild(btn);
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = title;
    opt.selected = id === activeView;
    mobile.appendChild(opt);
  });
}

function showView(id) {
  activeView = state.allowedViews.includes(id) ? id : state.allowedViews[0];
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $(`${activeView}View`)?.classList.add("active");
  const item = navItems.find(([key]) => key === activeView);
  $("pageTitle").textContent = item[1];
  $("pageSub").textContent = item[2];
  track("screen_view", { firebase_screen: activeView, firebase_screen_class: "ZamonMarket" });
  render();
}

function metricCard(title, value, sub, tone = "") {
  return `<div class="card card-pad metric ${tone}"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></div>`;
}

function render() {
  renderNav();
  renderSelects();
  renderDashboard();
  renderStock();
  renderSales();
  renderBakery();
  renderExpenses();
  renderAccounts();
  renderWorkers();
  renderArchive();
  renderSecurity();
  $("userPill").textContent = `${session.user.name} · ${session.user.role}`;
  $("ratePill").textContent = `USD ${fmtMoney(state.settings.usdRate)} · ${state.settings.usdRateDate}`;
}

function renderSelects() {
  const accountOptions = state.accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)} (${fmtMoney(a.balance)})</option>`).join("");
  document.querySelectorAll("[data-account-select]").forEach((el) => { el.innerHTML = accountOptions; });
  document.querySelectorAll("[data-usd-rate]").forEach((el) => { if (!el.value) el.value = state.settings.usdRate; });
  const products = state.products.filter((p) => p.qty > 0).map((p) => `<option value="product:${esc(p.id)}">${esc(p.name)} - ${fmtQty(p.qty, p.unit)}</option>`);
  const breads = state.breads.filter((b) => b.qty > 0).map((b) => `<option value="bread:${esc(b.id)}">${esc(b.name)} - ${fmtQty(b.qty, "dona")}</option>`);
  $("saleItem").innerHTML = [...products, ...breads].join("") || `<option value="">Sotiladigan tovar yo'q</option>`;
  updateSaleCalc();
}

function renderDashboard() {
  const s = state.summary;
  $("kpiGrid").innerHTML = [
    metricCard("Bugungi sof natija", fmtMoney(s.daily.netProfit), "Savdo foydasi minus rasxod", s.daily.netProfit < 0 ? "bad" : "good"),
    metricCard("Oylik sof natija", fmtMoney(s.monthly.netProfit), "Joriy oy bo'yicha", s.monthly.netProfit < 0 ? "bad" : "good"),
    metricCard("Umumiy balans", fmtMoney(s.balance), "Kassa, karta va bank", s.balance < 0 ? "bad" : "blue"),
    metricCard("Ombor qiymati", fmtMoney(s.inventoryValue + s.breadStockValue), "Mahsulot + non qoldig'i", "warn")
  ].join("");

  $("monitorGrid").innerHTML = [
    metricCard("Bugungi savdo", fmtMoney(s.daily.revenue), "Plus kirim"),
    metricCard("Bugungi rasxod", fmtMoney(s.daily.expense), "Minus chiqim", "bad"),
    metricCard("Bugun non yopildi", fmtQty(s.breadProducedToday, "dona"), `Sotildi: ${fmtQty(s.breadSoldToday, "dona")}`),
    metricCard("Un qoldig'i", s.flour ? fmtQty(s.flour.qty, s.flour.unit) : "Yo'q", s.flour ? `Minimum: ${fmtQty(s.flour.min, s.flour.unit)}` : "Omborga Un kiriting", s.flour && s.flour.qty <= s.flour.min ? "bad" : "")
  ].join("");

  table($("periodTable"), ["Davr", "Savdo", "Tannarx", "Yalpi foyda", "Rasxod", "Sof natija"], [
    ["Bugun", fmtMoney(s.daily.revenue), fmtMoney(s.daily.soldCost), fmtMoney(s.daily.grossProfit), fmtMoney(s.daily.expense), `<span class="${s.daily.netProfit < 0 ? "neg" : "pos"}">${fmtMoney(s.daily.netProfit)}</span>`],
    ["Joriy oy", fmtMoney(s.monthly.revenue), fmtMoney(s.monthly.soldCost), fmtMoney(s.monthly.grossProfit), fmtMoney(s.monthly.expense), `<span class="${s.monthly.netProfit < 0 ? "neg" : "pos"}">${fmtMoney(s.monthly.netProfit)}</span>`],
    ["Umumiy", fmtMoney(s.total.revenue), fmtMoney(s.total.soldCost), fmtMoney(s.total.grossProfit), fmtMoney(s.total.expense), `<span class="${s.total.netProfit < 0 ? "neg" : "pos"}">${fmtMoney(s.total.netProfit)}</span>`]
  ]);

  const alerts = [
    ...s.lowStock.map((p) => ({ tone: "bad", title: `${p.name} kam qoldi`, text: `Qoldiq: ${fmtQty(p.qty, p.unit)} · minimum: ${fmtQty(p.min, p.unit)}` })),
    ...s.negativeAccounts.map((a) => ({ tone: "bad", title: `${a.name} minusda`, text: fmtMoney(a.balance) })),
    ...(s.total.netProfit < 0 ? [{ tone: "bad", title: "Umumiy natija minusda", text: fmtMoney(s.total.netProfit) }] : []),
    ...(s.lowStock.length === 0 && s.negativeAccounts.length === 0 ? [{ tone: "good", title: "Nazorat holati yaxshi", text: "Minus balans va kritik qoldiq topilmadi." }] : [])
  ];
  $("alertList").innerHTML = alerts.map((a) => `<div class="alert-item ${a.tone}"><strong>${esc(a.title)}</strong><span>${esc(a.text)}</span></div>`).join("");

  const activities = [
    ...state.sales.map((x) => ({ date: x.date, type: "Savdo", name: x.name, amount: x.qty * x.price, badge: "good" })),
    ...state.expenses.map((x) => ({ date: x.date, type: "Rasxod", name: x.title, amount: -x.amount, badge: "bad" })),
    ...state.purchases.map((x) => ({ date: x.date, type: "Kirim", name: x.name, amount: -x.qty * x.cost, badge: "blue" })),
    ...state.breads.map((x) => ({ date: x.date, type: "Non", name: x.name, amount: x.produced * x.price, badge: "warn" }))
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  table($("activityTable"), ["Sana", "Turi", "Nomi", "Plus/Minus"], activities.map((a) => [esc(a.date), `<span class="badge ${a.badge}">${esc(a.type)}</span>`, esc(a.name), `<span class="${a.amount < 0 ? "neg" : "pos"}">${fmtMoney(a.amount)}</span>`]));
  $("balanceCards").innerHTML = state.accounts.map((a) => `<div class="calc-box">${esc(a.name)}<br><span class="balance-number ${a.balance < 0 ? "neg" : "pos"}">${fmtMoney(a.balance)}</span><br><small>${esc(a.type)} · ${esc(a.number || "raqam kiritilmagan")}</small></div>`).join("");
}

function renderStock() {
  table($("stockTable"), ["Mahsulot", "Kategoriya", "Qoldiq", "Min", "Tannarx", "Sotuv", "Qiymat", "Holat"], state.products.map((p) => [
    esc(p.name), esc(p.category), fmtQty(p.qty, p.unit), fmtQty(p.min || 0, p.unit), fmtMoney(p.cost), fmtMoney(p.price), fmtMoney(p.qty * p.cost),
    p.qty <= (p.min || 5) ? `<span class="badge bad">Yetishmayapti</span>` : `<span class="badge good">Yetarli</span>`
  ]));
}

function renderSales() {
  table($("salesTable"), ["Sana", "Tovar", "Miqdor", "Narx", "Tannarx", "Summa", "Foyda", "Hisob"], state.sales.slice().reverse().map((s) => [
    esc(s.date), esc(s.name), fmtQty(s.qty, s.itemType === "bread" ? "dona" : ""), fmtMoney(s.price), fmtMoney(s.cost),
    `<span class="pos">${fmtMoney(s.qty * s.price)}</span>`, `<span class="${s.qty * (s.price - s.cost) < 0 ? "neg" : "pos"}">${fmtMoney(s.qty * (s.price - s.cost))}</span>`, esc(accountName(s.account))
  ]));
}

function renderBakery() {
  const flour = state.products.find((p) => p.id === "flour" || p.name.toLowerCase() === "un");
  $("flourBox").textContent = flour ? `Un qoldig'i: ${fmtQty(flour.qty, "kg")} · minimum: ${fmtQty(flour.min, "kg")} · tannarx: ${fmtMoney(flour.cost)} / kg` : `Omborga "Un" kirim qiling.`;
  table($("breadTable"), ["Sana", "Non turi", "Chiqarildi", "Sotildi", "Qoldiq", "Un kg", "Un qop", "Narx", "Potensial tushum"], state.breads.map((b) => {
    const sold = state.sales.filter((s) => s.itemType === "bread" && s.itemId === b.id).reduce((sum, s) => sum + s.qty, 0);
    return [esc(b.date), esc(b.name), fmtQty(b.produced, "dona"), fmtQty(sold, "dona"), fmtQty(b.qty, "dona"), fmtQty(b.flourUsed, "kg"), fmtQty(b.flourBags || 0, "qop"), fmtMoney(b.price), fmtMoney(b.qty * b.price)];
  }));
}

function renderExpenses() {
  table($("expensesTable"), ["Sana", "Nomi", "Kategoriya", "Summa", "Valyuta", "Hisob", "Izoh"], state.expenses.slice().reverse().map((e) => [
    esc(e.date), esc(e.title), esc(e.category), `<span class="neg">${fmtMoney(e.amount)}</span>`, esc(e.currency === "USD" ? `$${e.originalAmount} · ${fmtMoney(e.usdRate)}` : "UZS"), esc(accountName(e.account)), esc(e.note || "-")
  ]));
}

function renderAccounts() {
  table($("accountsTable"), ["Nomi", "Turi", "Raqam", "Balans"], state.accounts.map((a) => [esc(a.name), esc(a.type), esc(a.number || "-"), `<span class="${a.balance < 0 ? "neg" : "pos"}">${fmtMoney(a.balance)}</span>`]));
}

function renderWorkers() {
  table($("workersTable"), ["Ism", "Login", "Rol", "Oylik", "Telefon"], state.workers.map((w) => [esc(w.name), esc(w.login), `<span class="badge blue">${esc(w.role)}</span>`, fmtMoney(w.salary || 0), esc(w.phone || "-")]));
}

function renderArchive() {
  table($("archiveTable"), ["Vaqt", "Turi", "Nomi", "Plus/Minus", "Saqlangan yozuv"], state.archive.slice(0, 200).map((a) => [
    esc(new Date(a.date).toLocaleString("uz-UZ")), esc(a.type), esc(a.title),
    `<span class="${a.direction === "minus" ? "neg" : a.direction === "plus" ? "pos" : ""}">${a.direction === "neutral" ? "audit" : fmtMoney(a.amount)}</span>`,
    `<code>${esc(JSON.stringify(a.payload).slice(0, 160))}</code>`
  ]));
}

function renderSecurity() {
  if (!$("securityList")) return;
  const items = [
    ["good", "Parollar hash qilinadi", "Server PBKDF2 + salt ishlatadi."],
    ["good", "CSRF himoya", "Yozish endpointlari token talab qiladi."],
    ["good", "Arxiv yozuvi", "Har bir muhim amal archive logga tushadi."],
    ["good", "Role access", "Bo'limlar va API rollar bilan cheklanadi."]
  ];
  $("securityList").innerHTML = items.map((i) => `<div class="alert-item ${i[0]}"><strong>${esc(i[1])}</strong><span>${esc(i[2])}</span></div>`).join("");
}

function updateSaleCalc() {
  if (!state) return;
  const value = $("saleItem").value;
  const qty = Number($("saleQty").value || 0);
  if (!value) {
    $("salePrice").value = "";
    $("saleTotal").value = "";
    return;
  }
  const [type, id] = value.split(":");
  const item = type === "product" ? state.products.find((p) => p.id === id) : state.breads.find((b) => b.id === id);
  const price = Number(item?.price || 0);
  $("salePrice").value = fmtMoney(price);
  $("saleTotal").value = fmtMoney(qty * price);
}

async function submit(endpoint, form) {
  try {
    await api(endpoint, { method: "POST", body: JSON.stringify(formData(form)) });
    track("form_submit", { endpoint });
    form.reset();
    await refresh();
  } catch (error) {
    alert(error.message);
  }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("loginError").textContent = "";
  try {
    await api("/api/login", { method: "POST", body: JSON.stringify(formData(event.target)) });
    track("login", { method: "password" });
    await refresh();
  } catch (error) {
    $("loginError").textContent = error.message;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  track("logout");
  session = null;
  state = null;
  await refresh();
});

$("themeBtn").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
$("exportBtn").addEventListener("click", () => { track("file_download", { file_extension: "csv", file_name: "zamon-market-report" }); window.location.href = `${API_ORIGIN}/api/export`; });
$("mobileNav").addEventListener("change", (e) => showView(e.target.value));
$("saleItem").addEventListener("change", updateSaleCalc);
$("saleQty").addEventListener("input", updateSaleCalc);
$("purchaseForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/purchases", e.target); });
$("saleForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/sales", e.target); });
$("bakeryForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/bakery", e.target); });
$("expenseForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/expenses", e.target); });
$("accountForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/accounts", e.target); });
$("workerForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/workers", e.target); });
$("passwordForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/profile/password", e.target); });

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-currency-select]")) {
    const form = event.target.closest("form");
    const rate = form?.querySelector("[data-usd-rate]");
    if (rate) rate.disabled = event.target.value !== "USD";
  }
});

refresh().catch((error) => {
  $("loginError").textContent = error.message;
});

