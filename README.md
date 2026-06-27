# Zamon Market

Market va nonvoyxona uchun hisob-kitob prototipi.

## Ishga tushirish

1. `.env.example` faylidan `.env` yarating va qiymatlarni almashtiring.
2. Serverni ishga tushiring:

```bash
npm run dev
```

Brauzerda ochish:

```text
http://localhost:3104
```

## Boshlang'ich admin

Yangi `data/db.json` yaratilganda boshlang'ich admin login/paroli koddan emas, `.env`dan olinadi:

```text
INITIAL_ADMIN_LOGIN=admin
INITIAL_ADMIN_PASSWORD=uzun-va-maxfiy-parol
PASSWORD_PEPPER=random-server-secret
SESSION_IDLE_MINUTES=30
```

Production muhitida `INITIAL_ADMIN_PASSWORD` majburiy. Developmentda parol berilmasa, server vaqtinchalik parol generatsiya qilib terminalga chiqaradi. Birinchi kirishda parolni almashtirish talab qilinadi.

## Tuzilma

- `public/index.html` - sahifa markup
- `public/styles.css` - UX/UI dizayn
- `public/app.js` - frontend logika
- `src/server.ts` - Node.js + TypeScript backend va xavfsizlik
- `data/db.json` - lokal runtime ma'lumotlar bazasi, git/deployga kiritilmaydi
- `data/backups` - lokal kunlik backup fayllari, git/deployga kiritilmaydi
- `SECURITY.md` - xavfsizlik bo'yicha izohlar

## Telegram admin bot

Kunlik hisobotni qo'lda olish uchun bot polling rejimini ishga tushiring:

```bash
python main.py --bot
```

Botda `/start` bosilganda inline tugmalar chiqadi: kunlik hisobot, kam qolgan tovarlar, top sotuvlar va balans.
