from __future__ import annotations

import argparse
import html
import json
import os
import sys
import urllib.parse
import urllib.request
import urllib.error
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DEFAULT_DB_PATH = ROOT / "data" / "db.json"
CUSTOM_EMOJI_IDS = {
    "daily": "5172436166909100715",
    "low_stock": "5323289282499064033",
    "top_sales": "5409008750893734809",
    "balance": "5325971446625758812",
    "add_product": "5440410042773824003",
    "scan": "6269389652034065880",
    "enter": "5470060791883374114"
}
CUSTOM_EMOJI_FALLBACKS = {
    "daily": "📝",
    "low_stock": "📦",
    "top_sales": "🏆",
    "balance": "👤",
    "add_product": "➕",
    "scan": "🔍",
    "enter": "✅"
}

USER_STATE: dict[str, str] = {}
FIREBASE_SCOPES = (
    "https://www.googleapis.com/auth/firebase.database",
    "https://www.googleapis.com/auth/userinfo.email",
)
_FIREBASE_CREDENTIALS: Any = None

SCAN_URL = "https://t.me/dbdatabaseofmarketbot/scan"


def load_env(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line: 
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip().lstrip("\ufeff"), value.strip().strip("\"'"))


def money(value: float) -> str:
    return f"{round(value):,}".replace(",", " ") + " UZS"


def qty(value: float, unit: str = "") -> str:
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return f"{text} {unit}".strip()


def as_day(value: str) -> str:
    return str(value or "")[:10]


def firebase_enabled() -> bool:
    return bool(os.environ.get("FIREBASE_DATABASE_URL", "").strip())


def firebase_url(path_part: str = "") -> str:
    database_url = os.environ.get("FIREBASE_DATABASE_URL", "").strip().rstrip("/")
    db_path = os.environ.get("FIREBASE_DB_PATH", "zamon-market/db").strip().strip("/")
    clean_path = "/".join(part for part in [db_path, path_part.strip("/")] if part)
    secret = os.environ.get("FIREBASE_DATABASE_SECRET", "").strip()
    query = "?" + urllib.parse.urlencode({"auth": secret}) if secret else ""
    return f"{database_url}/{clean_path}.json{query}"


def firebase_access_token() -> str:
    global _FIREBASE_CREDENTIALS

    configured_token = os.environ.get("FIREBASE_AUTH_TOKEN", "").strip()
    if configured_token:
        return configured_token
    if os.environ.get("FIREBASE_DATABASE_SECRET", "").strip():
        return ""
    if os.environ.get("FIREBASE_ALLOW_UNAUTHENTICATED", "").strip().lower() == "true":
        return ""

    project_id = os.environ.get("FIREBASE_PROJECT_ID", "").strip()
    client_email = os.environ.get("FIREBASE_CLIENT_EMAIL", "").strip()
    private_key = os.environ.get("FIREBASE_PRIVATE_KEY", "").strip().replace("\\n", "\n")
    if not (project_id and client_email and private_key):
        raise RuntimeError(
            "Firebase service account sozlanmagan: FIREBASE_PROJECT_ID, "
            "FIREBASE_CLIENT_EMAIL va FIREBASE_PRIVATE_KEY talab qilinadi"
        )

    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account
    except ImportError as exc:
        raise RuntimeError("Firebase OAuth uchun 'pip install -r requirements.txt' buyrug'ini bajaring") from exc

    if _FIREBASE_CREDENTIALS is None:
        _FIREBASE_CREDENTIALS = service_account.Credentials.from_service_account_info(
            {
                "type": "service_account",
                "project_id": project_id,
                "private_key": private_key,
                "client_email": client_email,
                "token_uri": "https://oauth2.googleapis.com/token",
            },
            scopes=FIREBASE_SCOPES,
        )
    if not _FIREBASE_CREDENTIALS.valid:
        _FIREBASE_CREDENTIALS.refresh(Request())
    return str(_FIREBASE_CREDENTIALS.token or "")


