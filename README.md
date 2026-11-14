# ElFashih — Teman Penghafal Qur'an

Versi ini menambahkan fondasi backend Flask + database untuk akun, data tersinkron, daftar siswa, rekaman setoran, reset password, dan ekspor daftar siswa.

## Penting sebelum dipakai
Backend API sudah ditambahkan, tetapi antarmuka `templates/index.html` versi lama masih menjalankan proses login/registry dari `localStorage`. Jadi **akun/data lama belum otomatis pindah dan belum otomatis tersinkron ke API**. Jangan menganggap migrasi selesai hanya dengan deploy. Integrasi UI dan migrasi data browser adalah tahap berikutnya.

## Deploy di Render
1. Push folder proyek ini ke GitHub.
2. Buat Web Service di Render, pilih repo.
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
5. Tambahkan **Render PostgreSQL** lalu hubungkan `DATABASE_URL` ke environment service.
6. Tambahkan environment variable `SECRET_KEY` dengan nilai acak panjang (minimal 32 karakter).
7. Deploy. Periksa `https://DOMAIN/api/health` dan pastikan status `ok`.

SQLite hanya untuk pengembangan lokal. Jangan gunakan SQLite di filesystem ephemeral Render untuk data produksi. Database dibuat otomatis saat aplikasi mulai; untuk skema produksi yang berkembang, siapkan migrasi Alembic/Flask-Migrate sebelum perubahan model berikutnya.

## Endpoint API
Semua endpoint bertanda 🔒 memerlukan header `Authorization: Bearer <token>`.

| Metode | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/auth/register` | Daftar guru/siswa/personal; password di-hash server (Werkzeug scrypt/PBKDF2 sesuai versi) |
| POST | `/api/auth/login` | Verifikasi password di server, mengembalikan token |
| GET | `/api/auth/me` 🔒 | Profil akun aktif |
| GET | `/api/organizations` | Daftar lembaga |
| GET | `/api/teachers?organization_id=...` | Daftar guru |
| GET | `/api/students` 🔒 guru | Daftar siswa milik guru |
| POST | `/api/students` 🔒 guru | Tambah siswa |
| PATCH | `/api/students/<id>/teacher` 🔒 guru | Pindahkan siswa dalam lembaga yang sama |
| POST | `/api/students/<id>/reset-password` 🔒 guru | Reset password siswa |
| GET/PUT | `/api/sync/<namespace>` 🔒 | Baca/simpan JSON per akun (mis. `hafalan`, `setoran`, `keputusan`, `jadwal`) |
| POST | `/api/recordings` 🔒 | Upload audio multipart dengan field `audio`; opsional `student_id` |
| GET | `/api/recordings` 🔒 | Daftar rekaman milik siswa/guru |
| GET | `/api/recordings/<id>` 🔒 | Putar/unduh audio jika berhak |
| GET | `/api/reports/students.csv` 🔒 guru | Ekspor daftar siswa, dapat dibuka di Excel |

### Contoh penggunaan API
Login:
```bash
curl -X POST https://DOMAIN/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name":"Nama Guru","password":"PasswordPanjang","role":"guru"}'
```
Simpan progres hafalan:
```bash
curl -X PUT https://DOMAIN/api/sync/hafalan \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"data":{"juz":1,"status":"proses"}}'
```
Upload audio:
```bash
curl -X POST https://DOMAIN/api/recordings \
  -H "Authorization: Bearer TOKEN" \
  -F "audio=@setoran.webm"
```

## Keamanan dan batasan
- Password minimal 8 karakter dan hash dibuat di server; jangan kirim hash dari browser.
- Token ditandatangani server dan berlaku 30 hari. Ganti `SECRET_KEY` akan membatalkan token yang sedang aktif.
- Batasi ukuran upload melalui `MAX_RECORDING_MB` (default 25 MB).
- Gunakan HTTPS (Render menyediakan TLS).
- Endpoint sinkronisasi menyimpan JSON yang dikirim klien; integrasi frontend harus menerapkan aturan konflik versi/waktu dan validasi skema.
- File rekaman saat ini disimpan sebagai BLOB di PostgreSQL. Untuk skala besar, pindahkan file ke object storage dan simpan URL/metadata di database.
- Endpoint ekspor saat ini CSV (bisa dibuka Excel), belum membuat format `.xlsx` atau PDF.
- Reset password oleh guru dibatasi pada siswa yang berada di kelasnya. Pemindahan siswa dibatasi dalam lembaga yang sama; admin lintas-guru perlu ditetapkan secara eksplisit oleh pemilik lembaga.

## Menjalankan lokal
```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
Buka `http://localhost:5000`.

## PWA
Service worker dinaikkan ke versi `elfashih-v8-server-api`; cache lama dibersihkan saat aktivasi. Respons `/api/` tidak dimasukkan ke cache agar data pribadi tidak tertinggal di perangkat bersama.
