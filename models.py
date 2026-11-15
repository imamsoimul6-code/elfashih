"""Model database El Fashih (SQLAlchemy).

Dipakai dengan Postgres di produksi (DATABASE_URL) dan SQLite saat pengembangan lokal.
Bentuk JSON yang dikirim ke front-end sengaja sama dengan bentuk data lama di
localStorage (siswaUid, pFrom, lembagaId, ...), supaya kode Panel Guru tidak perlu
diubah besar-besaran.
"""
import os
import re
import time
import secrets
import hashlib

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

SESSION_DAYS = 180


_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"      # tanpa huruf/angka yang mirip (0 O 1 I L)


def new_code():
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))


def norm_code(s):
    return re.sub(r"[^A-Z0-9]", "", str(s or "").upper())


def now_ms():
    return int(time.time() * 1000)


def new_id(prefix="u"):
    return prefix + secrets.token_hex(7)


def norm(s):
    """Rapikan spasi: 'Ahmad   Fauzi ' -> 'Ahmad Fauzi'."""
    return re.sub(r"\s+", " ", str(s or "")).strip()


def key(s):
    return norm(s).lower()


def database_url():
    url = os.environ.get("DATABASE_URL", "").strip()
    if url.startswith("postgres://"):          # format lama dari beberapa penyedia
        url = "postgresql://" + url[len("postgres://"):]
    if url:
        return url
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    os.makedirs(path, exist_ok=True)
    return "sqlite:///" + os.path.join(path, "elfashih.db")


class Lembaga(db.Model):
    __tablename__ = "lembaga"
    id = db.Column(db.String(32), primary_key=True)
    nama = db.Column(db.String(120), nullable=False)
    jenis = db.Column(db.String(40), nullable=False, default="")
    desa = db.Column(db.String(80), nullable=False, default="")
    kec = db.Column(db.String(80), nullable=False, default="")
    kab = db.Column(db.String(80), nullable=False, default="")
    prov = db.Column(db.String(80), nullable=False, default="")
    sig = db.Column(db.String(500), unique=True, nullable=False)   # cegah lembaga ganda
    created_at = db.Column(db.BigInteger, nullable=False, default=now_ms)

    def to_dict(self):
        return {"id": self.id, "nama": self.nama, "jenis": self.jenis, "desa": self.desa,
                "kec": self.kec, "kab": self.kab, "prov": self.prov}

    @staticmethod
    def make_sig(nama, desa, kec, kab, prov):
        return "|".join(key(x) for x in (nama, desa, kec, kab, prov))


class User(db.Model):
    __tablename__ = "users"
    uid = db.Column(db.String(32), primary_key=True)
    role = db.Column(db.String(10), nullable=False, index=True)      # personal | guru | siswa
    nama = db.Column(db.String(80), nullable=False)
    # scope_key menjamin nama unik per cakupan:
    #   personal -> "p|nama", guru -> "g|<lembaga>|nama", siswa -> "s|<guru>|nama"
    scope_key = db.Column(db.String(300), unique=True, nullable=False)
    lembaga_id = db.Column(db.String(32), index=True)
    guru_id = db.Column(db.String(32), index=True)
    admin = db.Column(db.Boolean, nullable=False, default=False)
    pw_hash = db.Column(db.String(300))                             # NULL = siswa belum buat password
    activation_code = db.Column(db.String(12))                      # kode sekali pakai agar hanya siswa asli yang bisa membuat password
    fails = db.Column(db.Integer, nullable=False, default=0)
    locked_until = db.Column(db.BigInteger, nullable=False, default=0)
    created_at = db.Column(db.BigInteger, nullable=False, default=now_ms)

    @staticmethod
    def make_scope(role, nama, lembaga_id=None, guru_id=None):
        if role == "guru":
            return "g|%s|%s" % (lembaga_id, key(nama))
        if role == "siswa":
            return "s|%s|%s" % (guru_id, key(nama))
        return "p|%s" % key(nama)

    def public(self, with_code=False):
        """Data dasar untuk daftar nama di layar login & Panel Guru (kode aktivasi hanya untuk guru)."""
        d = {"uid": self.uid, "role": self.role, "nama": self.nama,
             "lembagaId": self.lembaga_id, "hasPw": bool(self.pw_hash)}
        if self.guru_id:
            d["guruId"] = self.guru_id
        if not self.pw_hash:
            d["pending"] = True
            if with_code:
                d["code"] = self.activation_code
        return d


