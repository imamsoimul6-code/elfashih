"""API El Fashih: akun, kelas, setoran, keputusan guru.

Autentikasi: header `Authorization: Bearer <token>`. Token acak dibuat saat login,
hanya hash SHA-256-nya yang disimpan di database (tabel auth_sessions), jadi token
bisa dicabut (logout / reset password) dan tidak bocor kalau database bocor.
Password di-hash di server (werkzeug scrypt); browser tidak lagi menyimpan hash apa pun.
"""
import datetime
import json
import re
import secrets
from functools import wraps

from flask import Blueprint, g, jsonify, request
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from models import (SESSION_DAYS, AuthSession, Keputusan, Lembaga, Setoran, User, UserData, db,
                    hash_token, key, new_id, norm, now_ms)

api = Blueprint("api", __name__, url_prefix="/api")

MIN_PW = 4
MAX_PW = 200
MAX_NAMA = 80
MAX_FAILS = 8                 # salah password berturut-turut sebelum akun dikunci sementara
LOCK_MS = 10 * 60 * 1000


# ───────────────────────── util ─────────────────────────
class ApiError(Exception):
    def __init__(self, code, msg):
        super().__init__(msg)
        self.code, self.msg = code, msg


@api.errorhandler(ApiError)
def _api_error(e):
    return jsonify({"error": e.msg}), e.code


@api.after_request
def _no_store(resp):
    resp.headers["Cache-Control"] = "no-store"
    return resp


def body():
    d = request.get_json(silent=True)
    if not isinstance(d, dict):
        raise ApiError(400, "Data yang dikirim tidak valid.")
    return d


def to_int(v, lo, hi, field, required=False):
    if v is None or v == "":
        if required:
            raise ApiError(400, "%s wajib diisi." % field)
        return None
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise ApiError(400, "%s harus berupa angka." % field)
    if n < lo or n > hi:
        raise ApiError(400, "%s harus antara %d dan %d." % (field, lo, hi))
    return n


def clean_nama(v, label="Nama"):
    n = norm(v)
    if not n:
        raise ApiError(400, "%s wajib diisi." % label)
    if len(n) > MAX_NAMA:
        raise ApiError(400, "%s maksimal %d karakter." % (label, MAX_NAMA))
    return n


def clean_pw(v):
    v = v if isinstance(v, str) else ""
    if len(v) < MIN_PW:
        raise ApiError(400, "Password minimal %d karakter." % MIN_PW)
    if len(v) > MAX_PW:
        raise ApiError(400, "Password terlalu panjang.")
    return v


def pick_uid(hint=None):
    """uid baru; atau uid lama (format 'u...' dari versi tanpa server) bila belum dipakai.

    Dengan begitu data hafalan mandiri yang sudah tersimpan di HP (kunci 'user_<uid>_...')
    tetap terbaca setelah akun dipindahkan ke server.
    """
    h = str(hint or "")
    if re.fullmatch(r"u[a-z0-9]{6,30}", h) and not db.session.get(User, h):
        return h
    return new_id()


def commit_or_conflict(msg):
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        raise ApiError(409, msg)


def session_user(u):
    """Objek 'user' yang dipakai front-end (sama bentuknya dengan sesi lama)."""
    lem = db.session.get(Lembaga, u.lembaga_id) if u.lembaga_id else None
    guru = db.session.get(User, u.guru_id) if u.guru_id else None
    return {"id": u.uid, "uid": u.uid, "type": "account", "role": u.role, "nama": u.nama,
            "lembagaId": u.lembaga_id, "lembagaNama": lem.nama if lem else None,
            "guruId": u.guru_id, "guruNama": guru.nama if guru else None,
            "admin": bool(u.admin), "prefix": "user_%s_" % u.uid}


def issue_token(u):
    t = now_ms()
    AuthSession.query.filter(AuthSession.uid == u.uid, AuthSession.expires_at < t).delete()
    token = secrets.token_urlsafe(32)
    db.session.add(AuthSession(token_hash=hash_token(token), uid=u.uid, created_at=t,
                               expires_at=t + SESSION_DAYS * 86400 * 1000))
    db.session.commit()
    return token


