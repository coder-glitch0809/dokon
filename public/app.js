// ESKI FRONTEND FAYL.
// Hozir public/index.html app2.js faylini ishlatyapti.
// LOGIN/PAROLNI app.js ichiga qo'ymang: brauzerda hammaga ko'rinadi.
// Boshlang'ich demo login/parollar joyi: src/server.ts -> initialUsers.
// Hozirgi login/parol: Zamon / market123.
// Ishlayotgan tizimda parol almashtirish: Profil bo'limi -> Parolni o'zgartirish.

const money = new Intl.NumberFormat("uz-UZ", { style: "currency", currency: "UZS", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 3 });

const navItems = [
  ["dashboard", "Dashboard", "Kunlik holat va balanslar."],
  ["inventory", "Ombor", "Kirim va mahsulot qoldig‘i."],
  ["sales", "Savdo", "Sotuv va avtomatik summa."],
  ["bakery", "Nonvoyxona", "Un, non ishlab chiqarish va qoldiq."],
  ["expenses", "Rasxodlar", "Nimaga qancha ishlatilgan."],
  ["accounts", "Karta va hisob", "Kassa, karta va bank qoldiqlari."],
  ["workers", "Ishchilar", "Login, parol va rollar."]
];

let state = null;
let session = null;
let activeView = "dashboard";

const $ = (id) => document.getElementById(id);
const fmtMoney = (value) => money.format(Math.round(Number(value || 0)));
const fmtQty = (value, unit = "") => `${number.format(Number(value || 0))}${unit ? ` ${unit}` : ""}`;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (session?.csrfToken && options.method && options.method !== "GET") headers["x-csrf-token"] = session.csrfToken;
  const response = await fetch(path, { credentials: "same-origin", ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || "So‘rov bajarilmadi");
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
  if (!rows.length) {
    el.innerHTML = `<tbody><tr><td class="empty">Hozircha ma’lumot yo‘q</td></tr></tbody>`;
    return;
  }
  el.innerHTML = `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

function accountName(id) {
  return state.accounts.find((a) => a.id === id)?.name || "Noma’lum hisob";
}

function totals() {
  const salesTotal = state.sales.reduce((sum, s) => sum + s.qty * s.price, 0);
  const profit = state.sales.reduce((sum, s) => sum + s.qty * (s.price - (s.cost || 0)), 0);
  const expenseTotal = state.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const balance = state.accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = state.sales.filter((s) => s.date === today).reduce((sum, s) => sum + s.qty * s.price, 0);
  const todayBread = state.breads.filter((b) => b.date === today).reduce((sum, b) => sum + b.produced, 0);
  return { salesTotal, profit, expenseTotal, balance, todaySales, todayBread };
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
  $(`${activeView}View`).classList.add("active");
  const item = navItems.find(([key]) => key === activeView);
  $("pageTitle").textContent = item[1];
  $("pageSub").textContent = item[2];
  render();
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
  $("userPill").textContent = `${session.user.name} · ${session.user.role}`;
}

function renderSelects() {
  const accountOptions = state.accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)} (${fmtMoney(a.balance)})</option>`).join("");
  document.querySelectorAll("[data-account-select]").forEach((el) => { el.innerHTML = accountOptions; });

  const products = state.products.filter((p) => p.qty > 0).map((p) => `<option value="product:${esc(p.id)}">${esc(p.name)} - ${fmtQty(p.qty, p.unit)}</option>`);
  const breads = state.breads.filter((b) => b.qty > 0).map((b) => `<option value="bread:${esc(b.id)}">${esc(b.name)} - ${fmtQty(b.qty, "dona")}</option>`);
  $("saleItem").innerHTML = [...products, ...breads].join("") || `<option value="">Sotiladigan tovar yo‘q</option>`;
  updateSaleCalc();
}