def firebase_load_db() -> dict[str, Any] | None:
    request = urllib.request.Request(firebase_url(), method="GET")
    token = firebase_access_token()
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            if response.status >= 400:
                raise RuntimeError(f"Firebase xato: HTTP {response.status}")
            return json.loads(response.read().decode("utf-8")) or None
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Firebase xato: HTTP {exc.code}. {details}") from exc


def firebase_save_db(db: dict[str, Any]) -> None:
    payload = json.dumps(db, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        firebase_url(),
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="PUT",
    )
    token = firebase_access_token()
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status >= 400:
                raise RuntimeError(f"Firebase xato: HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Firebase xato: HTTP {exc.code}. {details}") from exc


def load_db(path: Path) -> dict[str, Any]:
    if firebase_enabled():
        db = firebase_load_db()
        if db is not None:
            return db
        raise FileNotFoundError("Firebase Realtime Database ichida DB topilmadi")
    if not path.exists():
        raise FileNotFoundError(f"DB topilmadi: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def daily_numbers(db: dict[str, Any], day: str) -> dict[str, float]:
    sales = [item for item in db.get("sales", []) if as_day(item.get("date")) == day]
    expenses = [item for item in db.get("expenses", []) if as_day(item.get("date")) == day]
    purchases = [item for item in db.get("purchases", []) if as_day(item.get("date")) == day]
    revenue = sum(float(item.get("qty", 0)) * float(item.get("price", 0)) for item in sales)
    sold_cost = sum(float(item.get("qty", 0)) * float(item.get("cost", 0)) for item in sales)
    expense = sum(float(item.get("amount", 0)) for item in expenses)
    purchase = sum(float(item.get("qty", 0)) * float(item.get("cost", 0)) for item in purchases)
    return {
        "sales_count": float(len(sales)),
        "expense_count": float(len(expenses)),
        "purchase_count": float(len(purchases)),
        "revenue": revenue,
        "sold_cost": sold_cost,
        "gross_profit": revenue - sold_cost,
        "expense": expense,
        "purchase": purchase,
        "net_profit": revenue - sold_cost - expense,
    }


def top_sales(db: dict[str, Any], day: str, limit: int = 5) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for sale in db.get("sales", []):
        if as_day(sale.get("date")) != day:
            continue
        name = str(sale.get("name", "Noma'lum"))
        item = grouped.setdefault(name, {"name": name, "qty": 0.0, "revenue": 0.0})
        item["qty"] += float(sale.get("qty", 0))
        item["revenue"] += float(sale.get("qty", 0)) * float(sale.get("price", 0))
    return sorted(grouped.values(), key=lambda item: item["revenue"], reverse=True)[:limit]


def low_stock(db: dict[str, Any]) -> list[dict[str, Any]]:
    items = []
    for product in db.get("products", []):
        current = float(product.get("qty", 0))
        minimum = float(product.get("min") or 5)
        if current <= minimum:
            items.append(product)
    return sorted(items, key=lambda item: float(item.get("qty", 0)))


def build_message(db: dict[str, Any], day: str) -> str:
    numbers = daily_numbers(db, day)
    total_balance = sum(float(item.get("balance", 0)) for item in db.get("accounts", []))
    supplier_debt = sum(max(float(item.get("balance", 0)), 0) for item in db.get("suppliers", []))
    low = low_stock(db)
    top = top_sales(db, day)

    lines = [
        f"<b>Zamon Market kunlik hisobot: {html.escape(day)}</b>",
        "",
        f"<i>Savdo: {money(numbers['revenue'])} ({int(numbers['sales_count'])} ta)</i>",
        f"<i>Tannarx: {money(numbers['sold_cost'])}</i>",
        f"<i>Yalpi foyda: {money(numbers['gross_profit'])}</i>",
        f"<i>Rasxod: {money(numbers['expense'])} ({int(numbers['expense_count'])} ta)</i>",
        f"<i>Sof natija: {money(numbers['net_profit'])}</i>",
        f"<i>Kirim xaridi: {money(numbers['purchase'])} ({int(numbers['purchase_count'])} ta)</i>",
        "",
        f"<b>Umumiy balans: {money(total_balance)}</b>",
        f"<b>Ta'minotchi qarzi: {money(supplier_debt)}</b>",
    ]
    parse_mode = "HTML"

    if top:
        lines.extend(["", "Eng ko'p tushum bergan tovarlar:"])
        for index, item in enumerate(top, 1):
            lines.append(f"{index}. {html.escape(str(item['name']))} - {qty(item['qty'])} / {money(item['revenue'])}")

    if low:
        lines.extend(["", "Kam qolgan tovarlar:"])
        for item in low[:10]:
            name = str(item.get("name", "Noma'lum"))
            lines.append(
                f"- {html.escape(name)}: "
                f"{qty(float(item.get('qty', 0)), str(item.get('unit', '')))} "
                f"(min: {qty(float(item.get('min') or 5), str(item.get('unit', '')))})"
            )
    else:
        lines.extend(["", "Kam qolgan tovar yo'q."])

    return "\n".join(lines)


def build_low_stock_message(db: dict[str, Any]) -> str:
    low = low_stock(db)
    if not low:
        return "<b>📦 Ombor holati</b>\n\nKam qolgan tovar yo'q."
    lines = ["<b>📦 Kam qolgan tovarlar</b>", ""]
    for item in low[:20]:
        name = html.escape(str(item.get("name", "Noma'lum")))
        unit = str(item.get("unit", ""))
        lines.append(
            f"⚠️ <b>{name}</b> — "
            f"{qty(float(item.get('qty', 0)), unit)} "
            f"(min: {qty(float(item.get('min') or 5), unit)})"
        )
    return "\n".join(lines)


def build_top_sales_message(db: dict[str, Any], day: str) -> str:
    top = top_sales(db, day, limit=10)
    if not top:
        return f"<b>🏆 Top sotuvlar: {html.escape(day)}</b>\n\nBugun savdo yozuvi yo'q."
    lines = [f"<b>🏆 Top sotuvlar: {html.escape(day)}</b>", ""]
    for index, item in enumerate(top, 1):
        medal = "🥇" if index == 1 else "🥈" if index == 2 else "🥉" if index == 3 else "✨"
        lines.append(f"{medal} {html.escape(str(item['name']))} — {qty(item['qty'])} / {money(item['revenue'])}")
    return "\n".join(lines)


def build_balance_message(db: dict[str, Any]) -> str:
    accounts = db.get("accounts", [])
    total_balance = sum(float(item.get("balance", 0)) for item in accounts)
    supplier_debt = sum(max(float(item.get("balance", 0)), 0) for item in db.get("suppliers", []))
    lines = ["<b>💎 Balans nazorati</b>", ""]
    for item in accounts:
        lines.append(f"💳 {html.escape(str(item.get('name', 'Hisob')))} — <b>{money(float(item.get('balance', 0)))}</b>")
    lines.extend(["", f"💰 Umumiy balans: <b>{money(total_balance)}</b>", f"🧾 Ta'minotchi qarzi: <b>{money(supplier_debt)}</b>"])
    return "\n".join(lines)


def telegram_send(token: str, chat_id: str, text: str) -> None:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = urllib.parse.urlencode(
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": "true",
        }
    ).encode("utf-8")
    telegram_request(token, "sendMessage", data)