def login_response(u):
    return jsonify({"token": issue_token(u), "user": session_user(u)})


def check_login(u, pw):
    """Verifikasi password + penguncian sementara bila terlalu banyak salah."""
    t = now_ms()
    if u.locked_until and u.locked_until > t:
        raise ApiError(429, "Terlalu banyak percobaan salah. Coba lagi beberapa menit lagi.")
    if not u.pw_hash or not isinstance(pw, str) or not check_password_hash(u.pw_hash, pw):
        u.fails = (u.fails or 0) + 1
        if u.fails >= MAX_FAILS:
            u.fails, u.locked_until = 0, t + LOCK_MS
        db.session.commit()
        raise ApiError(401, "Password salah.")
    if u.fails or u.locked_until:
        u.fails, u.locked_until = 0, 0
        db.session.commit()


def auth(*roles):
    def deco(f):
        @wraps(f)
        def wrapper(*a, **kw):
            h = request.headers.get("Authorization", "")
            if not h.startswith("Bearer "):
                raise ApiError(401, "Belum masuk.")
            s = db.session.get(AuthSession, hash_token(h[7:].strip()))
            if not s or s.expires_at < now_ms():
                raise ApiError(401, "Sesi berakhir. Silakan masuk lagi.")
            u = db.session.get(User, s.uid)
            if not u:
                raise ApiError(401, "Akun tidak ditemukan.")
            if roles and u.role not in roles:
                raise ApiError(403, "Tidak diizinkan.")
            g.user, g.token_hash = u, s.token_hash
            return f(*a, **kw)
        return wrapper
    return deco


def own_siswa(uid):
    """Siswa milik guru yang sedang login, atau 404."""
    s = db.session.get(User, uid) if uid else None
    if not s or s.role != "siswa" or s.guru_id != g.user.uid:
        raise ApiError(404, "Siswa tidak ditemukan.")
    return s


def delete_user_data(uid):
    Setoran.query.filter_by(siswa_uid=uid).delete()
    Keputusan.query.filter_by(siswa_uid=uid).delete()
    AuthSession.query.filter_by(uid=uid).delete()
    UserData.query.filter_by(uid=uid).delete()


# ───────────────────────── data publik (layar login) ─────────────────────────
@api.get("/health")
def health():
    db.session.execute(db.text("SELECT 1"))
    return jsonify({"ok": True})


@api.get("/lembaga")
def lembaga_list():
    q = norm(request.args.get("q", "")).lower()
    qs = Lembaga.query
    for tok in q.split(" ")[:6]:
        if tok:
            like = "%" + tok.replace("%", "").replace("_", "") + "%"
            qs = qs.filter(or_(Lembaga.nama.ilike(like), Lembaga.jenis.ilike(like), Lembaga.desa.ilike(like),
                               Lembaga.kec.ilike(like), Lembaga.kab.ilike(like), Lembaga.prov.ilike(like)))
    return jsonify([l.to_dict() for l in qs.order_by(Lembaga.nama).limit(40).all()])


@api.get("/lembaga/<lid>/guru")
def lembaga_guru(lid):
    rows = User.query.filter_by(role="guru", lembaga_id=lid).order_by(User.nama).all()
    return jsonify([{"uid": u.uid, "nama": u.nama} for u in rows])


@api.get("/guru/<gid>/siswa")
def guru_siswa(gid):
    rows = User.query.filter_by(role="siswa", guru_id=gid).order_by(User.nama).all()
    return jsonify([{"uid": u.uid, "nama": u.nama, "hasPw": bool(u.pw_hash)} for u in rows])


# ───────────────────────── autentikasi ─────────────────────────
@api.post("/auth/personal")
def auth_personal():
    d = body()
    nama, pw = clean_nama(d.get("nama")), d.get("password")
    scope = User.make_scope("personal", nama)
    u = User.query.filter_by(scope_key=scope).first()
    if d.get("mode") == "daftar":
        if u:
            raise ApiError(409, 'Nama ini sudah dipakai. Tambahkan nama belakang atau angka, atau pilih "Masuk".')
        u = User(uid=pick_uid(d.get("legacyUid")), role="personal", nama=nama, scope_key=scope,
                 pw_hash=generate_password_hash(clean_pw(pw)))
        db.session.add(u)
        commit_or_conflict("Nama ini sudah dipakai.")
        return login_response(u)
    if not u or u.role != "personal":
        raise ApiError(404, 'Akun tidak ditemukan. Cek nama, atau pilih "Buat Akun".')
    check_login(u, pw)
    return login_response(u)


