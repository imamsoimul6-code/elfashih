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

## 🚀 Deploy ke Railway

### 1. Push ke GitHub

```bash
git init
git add .
git commit -m "initial: ElFashih app"
git remote add origin https://github.com/USERNAME/elfashih.git
git push -u origin main
```

### 2. Deploy di Railway

1. Buka [railway.app](https://railway.app) → **New Project**
2. Pilih **Deploy from GitHub repo**
3. Pilih repo `elfashih`
4. Railway otomatis deteksi Python + `requirements.txt`
5. Tunggu build selesai → klik **Generate Domain**
6. App live di `https://elfashih-xxx.up.railway.app` 🎉

> Railway membaca `railway.toml` → menjalankan `gunicorn` otomatis.  
> `PORT` diset Railway secara otomatis.

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
├── app.py                  # Flask app
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
- **Tidak butuh database** — semua state di sisi client

---

## 📱 Pasang sebagai PWA

Di Chrome/Edge Android: buka URL → menu ⋮ → **"Tambahkan ke layar utama"**  
Di Safari iOS: buka URL → Share → **"Tambahkan ke Layar Utama"**
