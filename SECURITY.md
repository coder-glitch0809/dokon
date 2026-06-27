# Zamon Market xavfsizlik eslatmalari

Bu loyiha demo/prototip uchun Node.js + TypeScript server bilan ajratildi. Muhim himoyalar:

- Boshlang'ich admin paroli kod ichida saqlanmaydi; `.env` orqali olinadi.
- Production muhitida `INITIAL_ADMIN_PASSWORD` majburiy.
- Parollar `PBKDF2-SHA256` bilan saltlangan hash ko'rinishida saqlanadi.
- Ixtiyoriy `PASSWORD_PEPPER` server siri orqali hash himoyasi kuchaytiriladi.
- Birinchi kirishda vaqtinchalik parolni almashtirish talab qilinadi.
- Login sessiyasi `HttpOnly`, `SameSite=Strict` cookie orqali beriladi; production/HTTPS muhitida `Secure` flag ishlatiladi.
- Ma'lumot yozadigan API endpointlarda `CSRF` token tekshiriladi.
- Rollar serverda majburiy tekshiriladi: superadmin, admin, manager, cashier, baker.
- `/api/state` foydalanuvchi roliga qarab ko'rishi mumkin bo'lgan ma'lumotlarni qaytaradi.
- Login urinishlari limitlangan va 5 ta xatodan keyin vaqtincha bloklanadi.
- Umumiy rate limit bor.
- Inputlar serverda tekshiriladi va uzunligi cheklanadi.
- XSS xavfini kamaytirish uchun frontend HTML chiqarishda escape qiladi.
- CSV export Excel formula injectiondan himoyalangan.
- Audit log muhim amallarni `userId` bilan saqlaydi.
- Security headerlar qo'yilgan: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Path traversaldan himoya bor: server faqat `public` ichidagi fayllarni beradi.
- `data/*` va `.env*` git/deployga kiritilmaydi.

Real production uchun qo'shimcha tavsiyalar:

- JSON fayl o'rniga PostgreSQL, SQLite yoki boshqa ishonchli baza ishlatish.
- Server fayl tizimi va backup fayllarini alohida himoyalash.
- Backup va restore rejasi.
- 2FA yoki kamida parolni tiklash jarayoni.
- Karta integratsiyasi uchun bank/payment provider API kalitlarini `.env`da saqlash.
- Serverni reverse proxy orqasida rate limit va WAF bilan himoyalash.