def telegram_request(token: str, method: str, data: bytes | None = None, timeout: int = 20) -> dict[str, Any]:
    url = f"https://api.telegram.org/bot{token}/{method}"
    request = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status >= 400:
                raise RuntimeError(f"Telegram xato: HTTP {response.status}")
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Telegram xato: HTTP {exc.code}. {details}") from exc


def custom_emoji_markdown(key: str) -> str:
    fallback = CUSTOM_EMOJI_FALLBACKS[key]
    emoji_id = CUSTOM_EMOJI_IDS[key]
    return f"![{fallback}](tg://emoji?id={emoji_id})"


def inline_button_text(key: str, label: str) -> str:
    return f"{CUSTOM_EMOJI_FALLBACKS[key]} {label}"


def inline_button(key: str, label: str, callback_data: str) -> dict[str, str]:
    return {
        "text": label,
        "callback_data": callback_data,
        "icon_custom_emoji_id": CUSTOM_EMOJI_IDS[key],
    }


def telegram_delete_webhook(token: str) -> None:
    data = urllib.parse.urlencode({"drop_pending_updates": "false"}).encode("utf-8")
    telegram_request(token, "deleteWebhook", data, timeout=12)


def telegram_get_me(token: str) -> dict[str, Any]:
    result = telegram_request(token, "getMe", timeout=12)
    user = result.get("result")
    if not isinstance(user, dict):
        raise RuntimeError("Telegram getMe javobi noto'g'ri")
    return user