class AuthSession(db.Model):
    __tablename__ = "auth_sessions"
    token_hash = db.Column(db.String(64), primary_key=True)   # sha256 dari token; token asli tidak disimpan
    uid = db.Column(db.String(32), nullable=False, index=True)
    created_at = db.Column(db.BigInteger, nullable=False, default=now_ms)
    expires_at = db.Column(db.BigInteger, nullable=False, index=True)


class Setoran(db.Model):
    __tablename__ = "setoran"
    id = db.Column(db.String(32), primary_key=True)
    siswa_uid = db.Column(db.String(32), nullable=False, index=True)
    guru_uid = db.Column(db.String(32), nullable=False)
    tgl = db.Column(db.String(10), nullable=False)            # YYYY-MM-DD
    jenis = db.Column(db.String(10), nullable=False)          # ziyadah | murojaah
    p_from = db.Column(db.Integer, nullable=False)
    p_to = db.Column(db.Integer, nullable=False)
    surat = db.Column(db.Integer)
    ayat_from = db.Column(db.Integer)
    ayat_to = db.Column(db.Integer)
    kelancaran = db.Column(db.String(10), nullable=False)     # lancar | belum
    tajwid = db.Column(db.Integer)
    makhraj = db.Column(db.Integer)
    catatan = db.Column(db.Text, nullable=False, default="")
    ts = db.Column(db.BigInteger, nullable=False, default=now_ms)

    def to_dict(self):
        return {"id": self.id, "siswaUid": self.siswa_uid, "guruUid": self.guru_uid, "tgl": self.tgl,
                "jenis": self.jenis, "pFrom": self.p_from, "pTo": self.p_to, "surat": self.surat,
                "ayatFrom": self.ayat_from, "ayatTo": self.ayat_to, "kelancaran": self.kelancaran,
                "tajwid": self.tajwid, "makhraj": self.makhraj, "catatan": self.catatan, "ts": self.ts}


class Keputusan(db.Model):
    __tablename__ = "keputusan"
    siswa_uid = db.Column(db.String(32), primary_key=True)
    juz = db.Column(db.Integer, primary_key=True)
    v = db.Column(db.String(10), nullable=False)              # lanjut | ulang
    tgl = db.Column(db.String(10), nullable=False)
    ts = db.Column(db.BigInteger, nullable=False, default=now_ms)


class UserData(db.Model):
    """Data hafalan mandiri per pengguna (hafalan, leitner, streak, skor kuis, jadwal).

    Kunci peta (hafalan, leitner) disimpan per ayat beserta cap waktu {"2:255": {"v": "lancar", "ts": 1760..}}
    (v = null berarti dihapus), sehingga dua perangkat bisa digabung tanpa saling menimpa.
    """
    __tablename__ = "user_data"
    uid = db.Column(db.String(32), primary_key=True)
    key = db.Column(db.String(30), primary_key=True)
    value = db.Column(db.Text, nullable=False)
    ts = db.Column(db.BigInteger, nullable=False, default=0)


class Rekaman(db.Model):
    """Rekaman bacaan siswa yang dikirim ke gurunya. Audio disimpan di database (disk Render tidak permanen)."""
    __tablename__ = "rekaman"
    id = db.Column(db.String(32), primary_key=True)
    siswa_uid = db.Column(db.String(32), nullable=False, index=True)
    label = db.Column(db.String(80), nullable=False, default="")
    ayah = db.Column(db.String(80), nullable=False, default="")
    dur_ms = db.Column(db.Integer, nullable=False, default=0)
    mime = db.Column(db.String(40), nullable=False)
    size = db.Column(db.Integer, nullable=False)
    data = db.Column(db.LargeBinary, nullable=False)
    komentar = db.Column(db.String(400), nullable=False, default="")      # umpan balik guru
    heard = db.Column(db.Boolean, nullable=False, default=False)          # sudah diputar/ditanggapi guru
    created_at = db.Column(db.BigInteger, nullable=False, default=now_ms)

    def to_dict(self):
        return {"id": self.id, "siswaUid": self.siswa_uid, "label": self.label, "ayah": self.ayah, "durMs": self.dur_ms,
                "mime": self.mime, "size": self.size, "komentar": self.komentar, "heard": bool(self.heard),
                "createdAt": self.created_at}


def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
