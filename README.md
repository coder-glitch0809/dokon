# Zamon Market

Market va nonvoyxona uchun hisob-kitob prototipi.

## Ishga tushirish

```bash
npm run dev
```

Brauzerda ochish:

```text
http://localhost:3104
```

Demo loginlar:

- `Zamon / market123`

## Login va parolni o'zgartirish

Boshlang'ich demo login/parollar joyi:

```text
src/server.ts -> initialUsers
```

Tizim allaqachon ishga tushgan bo'lsa, parolni ilova ichida o'zgartiring:

```text
Profil -> Parolni o'zgartirish
```

`public/app.js` yoki `public/app2.js` ichiga parol yozmang. Bu fayllarni brauzerda hamma ko'ra oladi.

## Tuzilma

- `public/index.html` - sahifa markup
- `public/styles.css` - UX/UI dizayn
- `public/app.js` - frontend logika
- `src/server.ts` - Node.js + TypeScript backend va xavfsizlik
- `data/db.json` - lokal demo ma’lumotlar bazasi
- `SECURITY.md` - xavfsizlik bo‘yicha izohlar