def telegram_send_add_product_menu(token: str, chat_id: str) -> None:
    """Tovar qo'shish uchun ikki xil usulni taklif qiluvchi inline menyu."""
    keyboard = {
        "inline_keyboard": [
            [
                {
                    "text": "Qo'lda kiritish",
                    "callback_data": "add_product_manual",
                    "icon_custom_emoji_id": CUSTOM_EMOJI_IDS["enter"],
                },
                {
                    "text": "Skanerlash",
                    "url": SCAN_URL,
                    "icon_custom_emoji_id": CUSTOM_EMOJI_IDS["scan"],
                },
            ],
            [
                {
                    "text": "🔙 Orqaga",
                    "callback_data": "back_to_menu",
                },
            ],
        ]
    }
    text = (
        "🔗 *Tovar qo'shish*\n\n"
        "Tovar shtrix kodini qanday kiritmoqchisiz?"
    )
    data = urllib.parse.urlencode(
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "MarkdownV2",
            "disable_web_page_preview": "true",
            "reply_markup": json.dumps(keyboard),
        }
    ).encode("utf-8")
    telegram_request(token, "sendMessage", data)


def telegram_send_menu(token: str, chat_id: str) -> None:
    daily_emoji = custom_emoji_markdown("daily")
    low_stock_emoji = custom_emoji_markdown("low_stock")
    top_sales_emoji = custom_emoji_markdown("top_sales")
    balance_emoji = custom_emoji_markdown("balance")
    add_product_emoji = custom_emoji_markdown("add_product")
    keyboard = {
        "inline_keyboard": [
            [
                inline_button("daily", "Kunlik hisobot", "daily"),
                inline_button("low_stock", "Kam qolganlar", "low_stock"),
            ],
            [
                inline_button("top_sales", "Top sotuvlar", "top_sales"),
                inline_button("balance", "Balans", "balance"),
            ],
            [
                inline_button("add_product", "Tovar qo'shish", "add_product"),
            ],
        ]
    }
    text = (
        f"{daily_emoji} *Zamon Market Admin Bot*\n\n"
        f"{daily_emoji} Kunlik hisobot\n"
        f"{low_stock_emoji} Kam qolganlar\n"
        f"{top_sales_emoji} Top sotuvlar\n"
        f"{balance_emoji} Balans\n"
        f"{add_product_emoji} Tovar qo'shish\n\n"
        "Kerakli bo'limni tanlang"
    )
    data = urllib.parse.urlencode(
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "MarkdownV2",
            "disable_web_page_preview": "true",
            "reply_markup": json.dumps(keyboard),
        }
    ).encode("utf-8")
    telegram_request(token, "sendMessage", data)


def telegram_answer_callback(token: str, callback_id: str) -> None:
    data = urllib.parse.urlencode({"callback_query_id": callback_id}).encode("utf-8")
    telegram_request(token, "answerCallbackQuery", data)


def admin_chat_ids() -> set[str]:
    return {item.strip() for item in os.environ.get("ADMIN_CHAT_IDS", "").split(",") if item.strip()}


