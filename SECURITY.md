# Zamon Market xavfsizlik eslatmalari

Bu loyiha demo/prototip uchun Node.js + TypeScript server bilan ajratildi. Muhim himoyalar:

- Parollar `PBKDF2-SHA256` bilan saltlangan hash ko‘rinishida saqlanadi.
- Login sessiyasi `HttpOnly`, `SameSite=Strict` cookie orqali beriladi.
- Ma’lumot yozadigan API endpointlarda `CSRF` token tekshiriladi.
- Rollar serverda majburiy tekshiriladi: admin, manager, cashier, baker.
- Login urinishlari limitlangan va 5 ta xatodan keyin vaqtincha bloklanadi.
- Umumiy rate limit bor.
- Inputlar serverda tekshiriladi va uzunligi cheklanadi.
- XSS xavfini kamaytirish uchun frontend HTML chiqarishda escape qiladi.
- Security headerlar qo‘yilgan: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Path traversaldan himoya bor: server faqat `public` ichidagi fayllarni beradi.

Real production uchun qo‘shimcha kerak bo‘ladi:

- HTTPS orqasida ishga tushirish va cookie uchun `Secure` flag majburiy bo‘lishi.
- JSON fayl o‘rniga PostgreSQL yoki boshqa ishonchli baza ishlatish.
- Audit log: kim, qachon, qaysi amalni bajargani.
- Backup va restore rejasi.
- Parol siyosati: uzun parol, 2FA, parolni tiklash.
- Karta integratsiyasi uchun bank/payment provider API kalitlarini `.env`da saqlash.
- Serverni reverse proxy orqasida rate limit va WAF bilan himoyalash.
