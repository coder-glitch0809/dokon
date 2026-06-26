import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

type Role = "superadmin";
type Account = { id: string; name: string; type: string; number: string; balance: number };
type Product = { id: string; name: string; category: string; unit: string; qty: number; cost: number; price: number; min: number; currency?: string; usdRate?: number };
type Bread = { id: string; name: string; qty: number; price: number; flourUsed: number; flourBags?: number; extraCost: number; produced: number; costPerBread: number; note?: string; date: string };
type Sale = { id: string; itemId: string; itemType: "product" | "bread"; name: string; qty: number; price: number; cost: number; account: string; date: string };
type Expense = { id: string; title: string; category: string; amount: number; account: string; note: string; date: string; originalAmount?: number; currency?: string; usdRate?: number };
type Purchase = { id: string; name: string; category: string; unit: string; qty: number; cost: number; price: number; account: string; supplier: string; date: string; originalCost?: number; originalPrice?: number; currency?: string; usdRate?: number };
type Worker = { id: string; name: string; login: string; role: Role; salary: number; phone: string; passwordHash: string; passwordSalt: string };
type ArchiveEntry = { id: string; date: string; type: string; title: string; amount: number; direction: "plus" | "minus" | "neutral"; payload: unknown; userId?: string };
type Db = { accounts: Account[]; products: Product[]; breads: Bread[]; sales: Sale[]; expenses: Expense[]; purchases: Purchase[]; workers: Worker[]; archive: ArchiveEntry[]; settings: { usdRate: number; usdRateDate: string } };
type Session = { id: string; userId: string; csrfToken: string; expiresAt: number };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 3104);

const sessions = new Map<string, Session>();
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const loginFailures = new Map<string, { count: number; lockedUntil: number }>();

const allowedViews: Record<Role, string[]> = {
  superadmin: ["dashboard", "inventory", "sales", "bakery", "expenses", "accounts", "workers", "profile", "archive"]
};

// LOGIN/PAROLNI O'ZGARTIRISH JOYI:
// Bu blok faqat yangi data/db.json yaratilayotganda ishlaydi.
// Agar tizim allaqachon ishga tushgan bo'lsa, parolni ichkarida Profil bo'limidan o'zgartiring.
// Bazani qaytadan boshlash kerak bo'lsa: serverni o'chiring, data/db.json faylini o'chiring, keyin npm run dev qiling.
const initialUsers: Array<{ name: string; login: string; password: string; role: Role; salary: number }> = [
  { name: "Superadmin", login: "Zamon", password: "market123", role: "superadmin", salary: 0 }
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function id(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password: string, worker: Worker) {
  const candidate = hashPassword(password, worker.passwordSalt).hash;
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(worker.passwordHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function seedWorker(name: string, login: string, password: string, role: Role, salary: number): Worker {
  const passwordData = hashPassword(password);
  return { id: id("u"), name, login, role, salary, phone: "", passwordHash: passwordData.hash, passwordSalt: passwordData.salt };
}

function seedDb(): Db {
  return {
    accounts: [
      { id: "cash", name: "Asosiy kassa", type: "Kassa", number: "Do‘kon", balance: 4500000 },
      { id: "uzcard", name: "Uzcard savdo", type: "Karta", number: "8600 **** 4412", balance: 2800000 },
      { id: "bank", name: "Bank hisob raqam", type: "Bank hisob raqam", number: "2020 **** 7788", balance: 12000000 }
    ],
    products: [
      { id: "p1", name: "Shakar", category: "Oziq-ovqat", unit: "kg", qty: 39, cost: 12000, price: 14500, min: 10 },
      { id: "p2", name: "Yog‘", category: "Oziq-ovqat", unit: "litr", qty: 24, cost: 18000, price: 22000, min: 8 },
      { id: "flour", name: "Un", category: "Nonvoyxona", unit: "kg", qty: 350, cost: 5200, price: 6500, min: 80 }
    ],
    breads: [
      { id: "b1", name: "Buxanka non", qty: 85, price: 4000, flourUsed: 75, extraCost: 120000, produced: 120, costPerBread: 3100, date: today() }
    ],
    sales: [
      { id: "s1", itemId: "b1", itemType: "bread", name: "Buxanka non", qty: 35, price: 4000, cost: 3100, account: "cash", date: today() },
      { id: "s2", itemId: "p1", itemType: "product", name: "Shakar", qty: 3, price: 14500, cost: 12000, account: "uzcard", date: today() }
    ],
    expenses: [
      { id: "e1", title: "Elektr to‘lovi", category: "Kommunal", amount: 260000, account: "bank", note: "Market va nonvoyxona", date: today() }
    ],
    purchases: [],
    archive: [],
    settings: { usdRate: 12600, usdRateDate: today() },
    workers: initialUsers.map((user) => seedWorker(user.name, user.login, user.password, user.role, user.salary))
  };
}

async function loadDb(): Promise<Db> {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dbPath)) {
    const db = seedDb();
    await saveDb(db);
    return db;
  }
  const db = JSON.parse(await readFile(dbPath, "utf8")) as Db;
  db.archive ||= [];
  db.settings ||= { usdRate: 12600, usdRateDate: today() };
  return db;
}

async function saveDb(db: Db) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function publicWorker(worker: Worker) {
  return { id: worker.id, name: worker.name, login: worker.login, role: worker.role, salary: worker.salary, phone: worker.phone };
}

function cleanString(value: unknown, max = 120) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

function positive(value: unknown, name: string, min = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min) throw httpError(400, `${name} noto‘g‘ri kiritildi`);
  return num;
}