def daily_report_time() -> tuple[int, int]:
    raw = os.environ.get("DAILY_REPORT_TIME", "21:00").strip()
    try:
        hour_text, minute_text = raw.split(":", 1)
        hour = int(hour_text)
        minute = int(minute_text)
    except ValueError as exc:
        raise RuntimeError("DAILY_REPORT_TIME HH:MM formatida bo'lishi kerak, masalan 21:00") from exc
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise RuntimeError("DAILY_REPORT_TIME noto'g'ri vaqt: soat 0-23, daqiqa 0-59 bo'lishi kerak")
    return hour, minute


def send_admin_report(token: str, db_path: Path, report_date: str) -> None:
    admins = admin_chat_ids()
    if not admins:
        print("ADMIN_CHAT_IDS bo'sh, kunlik hisobot yuborilmadi.", flush=True)
        return
    db = load_db(db_path)
    message = build_message(db, report_date)
    for chat_id in sorted(admins):
        telegram_send(token, chat_id, message)
    print(f"Kunlik hisobot yuborildi: {report_date}", flush=True)


def handle_bot_update(token: str, update: dict[str, Any], db_path: Path) -> None:
    admins = admin_chat_ids()
    message = update.get("message") or {}
    callback = update.get("callback_query") or {}

    if message:
        chat_id = str(message.get("chat", {}).get("id", ""))
        text = str(message.get("text", ""))
        if admins and chat_id not in admins:
            print(f"Ruxsat berilmagan chat e'tiborsiz qoldirildi: {chat_id}", flush=True)
            return

        # Qo'lda shtrix kod kiritish holati
        if USER_STATE.get(chat_id) == "waiting_barcode":
            USER_STATE.pop(chat_id, None)
            barcode = text.strip()
            if barcode:
                telegram_send(
                    token,
                    chat_id,
                    f"✅ <b>Shtrix kod qabul qilindi:</b> <code>{html.escape(barcode)}</code>\n\n"
                    "Tovarni saytda qo'shishda ushbu kodni ishlating.",
                )
            else:
                telegram_send(token, chat_id, "❌ Shtrix kod bo'sh bo'lishi mumkin emas. Qaytadan kiriting.")
            return

        if text.startswith("/start"):
            print(f"/start qabul qilindi: chat_id={chat_id}", flush=True)
            telegram_send_menu(token, chat_id)
        elif text.startswith("/report"):
            print(f"/report qabul qilindi: chat_id={chat_id}", flush=True)
            db = load_db(db_path)
            telegram_send(token, chat_id, build_message(db, date.today().isoformat()))
        return

    if callback:
        callback_id = str(callback.get("id", ""))
        chat_id = str(callback.get("message", {}).get("chat", {}).get("id", ""))
        action = str(callback.get("data", ""))
        if admins and chat_id not in admins:
            print(f"Ruxsat berilmagan callback e'tiborsiz qoldirildi: {chat_id}", flush=True)
            telegram_answer_callback(token, callback_id)
            return
        print(f"Tugma bosildi: action={action}, chat_id={chat_id}", flush=True)
        if action == "add_product":
            telegram_answer_callback(token, callback_id)
            telegram_send_add_product_menu(token, chat_id)
            return
        if action == "add_product_manual":
            USER_STATE[chat_id] = "waiting_barcode"
            telegram_answer_callback(token, callback_id)
            telegram_send(
                token,
                chat_id,
                "✏️ <b>Shtrix kodni kiriting:</b>\n\nTovarning shtrix kodini yozing va yuboring.",
            )
            return
        if action == "back_to_menu":
            USER_STATE.pop(chat_id, None)
            telegram_answer_callback(token, callback_id)
            telegram_send_menu(token, chat_id)
            return

        db = load_db(db_path)
        day = date.today().isoformat()
        if action == "daily":
            text = build_message(db, day)
        elif action == "low_stock":
            text = build_low_stock_message(db)
        elif action == "top_sales":
            text = build_top_sales_message(db, day)
        elif action == "balance":
            text = build_balance_message(db)
        else:
            text = "Noma'lum buyruq."

        telegram_answer_callback(token, callback_id)
        telegram_send(token, chat_id, text)