@api.post("/auth/guru")
def auth_guru():
    d = body()
    nama, pw = clean_nama(d.get("nama"), "Nama guru"), d.get("password")
    if d.get("mode") == "masuk":
        lem = db.session.get(Lembaga, str(d.get("lembagaId") or ""))
        if not lem:
            raise ApiError(400, "Pilih nama lembaga terlebih dahulu.")
        u = User.query.filter_by(scope_key=User.make_scope("guru", nama, lem.id)).first()
        if not u:
            raise ApiError(404, 'Guru "%s" tidak ditemukan di %s.' % (nama, lem.nama))
        check_login(u, pw)
        return login_response(u)

    # daftar
    pw = clean_pw(pw)
    baru = isinstance(d.get("lembaga"), dict)
    if baru:
        f = d["lembaga"]
        vals = {k: norm(f.get(k)) for k in ("nama", "jenis", "desa", "kec", "kab", "prov")}
        if not all(vals[k] for k in ("nama", "desa", "kec", "kab", "prov")):
            raise ApiError(400, "Lengkapi nama lembaga, desa, kecamatan, kabupaten, dan provinsi.")
        if any(len(v) > 120 for v in vals.values()):
            raise ApiError(400, "Isian lembaga terlalu panjang.")
        sig = Lembaga.make_sig(vals["nama"], vals["desa"], vals["kec"], vals["kab"], vals["prov"])
        if Lembaga.query.filter_by(sig=sig).first():
            raise ApiError(409, 'Lembaga ini sudah terdaftar. Pilih tab "Sudah Terdaftar" untuk bergabung.')
        lem = Lembaga(id=new_id("l"), sig=sig, **vals)
        db.session.add(lem)
    else:
        lem = db.session.get(Lembaga, str(d.get("lembagaId") or ""))
        if not lem:
            raise ApiError(400, "Pilih lembaga terlebih dahulu.")
    scope = User.make_scope("guru", nama, lem.id)
    if User.query.filter_by(scope_key=scope).first():
        db.session.rollback()
        raise ApiError(409, 'Nama guru ini sudah terdaftar di lembaga tersebut. Pilih "Masuk".')
    u = User(uid=pick_uid(d.get("legacyUid")), role="guru", nama=nama, scope_key=scope, lembaga_id=lem.id, admin=baru,
             pw_hash=generate_password_hash(pw))
    db.session.add(u)
    commit_or_conflict("Data sudah terdaftar. Coba muat ulang halaman.")
    return login_response(u)


@api.post("/auth/siswa")
def auth_siswa():
    d = body()
    u = db.session.get(User, str(d.get("uid") or ""))
    if not u or u.role != "siswa":
        raise ApiError(404, "Nama tidak ditemukan. Minta guru memeriksa daftar siswa.")
    pw = d.get("password")
    if not u.pw_hash:                        # akun dibuat guru; siswa membuat password pertama kali
        u.pw_hash = generate_password_hash(clean_pw(pw))
        u.fails, u.locked_until = 0, 0
        db.session.commit()
        return login_response(u)
    if not pw:
        raise ApiError(400, "Password wajib diisi.")
    try:
        check_login(u, pw)
    except ApiError as e:
        if e.code == 401:
            raise ApiError(401, "Password salah. Lupa password? Minta gurumu mereset di Panel Guru.")
        raise
    return login_response(u)


@api.post("/auth/logout")
@auth()
def logout():
    AuthSession.query.filter_by(token_hash=g.token_hash).delete()
    db.session.commit()
    return jsonify({"ok": True})


@api.get("/me")
@auth()
def me():
    return jsonify({"user": session_user(g.user)})