function httpError(status: number, message: string) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function headerValue(req: IncomingMessage, name: string) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parseCookies(req: IncomingMessage) {
  const out: Record<string, string> = {};
  for (const part of headerValue(req, "cookie").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) out[key] = decodeURIComponent(rest.join("="));
  }
  return out;
}

function securityHeaders(res: ServerResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' https://images.unsplash.com data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}

function corsHeaders(req: IncomingMessage, res: ServerResponse) {
  const origin = headerValue(req, "origin");
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-csrf-token");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  securityHeaders(res);
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    res.writeHead(status);
    res.end(body);
    return;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(JSON.stringify(body));
}

function rateLimit(req: IncomingMessage, key: string, limit = 120, windowMs = 60_000) {
  const ip = req.socket.remoteAddress || "unknown";
  const bucketKey = `${ip}:${key}`;
  const now = Date.now();
  const bucket = rateBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw httpError(429, "Juda ko‘p so‘rov yuborildi. Birozdan keyin urinib ko‘ring.");
}

async function readJson(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk.toString();
    if (raw.length > 1_000_000) throw httpError(413, "Ma’lumot hajmi juda katta");
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "JSON noto‘g‘ri");
  }
}

function findSession(req: IncomingMessage) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session || session.expiresAt < Date.now()) {
    if (sid) sessions.delete(sid);
    return null;
  }
  return session;
}

async function requireUser(req: IncomingMessage, roles?: Role[]) {
  const session = findSession(req);
  if (!session) throw httpError(401, "Avval tizimga kiring");
  const db = await loadDb();
  const user = db.workers.find((worker) => worker.id === session.userId);
  if (!user) throw httpError(401, "Sessiya eskirgan");
  if (roles && !roles.includes(user.role)) throw httpError(403, "Bu amal uchun ruxsat yo‘q");
  if (req.method !== "GET" && headerValue(req, "x-csrf-token") !== session.csrfToken) throw httpError(403, "Xavfsizlik tokeni noto‘g‘ri");
  return { db, user, session };
}

function account(db: Db, accountId: string) {
  const found = db.accounts.find((item) => item.id === accountId);
  if (!found) throw httpError(400, "Hisob topilmadi");
  return found;
}