function renderDashboard() {
  const t = totals();
  $("kpiGrid").innerHTML = [
    ["Bugungi savdo", fmtMoney(t.todaySales), "Savdo kiritilganda oshadi"],
    ["Jami balans", fmtMoney(t.balance), "Kassa, karta va bank"],
    ["Sof foyda", fmtMoney(t.profit - t.expenseTotal), "Foyda minus rasxod"],
    ["Bugun chiqqan non", fmtQty(t.todayBread, "dona"), "Nonvoyxona ishlab chiqarishi"]
  ].map((k) => `<div class="card card-pad kpi"><span>${esc(k[0])}</span><strong>${esc(k[1])}</strong><small>${esc(k[2])}</small></div>`).join("");

  const activities = [
    ...state.sales.map((s) => ({ date: s.date, type: "Savdo", name: s.name, amount: s.qty * s.price, badge: "good" })),
    ...state.expenses.map((e) => ({ date: e.date, type: "Rasxod", name: e.title, amount: -e.amount, badge: "bad" })),
    ...state.purchases.map((p) => ({ date: p.date, type: "Kirim", name: p.name, amount: -p.qty * p.cost, badge: "blue" })),
    ...state.breads.map((b) => ({ date: b.date, type: "Non", name: b.name, amount: b.produced * b.price, badge: "warn" }))
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  table($("activityTable"), ["Sana", "Turi", "Nomi", "Summa"], activities.map((a) => [
    esc(a.date),
    `<span class="badge ${a.badge}">${esc(a.type)}</span>`,
    esc(a.name),
    `<span class="money">${fmtMoney(a.amount)}</span>`
  ]));

  $("balanceCards").innerHTML = state.accounts.map((a) => `<div class="calc-box">${esc(a.name)}<br><span class="balance-number">${fmtMoney(a.balance)}</span><br><small>${esc(a.type)} · ${esc(a.number || "raqam kiritilmagan")}</small></div>`).join("");
}

function renderStock() {
  table($("stockTable"), ["Mahsulot", "Kategoriya", "Qoldiq", "Tannarx", "Sotuv", "Holat"], state.products.map((p) => [
    esc(p.name), esc(p.category), fmtQty(p.qty, p.unit), fmtMoney(p.cost), fmtMoney(p.price),
    p.qty <= (p.min || 5) ? `<span class="badge bad">Kam qoldi</span>` : `<span class="badge good">Yetarli</span>`
  ]));
}

function renderSales() {
  table($("salesTable"), ["Sana", "Tovar", "Miqdor", "Narx", "Summa", "Hisob"], state.sales.slice().reverse().map((s) => [
    esc(s.date), esc(s.name), fmtQty(s.qty, s.itemType === "bread" ? "dona" : ""), fmtMoney(s.price),
    `<span class="money">${fmtMoney(s.qty * s.price)}</span>`, esc(accountName(s.account))
  ]));
}

function renderBakery() {
  const flour = state.products.find((p) => p.id === "flour" || p.name.toLowerCase() === "un");
  $("flourBox").textContent = flour ? `Un qoldig‘i: ${fmtQty(flour.qty, "kg")} · Tannarx: ${fmtMoney(flour.cost)} / kg` : `Omborga "Un" kirim qiling.`;
  table($("breadTable"), ["Sana", "Non turi", "Chiqarildi", "Sotildi", "Qoldiq", "Narx", "Potensial summa"], state.breads.map((b) => {
    const sold = state.sales.filter((s) => s.itemType === "bread" && s.itemId === b.id).reduce((sum, s) => sum + s.qty, 0);
    return [esc(b.date), esc(b.name), fmtQty(b.produced, "dona"), fmtQty(sold, "dona"), fmtQty(b.qty, "dona"), fmtMoney(b.price), `<span class="money">${fmtMoney(b.qty * b.price)}</span>`];
  }));
}

function renderExpenses() {
  table($("expensesTable"), ["Sana", "Nomi", "Kategoriya", "Summa", "Hisob", "Izoh"], state.expenses.slice().reverse().map((e) => [
    esc(e.date), esc(e.title), esc(e.category), `<span class="money">${fmtMoney(e.amount)}</span>`, esc(accountName(e.account)), esc(e.note || "-")
  ]));
}

function renderAccounts() {
  table($("accountsTable"), ["Nomi", "Turi", "Raqam", "Balans"], state.accounts.map((a) => [
    esc(a.name), esc(a.type), esc(a.number || "-"), `<span class="money">${fmtMoney(a.balance)}</span>`
  ]));
}

function renderWorkers() {
  table($("workersTable"), ["Ism", "Login", "Rol", "Oylik", "Telefon"], state.workers.map((w) => [
    esc(w.name), esc(w.login), `<span class="badge blue">${esc(w.role)}</span>`, fmtMoney(w.salary || 0), esc(w.phone || "-")
  ]));
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
    await refresh();
  } catch (error) {
    $("loginError").textContent = error.message;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  session = null;
  state = null;
  await refresh();
});

$("exportBtn").addEventListener("click", () => {
  window.location.href = "/api/export";
});

$("mobileNav").addEventListener("change", (e) => showView(e.target.value));
$("saleItem").addEventListener("change", updateSaleCalc);
$("saleQty").addEventListener("input", updateSaleCalc);
$("purchaseForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/purchases", e.target); });
$("saleForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/sales", e.target); });
$("bakeryForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/bakery", e.target); });
$("expenseForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/expenses", e.target); });
$("accountForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/accounts", e.target); });
$("workerForm").addEventListener("submit", (e) => { e.preventDefault(); submit("/api/workers", e.target); });

refresh().catch((error) => {
  $("loginError").textContent = error.message;
});