# ───────────────────────── data kelas ─────────────────────────
def kelas_payload(u):
    if u.role == "guru":
        siswa = User.query.filter_by(role="siswa", guru_id=u.uid).order_by(User.nama).all()
    elif u.role == "siswa":
        siswa = [u]
    else:
        raise ApiError(403, "Akun pribadi tidak punya data kelas.")
    uids = [s.uid for s in siswa]
    setoran = Setoran.query.filter(Setoran.siswa_uid.in_(uids)).all() if uids else []
    keputusan = Keputusan.query.filter(Keputusan.siswa_uid.in_(uids)).all() if uids else []
    lem = db.session.get(Lembaga, u.lembaga_id) if u.lembaga_id else None
    return {"users": [s.public() for s in siswa],
            "lembaga": [lem.to_dict()] if lem else [],
            "setoran": [s.to_dict() for s in setoran],
            "keputusan": {"%s:%d" % (k.siswa_uid, k.juz): {"v": k.v, "tgl": k.tgl, "ts": k.ts} for k in keputusan}}


@api.get("/kelas")
@auth("guru", "siswa")
def kelas():
    return jsonify(kelas_payload(g.user))


# ───────────────────────── siswa (guru) ─────────────────────────
@api.post("/siswa")
@auth("guru")
def siswa_add():
    names = body().get("names")
    if not isinstance(names, list) or not names:
        raise ApiError(400, "Isi minimal satu nama.")
    if len(names) > 500:
        raise ApiError(400, "Maksimal 500 nama sekaligus.")
    ok, skip, added = 0, 0, []
    have = {key(x.nama) for x in User.query.filter_by(role="siswa", guru_id=g.user.uid).all()}
    for raw in names:
        n = norm(raw)[:MAX_NAMA]
        if not n or key(n) in have:
            skip += 1
            continue
        have.add(key(n))
        u = User(uid=new_id(), role="siswa", nama=n, lembaga_id=g.user.lembaga_id, guru_id=g.user.uid,
                 scope_key=User.make_scope("siswa", n, guru_id=g.user.uid))
        db.session.add(u)
        added.append(u)
        ok += 1
    commit_or_conflict("Ada nama yang sudah terdaftar. Coba lagi.")
    return jsonify({"added": ok, "skipped": skip, "users": [u.public() for u in added]})


@api.patch("/siswa/<uid>")
@auth("guru")
def siswa_rename(uid):
    s = own_siswa(uid)
    n = clean_nama(body().get("nama"))
    other = User.query.filter_by(scope_key=User.make_scope("siswa", n, guru_id=g.user.uid)).first()
    if other and other.uid != s.uid:
        raise ApiError(409, "Nama itu sudah dipakai siswa lain.")
    s.nama, s.scope_key = n, User.make_scope("siswa", n, guru_id=g.user.uid)
    commit_or_conflict("Nama itu sudah dipakai siswa lain.")
    return jsonify({"user": s.public()})


@api.post("/siswa/<uid>/reset-password")
@auth("guru")
def siswa_reset(uid):
    s = own_siswa(uid)
    s.pw_hash, s.fails, s.locked_until = None, 0, 0
    AuthSession.query.filter_by(uid=s.uid).delete()      # keluarkan siswa dari semua perangkat
    db.session.commit()
    return jsonify({"user": s.public()})


@api.delete("/siswa/<uid>")
@auth("guru")
def siswa_delete(uid):
    s = own_siswa(uid)
    delete_user_data(s.uid)
    db.session.delete(s)
    db.session.commit()
    return jsonify({"ok": True})


# ───────────────────────── setoran & keputusan ─────────────────────────
def clean_setoran(d):
    jenis, kel = d.get("jenis"), d.get("kelancaran")
    if jenis not in ("ziyadah", "murojaah"):
        raise ApiError(400, "Jenis setoran tidak valid.")
    if kel not in ("lancar", "belum"):
        raise ApiError(400, "Kelancaran tidak valid.")
    tgl = str(d.get("tgl") or "")
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", tgl):
            raise ValueError
        datetime.date.fromisoformat(tgl)
    except ValueError:
        raise ApiError(400, "Tanggal tidak valid.")
    a = to_int(d.get("pFrom"), 1, 604, "Halaman awal", True)
    b = to_int(d.get("pTo"), 1, 604, "Halaman akhir", True)
    if a > b:
        a, b = b, a
    return {"tgl": tgl, "jenis": jenis, "p_from": a, "p_to": b, "kelancaran": kel,
            "surat": to_int(d.get("surat"), 1, 114, "Surat"),
            "ayat_from": to_int(d.get("ayatFrom"), 1, 286, "Ayat awal"),
            "ayat_to": to_int(d.get("ayatTo"), 1, 286, "Ayat akhir"),
            "tajwid": to_int(d.get("tajwid"), 0, 100, "Nilai tajwid"),
            "makhraj": to_int(d.get("makhraj"), 0, 100, "Nilai makhraj"),
            "catatan": str(d.get("catatan") or "").strip()[:500]}