def run_bot(db_path: Path) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN sozlanmagan")
    print("Telegram botga ulanmoqda...", flush=True)
    while True:
        try:
            try:
                telegram_delete_webhook(token)
            except TimeoutError:
                print("Webhook tekshiruvi sekin javob berdi, polling davom ettiriladi.", flush=True)
            bot_user = telegram_get_me(token)
            break
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(f"Telegramga ulanishda xato: {exc}. 10 soniyadan keyin qayta uriniladi.", file=sys.stderr, flush=True)
            time.sleep(10)

    username = bot_user.get("username") or bot_user.get("first_name") or "bot"
    admins = ", ".join(sorted(admin_chat_ids())) or "cheklanmagan"
    report_hour, report_minute = daily_report_time()
    last_scheduled_report_day = ""
    print(f"Telegram bot ulandi: @{username}", flush=True)
    print(f"Ruxsat berilgan chatlar: {admins}", flush=True)
    print(f"Kunlik avtomatik hisobot vaqti: {report_hour:02d}:{report_minute:02d}", flush=True)
    print("Zamon Market admin bot polling ishlayapti. To'xtatish: Ctrl+C", flush=True)
    offset = 0
    while True:
        try:
            now = datetime.now()
            today = now.date().isoformat()
            if (now.hour, now.minute) >= (report_hour, report_minute) and last_scheduled_report_day != today:
                try:
                    send_admin_report(token, db_path, today)
                    last_scheduled_report_day = today
                except Exception as exc:
                    print(f"Kunlik hisobot yuborishda xato: {exc}", file=sys.stderr, flush=True)

            query = urllib.parse.urlencode({"timeout": 30, "offset": offset}).encode("utf-8")
            result = telegram_request(token, "getUpdates", query, timeout=45)
            for update in result.get("result", []):
                offset = max(offset, int(update.get("update_id", 0)) + 1)
                try:
                    handle_bot_update(token, update, db_path)
                except Exception as exc:
                    print(f"Update qayta ishlashda xato: {exc}", file=sys.stderr, flush=True)
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            print(f"Bot loop xatosi, lekin bot ishlashda davom etadi: {exc}", file=sys.stderr, flush=True)
            time.sleep(5)
        time.sleep(1)


def notify(text: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_ids = [item.strip() for item in os.environ.get("ADMIN_CHAT_IDS", "").split(",") if item.strip()]
    if not token or not chat_ids:
        print(text)
        return
    for chat_id in chat_ids:
        if not chat_id.lstrip("-").isdigit():
            raise RuntimeError(f"ADMIN_CHAT_IDS ichida noto'g'ri chat id bor: {chat_id!r}")
        telegram_send(token, chat_id, text)


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser(description="Run Zamon Market Telegram admin bot.")
    parser.add_argument("--db", default=os.environ.get("DB_PATH", str(DEFAULT_DB_PATH)), help="Path to db.json")
    parser.add_argument("--date", default=date.today().isoformat(), help="Report date in YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true", help="Print report without sending Telegram messages")
    parser.add_argument("--test-telegram", action="store_true", help="Send a short Telegram test message")
    parser.add_argument("--bot", action="store_true", help="Run Telegram polling bot with inline buttons")
    parser.add_argument("--send-report", action="store_true", help="Send one daily report and exit")
    args = parser.parse_args()

    try:
        db_path = Path(args.db)
        if args.bot or not (args.dry_run or args.test_telegram or args.send_report):
            run_bot(db_path)
            return 0
        if args.test_telegram:
            notify("<b>Zamon Market test</b>\nTelegram xabarnoma ishlayapti.")
            return 0
        db = load_db(db_path)
        report_date = datetime.strptime(args.date, "%Y-%m-%d").date().isoformat()
        message = build_message(db, report_date)
        if args.dry_run:
            print(message)
        else:
            notify(message)
        return 0
    except KeyboardInterrupt:
        print("\nBot to'xtatildi.", flush=True)
        return 0
    except Exception as exc:
        print(f"Notifier xatosi: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