function assertBalance(item: Account, amount: number) {
  if (item.balance < amount) throw httpError(409, `${item.name} balansida mablag‘ yetarli emas`);
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function asCurrency(value: unknown) {
  const currency = cleanString(value || "UZS", 3).toUpperCase();
  return currency === "USD" ? "USD" : "UZS";
}

function moneyToUzs(amount: number, currency: string, usdRate: number) {
  return currency === "USD" ? amount * usdRate : amount;
}

function archive(db: Db, entry: Omit<ArchiveEntry, "id" | "date">) {
  db.archive.unshift({ id: id("arc"), date: new Date().toISOString(), ...entry });
  db.archive = db.archive.slice(0, 1000);
}

async function refreshUsdRate(db: Db) {
  if (db.settings.usdRateDate === today()) return db.settings.usdRate;
  try {
    const response = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/");
    const data = await response.json() as Array<{ Rate?: string; Date?: string }>;
    const rate = Number(data?.[0]?.Rate);
    if (Number.isFinite(rate) && rate > 0) {
      db.settings.usdRate = rate;
      db.settings.usdRateDate = today();
      await saveDb(db);
    }
  } catch {
    // Offline holatda oxirgi saqlangan kurs ishlatiladi.
  }
  return db.settings.usdRate;
}

function summary(db: Db) {
  const now = today();
  const currentMonth = monthKey(now);
  const calc = (filter: (date: string) => boolean) => {
    const sales = db.sales.filter((item) => filter(item.date));
    const expenses = db.expenses.filter((item) => filter(item.date));
    const purchases = db.purchases.filter((item) => filter(item.date));
    const revenue = sales.reduce((sum, item) => sum + item.qty * item.price, 0);
    const soldCost = sales.reduce((sum, item) => sum + item.qty * item.cost, 0);
    const expense = expenses.reduce((sum, item) => sum + item.amount, 0);
    const purchase = purchases.reduce((sum, item) => sum + item.qty * item.cost, 0);
    const grossProfit = revenue - soldCost;
    const netProfit = grossProfit - expense;
    return { revenue, soldCost, grossProfit, expense, purchase, netProfit };
  };
  const total = calc(() => true);
  const daily = calc((date) => date === now);
  const monthly = calc((date) => monthKey(date) === currentMonth);
  const balance = db.accounts.reduce((sum, item) => sum + item.balance, 0);
  const inventoryValue = db.products.reduce((sum, item) => sum + item.qty * item.cost, 0);
  const breadStockValue = db.breads.reduce((sum, item) => sum + item.qty * item.price, 0);
  const breadProducedToday = db.breads.filter((item) => item.date === now).reduce((sum, item) => sum + item.produced, 0);
  const breadSoldToday = db.sales.filter((item) => item.itemType === "bread" && item.date === now).reduce((sum, item) => sum + item.qty, 0);
  const flour = db.products.find((item) => item.id === "flour" || item.name.toLowerCase() === "un");
  const lowStock = db.products.filter((item) => item.qty <= (item.min || 5));
  const negativeAccounts = db.accounts.filter((item) => item.balance < 0);
  return { total, daily, monthly, balance, inventoryValue, breadStockValue, breadProducedToday, breadSoldToday, flour, lowStock, negativeAccounts };
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  rateLimit(req, url.pathname);

  if (url.pathname === "/api/session" && req.method === "GET") {
    const session = findSession(req);
    if (!session) return send(res, 200, { user: null, csrfToken: null });
    const db = await loadDb();
    const user = db.workers.find((worker) => worker.id === session.userId);
    return send(res, 200, { user: user ? publicWorker(user) : null, csrfToken: session.csrfToken });
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    rateLimit(req, "login", 8, 5 * 60_000);
    const body = await readJson(req) as Record<string, unknown>;
    const login = cleanString(body.login, 40).toLowerCase();
    const password = String(body.password || "");
    const fail = loginFailures.get(login);
    if (fail?.lockedUntil && fail.lockedUntil > Date.now()) throw httpError(429, "Login vaqtincha bloklangan");

    const db = await loadDb();
    const user = db.workers.find((worker) => worker.login.toLowerCase() === login);
    if (!user || !verifyPassword(password, user)) {
      const next = { count: (fail?.count || 0) + 1, lockedUntil: 0 };
      if (next.count >= 5) next.lockedUntil = Date.now() + 10 * 60_000;
      loginFailures.set(login, next);
      throw httpError(401, "Login yoki parol xato");
    }

    loginFailures.delete(login);
    const session: Session = { id: id("s"), userId: user.id, csrfToken: id("csrf"), expiresAt: Date.now() + 8 * 60 * 60_000 };
    sessions.set(session.id, session);
    const secure = headerValue(req, "x-forwarded-proto") === "https" ? "; Secure" : "";
    send(res, 200, { ok: true, user: publicWorker(user), csrfToken: session.csrfToken }, {
      "Set-Cookie": `sid=${encodeURIComponent(session.id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`
    });
    return;
  }

  if (url.pathname === "/api/logout" && req.method === "POST") {
    const session = findSession(req);
    if (session) sessions.delete(session.id);
    return send(res, 200, { ok: true }, { "Set-Cookie": "sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  }

  if (url.pathname === "/api/state" && req.method === "GET") {
    const { db, user } = await requireUser(req);
    await refreshUsdRate(db);
    return send(res, 200, { ...db, workers: db.workers.map(publicWorker), allowedViews: allowedViews[user.role], summary: summary(db) });
  }

  if (url.pathname === "/api/rate" && req.method === "GET") {
    const { db } = await requireUser(req);
    const usdRate = await refreshUsdRate(db);
    return send(res, 200, { usdRate, date: db.settings.usdRateDate });
  }

  if (url.pathname === "/api/purchases" && req.method === "POST") {
    const { db } = await requireUser(req, ["superadmin"]);
    const body = await readJson(req) as Record<string, unknown>;
    const qty = positive(body.qty, "Miqdor", 0.001);
    const currency = asCurrency(body.currency);
    const usdRate = currency === "USD" ? positive(body.usdRate || db.settings.usdRate, "USD kursi", 1) : db.settings.usdRate;
    const originalCost = positive(body.cost, "Tannarx");
    const originalPrice = positive(body.price, "Narx");
    const cost = moneyToUzs(originalCost, currency, usdRate);
    const price = moneyToUzs(originalPrice, currency, usdRate);
    const total = qty * cost;
    const payFrom = account(db, cleanString(body.account));
    assertBalance(payFrom, total);

    const name = cleanString(body.name);
    if (!name) throw httpError(400, "Mahsulot nomini kiriting");
    const existing = db.products.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      const oldValue = existing.qty * existing.cost;
      existing.qty += qty;
      existing.cost = (oldValue + total) / existing.qty;
      existing.price = price;
      existing.category = cleanString(body.category);
      existing.unit = cleanString(body.unit, 20) || existing.unit;
      existing.min = positive(body.min || existing.min || 5, "Minimum qoldiq");
      existing.currency = currency;
      existing.usdRate = usdRate;
    } else {
      db.products.push({ id: id("p"), name, category: cleanString(body.category), unit: cleanString(body.unit, 20) || "dona", qty, cost, price, min: positive(body.min || 5, "Minimum qoldiq"), currency, usdRate });
    }
    payFrom.balance -= total;
    const purchase = { id: id("buy"), name, category: cleanString(body.category), unit: cleanString(body.unit, 20), qty, cost, price, account: payFrom.id, supplier: cleanString(body.supplier), date: today(), originalCost, originalPrice, currency, usdRate };
    db.purchases.push(purchase);
    archive(db, { type: "purchase", title: `Kirim: ${name}`, amount: total, direction: "minus", payload: purchase });
    await saveDb(db);
    return send(res, 201, { ok: true });
  }

  if (url.pathname === "/api/sales" && req.method === "POST") {
    const { db } = await requireUser(req, ["superadmin"]);
    const body = await readJson(req) as Record<string, unknown>;
    const [itemType, itemId] = cleanString(body.item, 80).split(":");
    if ((itemType !== "product" && itemType !== "bread") || !itemId) throw httpError(400, "Tovar noto‘g‘ri tanlandi");
    const qty = positive(body.qty, "Miqdor", 0.001);
    const paidTo = account(db, cleanString(body.account));
    const item = itemType === "product" ? db.products.find((p) => p.id === itemId) : db.breads.find((b) => b.id === itemId);
    if (!item) throw httpError(400, "Tovar topilmadi");
    if (item.qty < qty) throw httpError(409, "Qoldiq yetarli emas");
    item.qty -= qty;
    const cost = itemType === "product" ? (item as Product).cost : (item as Bread).costPerBread;
    const price = Number(item.price);
    const sale: Sale = { id: id("sale"), itemId, itemType, name: item.name, qty, price, cost, account: paidTo.id, date: today() };
    db.sales.push(sale);
    paidTo.balance += qty * price;
    archive(db, { type: "sale", title: `Savdo: ${item.name}`, amount: qty * price, direction: "plus", payload: sale });
    await saveDb(db);
    return send(res, 201, { ok: true });
  }

  if (url.pathname === "/api/bakery" && req.method === "POST") {
    const { db } = await requireUser(req, ["superadmin"]);
    const body = await readJson(req) as Record<string, unknown>;
    const flour = db.products.find((p) => p.id === "flour" || p.name.toLowerCase() === "un");
    if (!flour) throw httpError(400, "Omborda Un topilmadi");
    const flourUsed = positive(body.flourUsed, "Un", 0.001);
    const breadQty = positive(body.breadQty, "Non soni", 1);
    const flourBags = positive(body.flourBags || 0, "Un qop");
    const breadPrice = positive(body.breadPrice, "Non narxi");
    const extraCost = positive(body.extraCost || 0, "Qo‘shimcha xarajat");
    if (flour.qty < flourUsed) throw httpError(409, "Un qoldig‘i yetarli emas");
    flour.qty -= flourUsed;
    const breadName = cleanString(body.breadName);
    const costPerBread = ((flourUsed * flour.cost) + extraCost) / breadQty;
    const bread = { id: id("bread"), name: breadName, qty: breadQty, price: breadPrice, flourUsed, flourBags, extraCost, produced: breadQty, costPerBread, note: cleanString(body.note), date: today() };
    db.breads.push(bread);
    archive(db, { type: "bakery", title: `Non yopildi: ${breadName}`, amount: breadQty * breadPrice, direction: "neutral", payload: bread });
    if (extraCost > 0) {
      const cash = db.accounts.find((a) => a.id === "cash");
      if (cash) {
        assertBalance(cash, extraCost);
        cash.balance -= extraCost;
        const expense = { id: id("exp"), title: `${breadName} qo‘shimcha xarajat`, category: "Nonvoyxona", amount: extraCost, account: cash.id, note: cleanString(body.note), date: today() };
        db.expenses.push(expense);
        archive(db, { type: "expense", title: expense.title, amount: extraCost, direction: "minus", payload: expense });
      }
    }
    await saveDb(db);
    return send(res, 201, { ok: true });
  }

  if (url.pathname === "/api/expenses" && req.method === "POST") {
    const { db } = await requireUser(req, ["superadmin"]);
    const body = await readJson(req) as Record<string, unknown>;
    const currency = asCurrency(body.currency);
    const usdRate = currency === "USD" ? positive(body.usdRate || db.settings.usdRate, "USD kursi", 1) : db.settings.usdRate;
    const originalAmount = positive(body.amount, "Summa");
    const amount = moneyToUzs(originalAmount, currency, usdRate);
    const payFrom = account(db, cleanString(body.account));
    assertBalance(payFrom, amount);
    payFrom.balance -= amount;
    const expense = { id: id("exp"), title: cleanString(body.title), category: cleanString(body.category), amount, account: payFrom.id, note: cleanString(body.note, 400), date: today(), originalAmount, currency, usdRate };
    db.expenses.push(expense);
    archive(db, { type: "expense", title: expense.title, amount, direction: "minus", payload: expense });
    await saveDb(db);
    return send(res, 201, { ok: true });
  }

  if (url.pathname === "/api/accounts" && req.method === "POST") {
    const { db } = await requireUser(req, ["superadmin"]);
    const body = await readJson(req) as Record<string, unknown>;
    const acc = { id: id("acc"), name: cleanString(body.name), type: cleanString(body.type), number: cleanString(body.number, 80), balance: positive(body.balance, "Balans") };
    db.accounts.push(acc);
    archive(db, { type: "account", title: `Hisob qo‘shildi: ${acc.name}`, amount: acc.balance, direction: "neutral", payload: acc });
    await saveDb(db);
    return send(res, 201, { ok: true });
  }

  if (url.pathname === "/api/workers" && req.method === "POST") {
    const { db } = await requireUser(req, ["superadmin"]);
    const body = await readJson(req) as Record<string, unknown>;
    const login = cleanString(body.login, 40).toLowerCase();
    if (db.workers.some((worker) => worker.login.toLowerCase() === login)) throw httpError(409, "Bu login band");
    const role = cleanString(body.role) as Role;
    if (!allowedViews[role]) throw httpError(400, "Rol noto‘g‘ri");
    const password = String(body.password || "");
    if (password.length < 4) throw httpError(400, "Parol kamida 4 belgi bo‘lsin");
    const passwordData = hashPassword(password);
    const worker = { id: id("u"), name: cleanString(body.name), login, role, salary: positive(body.salary || 0, "Oylik"), phone: cleanString(body.phone, 40), passwordHash: passwordData.hash, passwordSalt: passwordData.salt };
    db.workers.push(worker);
    archive(db, { type: "worker", title: `Ishchi qo‘shildi: ${worker.name}`, amount: 0, direction: "neutral", payload: publicWorker(worker) });
    await saveDb(db);
    return send(res, 201, { ok: true });
  }

  if (url.pathname === "/api/profile/password" && req.method === "POST") {
    const { db, user } = await requireUser(req);
    const body = await readJson(req) as Record<string, unknown>;
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");
    if (!verifyPassword(currentPassword, user)) throw httpError(401, "Hozirgi parol noto‘g‘ri");
    if (newPassword.length < 6) throw httpError(400, "Yangi parol kamida 6 belgi bo‘lsin");
    if (newPassword !== confirmPassword) throw httpError(400, "Yangi parollar bir xil emas");
    const passwordData = hashPassword(newPassword);
    user.passwordHash = passwordData.hash;
    user.passwordSalt = passwordData.salt;
    archive(db, { type: "security", title: `Parol yangilandi: ${user.login}`, amount: 0, direction: "neutral", payload: { userId: user.id, login: user.login }, userId: user.id });
    await saveDb(db);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/export" && req.method === "GET") {
    const { db } = await requireUser(req);
    const rows = [
      ["Bo‘lim", "Nomi", "Miqdor/Summa", "Sana"],
      ...db.sales.map((s) => ["Savdo", s.name, String(s.qty * s.price), s.date]),
      ...db.expenses.map((e) => ["Rasxod", e.title, String(e.amount), e.date]),
      ...db.purchases.map((p) => ["Kirim", p.name, String(p.qty * p.cost), p.date]),
      ...db.breads.map((b) => ["Non", b.name, String(b.produced), b.date])
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    return send(res, 200, csv, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zamon-market-${today()}.csv"`
    });
  }

  throw httpError(404, "API topilmadi");
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL) {
  const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(publicDir, requestPath));
  if (!filePath.startsWith(publicDir)) throw httpError(403, "Ruxsat yo‘q");
  await stat(filePath);
  const ext = path.extname(filePath);
  const type = ext === ".html" ? "text/html; charset=utf-8" : ext === ".css" ? "text/css; charset=utf-8" : ext === ".js" ? "text/javascript; charset=utf-8" : "application/octet-stream";
  send(res, 200, await readFile(filePath), { "Content-Type": type });
}

const server = createServer(async (req, res) => {
  try {
    corsHeaders(req, res);
    if (req.method === "OPTIONS") return send(res, 204, "");
    const url = new URL(req.url || "/", `http://${headerValue(req, "host") || "localhost"}`);
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    const err = error as Error & { status?: number };
    send(res, err.status || 500, { error: err.status ? err.message : "Server xatosi" });
  }
});

server.listen(port, () => {
  console.log(`Zamon Market: http://localhost:${port}`);
});