@api.post("/setoran")
@auth("guru")
def setoran_save():
    d = body()
    siswa = own_siswa(d.get("siswaUid"))
    fields = clean_setoran(d)
    sid = d.get("id")
    if sid:
        s = db.session.get(Setoran, str(sid))
        if not s:
            raise ApiError(404, "Setoran tidak ditemukan.")
        if s.siswa_uid != siswa.uid:
            raise ApiError(400, "Setoran ini milik siswa lain.")
    else:
        s = Setoran(id=new_id("s"), siswa_uid=siswa.uid)
        db.session.add(s)
    for k, v in fields.items():
        setattr(s, k, v)
    s.guru_uid, s.ts = g.user.uid, now_ms()
    db.session.commit()
    return jsonify({"setoran": s.to_dict()})


@api.delete("/setoran/<sid>")
@auth("guru")
def setoran_delete(sid):
    s = db.session.get(Setoran, sid)
    if not s:
        raise ApiError(404, "Setoran tidak ditemukan.")
    own_siswa(s.siswa_uid)
    db.session.delete(s)
    db.session.commit()
    return jsonify({"ok": True})


@api.put("/keputusan")
@auth("guru")
def keputusan_set():
    d = body()
    siswa = own_siswa(d.get("siswaUid"))
    juz = to_int(d.get("juz"), 1, 30, "Juz", True)
    v = d.get("v") or ""
    if v not in ("", "lanjut", "ulang"):
        raise ApiError(400, "Keputusan tidak valid.")
    row = db.session.get(Keputusan, (siswa.uid, juz))
    if not v:
        if row:
            db.session.delete(row)
        db.session.commit()
        return jsonify({"keputusan": None})
    if not row:
        row = Keputusan(siswa_uid=siswa.uid, juz=juz)
        db.session.add(row)
    row.v, row.tgl, row.ts = v, datetime.date.today().isoformat(), now_ms()
    if isinstance(d.get("tgl"), str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", d["tgl"]):
        row.tgl = d["tgl"]
    db.session.commit()
    return jsonify({"keputusan": {"v": row.v, "tgl": row.tgl, "ts": row.ts}})


# ───────────────────────── cadangan & pemindahan data lama ─────────────────────────
@api.get("/export")
@auth("guru")
def export_pack():
    p = kelas_payload(g.user)
    return jsonify({"app": "elfashih-kelas", "v": 2, "at": datetime.datetime.utcnow().isoformat() + "Z",
                    "guru": g.user.nama, "lembaga": p["lembaga"],
                    "siswa": [{"uid": u["uid"], "nama": u["nama"]} for u in p["users"]],
                    "setoran": p["setoran"], "keputusan": p["keputusan"]})


@api.post("/import")
@auth("guru")
def import_pack():
    """Gabungkan data (dari file cadangan / data lama di browser) ke kelas guru ini.

    Body: { siswa:[{uid,nama}], setoran:[...], keputusan:{"<uidLama>:<juz>":{v,tgl,ts}} }
    Siswa dicocokkan lewat nama; yang belum ada dibuat (belum punya password).
    """
    d = body()
    siswa_in, setoran_in, keputusan_in = d.get("siswa") or [], d.get("setoran") or [], d.get("keputusan") or {}
    if not isinstance(siswa_in, list) or not isinstance(setoran_in, list) or not isinstance(keputusan_in, dict):
        raise ApiError(400, "Format data tidak dikenali.")
    if len(siswa_in) > 500 or len(setoran_in) > 50000:
        raise ApiError(400, "Data terlalu besar.")
    gid = g.user.uid
    existing = {key(u.nama): u for u in User.query.filter_by(role="siswa", guru_id=gid).all()}
    umap, n_siswa, n_setoran, n_kep = {}, 0, 0, 0
    for it in siswa_in:
        if not isinstance(it, dict) or not it.get("uid"):
            continue
        try:
            nama = clean_nama(it.get("nama"))
        except ApiError:
            continue
        u = existing.get(key(nama))
        if not u:
            u = User(uid=pick_uid(it.get("uid")), role="siswa", nama=nama, lembaga_id=g.user.lembaga_id, guru_id=gid,
                     scope_key=User.make_scope("siswa", nama, guru_id=gid))
            db.session.add(u)
            db.session.flush()
            existing[key(nama)] = u
            n_siswa += 1
        umap[str(it["uid"])] = u
    db.session.flush()

    for it in setoran_in:
        if not isinstance(it, dict):
            continue
        u = umap.get(str(it.get("siswaUid")))
        if not u:
            continue
        try:
            f = clean_setoran(it)
        except ApiError:
            continue
        sid, ts = str(it.get("id") or ""), to_int(it.get("ts"), 0, 10 ** 14, "ts") or now_ms()
        row = db.session.get(Setoran, sid) if 0 < len(sid) <= 32 else None
        if row and row.siswa_uid != u.uid:
            row = None
            sid = ""                                  # id bentrok dengan data milik orang lain
        if not row and Setoran.query.filter_by(siswa_uid=u.uid, tgl=f["tgl"], jenis=f["jenis"], p_from=f["p_from"],
                                               p_to=f["p_to"], ts=ts).first():
            continue                                  # entri yang sama sudah pernah diimpor
        if row and (row.ts or 0) >= ts:
            continue
        if not row:
            row = Setoran(id=sid if 0 < len(sid) <= 32 else new_id("s"), siswa_uid=u.uid)
            db.session.add(row)
        for k, v in f.items():
            setattr(row, k, v)
        row.guru_uid, row.ts = gid, ts
        db.session.flush()
        n_setoran += 1
    db.session.flush()

    for k, v in keputusan_in.items():
        try:
            old_uid, juz = str(k).rsplit(":", 1)
            juz = to_int(juz, 1, 30, "Juz", True)
        except (ApiError, ValueError):
            continue
        u = umap.get(old_uid)
        if not u or not isinstance(v, dict) or v.get("v") not in ("lanjut", "ulang"):
            continue
        ts = to_int(v.get("ts"), 0, 10 ** 14, "ts") or now_ms()
        row = db.session.get(Keputusan, (u.uid, juz))
        if row and (row.ts or 0) >= ts:
            continue
        if not row:
            row = Keputusan(siswa_uid=u.uid, juz=juz)
            db.session.add(row)
        tgl = v.get("tgl") if isinstance(v.get("tgl"), str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v["tgl"]) else datetime.date.today().isoformat()
        row.v, row.tgl, row.ts = v["v"], tgl, ts
        n_kep += 1
    commit_or_conflict("Terjadi konflik saat mengimpor. Coba lagi.")
    return jsonify({"siswa": n_siswa, "setoran": n_setoran, "keputusan": n_kep})


# ───────────────────────── sinkron hafalan mandiri ─────────────────────────
SYNC_MAP = {"hafalan", "leitner"}                      # peta per-ayat, digabung per entri
SYNC_KEYS = SYNC_MAP | {"streak", "quiz_scores", "schedules"}
MAX_SYNC_BYTES = 1_000_000
MAX_ENTRIES = 7000
TOMBSTONE_MS = 180 * 86400 * 1000
_AYAT = re.compile(r"\d{1,3}:\d{1,3}")


def clean_ts(v):
    try:
        t = int(v)
    except (TypeError, ValueError):
        return 0
    return max(0, min(t, now_ms() + 86400000))         # cap waktu tak boleh jauh di masa depan


def clean_entry(name, e):
    if not isinstance(e, dict):
        return None
    v, ts = e.get("v"), clean_ts(e.get("ts"))
    if name == "hafalan":
        if v not in (None, "proses", "lancar"):
            return None
    else:  # leitner
        if v is not None:
            if not isinstance(v, dict) or not isinstance(v.get("box"), int) or not 1 <= v["box"] <= 3:
                return None
            lr = v.get("lastReview")
            v = {"box": v["box"], "lastReview": lr[:10] if isinstance(lr, str) else ""}
    return {"v": v, "ts": ts}


def merge_map(name, cur, incoming):
    cur = dict(cur or {})
    if not isinstance(incoming, dict) or len(incoming) > MAX_ENTRIES:
        raise ApiError(400, "Data sinkron tidak valid.")
    for k, e in incoming.items():
        if not _AYAT.fullmatch(str(k)):
            continue
        e = clean_entry(name, e)
        old = cur.get(k)
        if e and (not old or e["ts"] > old["ts"]):
            cur[k] = e
    cutoff = now_ms() - TOMBSTONE_MS
    return {k: e for k, e in cur.items() if e["v"] is not None or e["ts"] > cutoff}


def merge_value(name, row, inc):
    """streak & jadwal: yang terbaru menang. skor kuis: gabungan tanpa duplikat."""
    ts = clean_ts(inc.get("ts"))
    val = inc.get("value")
    if name == "streak":
        if not isinstance(val, dict):
            raise ApiError(400, "Data sinkron tidak valid.")
    else:
        if not isinstance(val, list) or len(val) > 500:
            raise ApiError(400, "Data sinkron tidak valid.")
    if row is None:
        return val, ts
    cur = json.loads(row.value)
    if name == "quiz_scores":
        seen = {json.dumps(x, sort_keys=True) for x in cur}
        merged = cur + [x for x in val if json.dumps(x, sort_keys=True) not in seen]
        return merged[-200:], max(ts, row.ts)
    return (val, ts) if ts >= row.ts else (cur, row.ts)


def sync_state(uid, k):
    row = db.session.get(UserData, (uid, k))
    if not row:
        return None
    v = json.loads(row.value)
    return {"entries": v} if k in SYNC_MAP else {"value": v, "ts": row.ts}


@api.post("/sync")
@auth()
def sync():
    """Gabungkan data hafalan mandiri dari perangkat ini dengan server, kembalikan hasil gabungan.

    Body: { keys: { hafalan: {entries:{"2:255":{v,ts}}}, streak: {value,ts}, ... }, want: ["hafalan", ...] }
    """
    if request.content_length and request.content_length > MAX_SYNC_BYTES:
        raise ApiError(413, "Data terlalu besar.")
    d = body()
    keys, want = d.get("keys") or {}, d.get("want") or []
    if not isinstance(keys, dict) or not isinstance(want, list):
        raise ApiError(400, "Format data tidak dikenali.")
    uid = g.user.uid
    for k, inc in keys.items():
        if k not in SYNC_KEYS or not isinstance(inc, dict):
            continue
        row = db.session.get(UserData, (uid, k))
        if k in SYNC_MAP:
            val, ts = merge_map(k, json.loads(row.value) if row else None, inc.get("entries")), now_ms()
        else:
            val, ts = merge_value(k, row, inc)
        if not row:
            row = UserData(uid=uid, key=k)
            db.session.add(row)
        row.value, row.ts = json.dumps(val, separators=(",", ":")), ts
    db.session.commit()
    out = {}
    for k in {x for x in list(keys) + want if x in SYNC_KEYS}:
        st = sync_state(uid, k)
        if st is not None:
            out[k] = st
    return jsonify({"keys": out})


@api.get("/siswa/<uid>/mandiri")
@auth("guru")
def siswa_mandiri(uid):
    """Ringkasan hafalan mandiri siswa (untuk guru)."""
    s = own_siswa(uid)
    res = {"hafalan": {}, "leitner": {}, "streak": None}
    for k in ("hafalan", "leitner"):
        row = db.session.get(UserData, (s.uid, k))
        if row:
            res[k] = {a: e["v"] for a, e in json.loads(row.value).items() if e["v"] is not None}
    row = db.session.get(UserData, (s.uid, "streak"))
    if row:
        res["streak"] = json.loads(row.value)
    return jsonify(res)
