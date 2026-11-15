# 🕌 ElFashih — Teman Penghafal Qur'an

Aplikasi hafalan Al-Quran berbasis web. Mushaf digital Juz 1–30, audio 25+ qari, tasmi' (setor hafalan via suara), murojaah terjadwal, quiz, progress tracker, dan PWA (bisa install ke HP).

---

## ✨ Fitur

- **Mushaf & Digital View** — tampilan halaman Quran + tampilan ayat per ayat
- **Blind Mode** — sembunyikan teks untuk latihan hafalan
- **Setor Hafalan (Tasmi')** — speech recognition mendengarkan bacaanmu dan menilai otomatis
- **Loop & Repeat** — ulang ayat/range tertentu N kali
- **25+ Qari** — Alafasy, Abdul Basit, Sudais, dll
- **Progress Hafalan** — tandai belum/proses/lancar per ayat
- **Murojaah Terjadwal** — sistem Leitner (spaced repetition)
- **Quiz** — sambung ayat, tebak surah, tebak nomor ayat
- **Jadwal & Notifikasi** — pengingat tadarus/murojaah/hafalan
- **Rekam Sendiri** — rekam bacaan lalu putar ulang
- **PWA** — bisa di-install ke home screen, sebagian offline

---

## 🚀 Deploy (Render + database Postgres)

Akun, daftar siswa, setoran, dan keputusan guru disimpan di **database server**, jadi wajib ada Postgres.

1. Buat database Postgres, salin **connection string**-nya.
   - ⚠️ Postgres **gratis Render dihapus 30 hari setelah dibuat** (+14 hari masa tenggang). Untuk data sungguhan pakai
     [Neon](https://neon.tech) (gratis permanen) atau Postgres berbayar Render.
2. Di Render → service web → **Environment**, tambahkan `DATABASE_URL` = connection string tadi
   (Neon: gunakan yang berakhiran `?sslmode=require`).
3. Push kode ke GitHub; Render men-deploy otomatis (`Procfile`: gunicorn). Tabel dibuat otomatis saat start.
4. Cek `https://<domain-kamu>/api/health` → `{"ok": true}`.

Tanpa `DATABASE_URL`, aplikasi memakai SQLite lokal (`data/elfashih.db`) — hanya untuk pengembangan,
**jangan dipakai di Render** (disk-nya hilang tiap deploy).

### Pindah dari versi lama (tanpa server)
Guru mendaftar ulang di server dengan **nama dan lembaga yang sama** di HP/browser lama, lalu Panel Guru → **Cadangan →
Pindahkan ke server**. Siswa tetap memakai uid lama, jadi hafalan mandiri di HP mereka tidak hilang; mereka hanya
membuat password baru saat masuk.

## 🎙️ Rekaman bacaan siswa → guru

- Rekaman di menu Mushaf kini **tersimpan permanen di perangkat** (IndexedDB), tidak hilang saat halaman ditutup.
- Siswa menekan ✈️ untuk **mengirim rekaman ke gurunya**. Guru membukanya di Panel Guru → siswa → tab **🎙️ Rekaman**:
  memutar, memberi komentar (muncul di HP siswa), dan melihat lencana "rekaman baru" di daftar siswa.
- Audio disimpan di **database** (disk Render tidak permanen), direkam 32 kbps agar kecil (±240 KB/menit).
  Batas bawaan (bisa diubah lewat environment variable di Render):

  | Variabel | Bawaan | Arti |
  |---|---|---|
  | `REC_MAX_BYTES` | 3145728 | ukuran maksimal satu rekaman (±10 menit) |
  | `REC_MAX_PER_SISWA` | 10 | rekaman terkirim per siswa |
  | `REC_KEEP_DAYS` | 60 | rekaman lebih lama dihapus otomatis saat siswa mengirim yang baru |

  Perkiraan: 30 siswa × 10 rekaman × ±0,5 MB ≈ 150 MB. Database gratis Neon (0,5 GB) cukup untuk kelas kecil;
  untuk banyak kelas, kecilkan `REC_MAX_PER_SISWA` atau pakai database berbayar.

---

## 🔒 Keamanan akun

- Password di-hash di server (scrypt); browser hanya menyimpan token acak yang bisa dicabut (logout / reset / ganti password).
- **Siswa baru**: guru menambahkan nama → tiap siswa mendapat **kode aktivasi** 6 karakter (tampil di Panel Guru, bisa disalin).
  Siswa wajib memasukkan kode itu saat pertama masuk, jadi orang lain tidak bisa "mengklaim" nama siswa. Kode hangus setelah dipakai;
  reset password membuat kode baru.
- Akun terkunci 10 menit setelah 8 kali salah; satu IP dibatasi 30 percobaan gagal per 10 menit.
- Ganti password: menu "Ganti Password" (perangkat lain otomatis keluar).
- Header keamanan (nosniff, Referrer-Policy, X-Frame-Options, HSTS di https). Database lama otomatis ditambah kolom baru saat start.
- Tes: `python tests/test_api.py` dan `python tests/test_migrate.py`.

---

## 💻 Jalankan Lokal

```bash
# Install dependencies
pip install -r requirements.txt

# Jalankan
python app.py
# Buka http://localhost:5000
```

---

## 📁 Struktur Proyek

```
elfashih/
├── app.py                  # Flask app + rute Quran/PWA
├── api.py                  # REST API (/api/...): login, kelas, setoran
├── models.py               # Tabel database
├── requirements.txt        # Python dependencies
├── Procfile                # Untuk Heroku/Railway
├── railway.toml            # Config Railway
├── runtime.txt             # Python version
├── templates/
│   └── index.html          # App utama (single-page)
└── static/
    ├── audio/              # (kosong) audio distream dari everyayah.com
    └── pwa/
        ├── manifest.json
        ├── sw.js
        ├── icon-192.png
        ├── icon-512.png
        └── apple-touch-icon.png
```

---

## 🔧 Catatan Teknis

- **Audio**: distream langsung dari `everyayah.com` — tidak perlu upload file MP3
- **Data Quran**: dari `api.alquran.cloud` — di-cache di IndexedDB browser
- **Data user** (progress, jadwal, bookmark): disimpan di `localStorage` browser
- **Speech Recognition**: Web Speech API (Chrome/Edge di Android/desktop; iOS Safari terbatas)
- **Akun & setoran guru**: database server (Flask + SQLAlchemy, password di-hash scrypt, sesi berbasis token)
- **Hafalan mandiri** (hafalan, murojaah, streak, skor kuis, jadwal): tetap di localStorage lalu disinkronkan otomatis ke server
  (digabung per ayat berdasarkan waktu perubahan; aman saat offline). Guru bisa melihat ringkasannya di Panel Guru.
- **Tes**: `python tests/test_api.py`

---

## 📱 Pasang sebagai PWA

Di Chrome/Edge Android: buka URL → menu ⋮ → **"Tambahkan ke layar utama"**  
Di Safari iOS: buka URL → Share → **"Tambahkan ke Layar Utama"**
