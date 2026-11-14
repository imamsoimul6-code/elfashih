"""ElFashih API: server-side accounts, synced data and recordings."""
from flask import Flask, render_template, send_from_directory, jsonify, Response, request, g, send_file
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from functools import wraps
from datetime import datetime, timezone
from io import BytesIO
import os, json, urllib.request, csv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)
secret_key = os.environ.get("SECRET_KEY")
if not secret_key and (os.environ.get("RENDER") or os.environ.get("FLASK_ENV") == "production"):
    raise RuntimeError("SECRET_KEY wajib diatur pada environment produksi.")
app.config["SECRET_KEY"] = secret_key or "local-development-only-change-this-key"
db_url = os.environ.get("DATABASE_URL", "sqlite:///" + os.path.join(BASE_DIR, "elfashih-dev.db"))
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_RECORDING_MB", "25")) * 1024 * 1024
db = SQLAlchemy(app)
tokens = URLSafeTimedSerializer(app.config["SECRET_KEY"], salt="elfashih-auth-v1")

class Organization(db.Model):
    id = db.Column(db.String(64), primary_key=True)
    name = db.Column(db.String(180), nullable=False)
    meta = db.Column(db.JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class User(db.Model):
    id = db.Column(db.String(64), primary_key=True)
    organization_id = db.Column(db.String(64), db.ForeignKey("organization.id"), index=True)
    teacher_id = db.Column(db.String(64), db.ForeignKey("user.id"), index=True)
    name = db.Column(db.String(180), nullable=False)
    role = db.Column(db.String(20), nullable=False, index=True)
    password_hash = db.Column(db.String(255))
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class SyncedData(db.Model):
    user_id = db.Column(db.String(64), db.ForeignKey("user.id"), primary_key=True)
    namespace = db.Column(db.String(80), primary_key=True)
    payload = db.Column(db.JSON, nullable=False, default=dict)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Recording(db.Model):
    id = db.Column(db.String(64), primary_key=True)
    student_id = db.Column(db.String(64), db.ForeignKey("user.id"), index=True)
    teacher_id = db.Column(db.String(64), db.ForeignKey("user.id"), index=True)
    filename = db.Column(db.String(255), nullable=False)
    mime_type = db.Column(db.String(100), nullable=False)
    audio = db.Column(db.LargeBinary, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

def issue_token(user):
    return tokens.dumps({"uid": user.id})

def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        data = tokens.loads(header[7:], max_age=60 * 60 * 24 * 30)
        return db.session.get(User, data.get("uid"))
    except (BadSignature, SignatureExpired):
        return None

def login_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        g.user = current_user()
        if not g.user:
            return jsonify(error="Sesi tidak valid. Silakan login kembali."), 401
        return fn(*args, **kwargs)
    return wrapped

def teacher_required(fn):
    @wraps(fn)
    @login_required
    def wrapped(*args, **kwargs):
        if g.user.role != "guru":
            return jsonify(error="Khusus akun guru."), 403
        return fn(*args, **kwargs)
    return wrapped

def user_json(u):
    return {"id":u.id, "name":u.name, "role":u.role, "organization_id":u.organization_id,
            "teacher_id":u.teacher_id, "is_admin":bool(u.is_admin)}

@app.get("/api/health")
def health():
    return jsonify(status="ok", database="connected")

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name, password, role = str(data.get("name","")).strip(), str(data.get("password","")), data.get("role")
    if not name or len(password) < 8 or role not in ("guru", "siswa", "personal"):
        return jsonify(error="Nama, peran valid, dan password minimal 8 karakter wajib diisi."), 400
    org_id = data.get("organization_id")
    teacher_id = data.get("teacher_id")
    if role == "guru":
        org_name = str(data.get("organization_name","")).strip()
        if not org_name:
            return jsonify(error="Nama lembaga wajib diisi untuk akun guru."), 400
        org_id = "org_" + os.urandom(12).hex()
        db.session.add(Organization(id=org_id, name=org_name, meta=data.get("organization_meta") or {}))
    elif role == "siswa":
        teacher = db.session.get(User, teacher_id) if teacher_id else None
        if not teacher or teacher.role != "guru":
            return jsonify(error="Guru tujuan tidak ditemukan."), 400
        org_id = teacher.organization_id
    uid = "usr_" + os.urandom(12).hex()
    user = User(id=uid, name=name, role=role, organization_id=org_id, teacher_id=teacher_id,
                password_hash=generate_password_hash(password))
    db.session.add(user); db.session.commit()
    return jsonify(token=issue_token(user), user=user_json(user)), 201

@app.post("/api/auth/login")
def auth_login():
    data = request.get_json(silent=True) or {}
    name, password = str(data.get("name","")).strip().casefold(), str(data.get("password",""))
    q = User.query.filter(db.func.lower(User.name) == name)
    if data.get("role"): q = q.filter_by(role=data["role"])
    if data.get("organization_id"): q = q.filter_by(organization_id=data["organization_id"])
    users = q.limit(3).all()
    user = next((u for u in users if u.password_hash and check_password_hash(u.password_hash, password)), None)
    if not user: return jsonify(error="Nama atau password tidak cocok."), 401
    return jsonify(token=issue_token(user), user=user_json(user))

@app.get("/api/auth/me")
@login_required
def me():
    return jsonify(user=user_json(g.user))

@app.get("/api/organizations")
def organizations():
    return jsonify(items=[{"id":o.id,"name":o.name} for o in Organization.query.order_by(Organization.name).all()])

@app.get("/api/teachers")
def teachers():
    q = User.query.filter_by(role="guru")
    if request.args.get("organization_id"): q=q.filter_by(organization_id=request.args["organization_id"])
    return jsonify(items=[user_json(u) for u in q.order_by(User.name).all()])

@app.get("/api/students")
@teacher_required
def list_students():
    rows=User.query.filter_by(role="siswa", teacher_id=g.user.id).order_by(User.name).all()
    return jsonify(items=[user_json(u) for u in rows])

@app.post("/api/students")
@teacher_required
def add_student():
    data=request.get_json(silent=True) or {}
    name=str(data.get("name","")).strip()
    if not name: return jsonify(error="Nama siswa wajib diisi."),400
    u=User(id="usr_"+os.urandom(12).hex(), name=name, role="siswa",
           organization_id=g.user.organization_id, teacher_id=g.user.id)
    db.session.add(u); db.session.commit()
    return jsonify(user=user_json(u)),201

@app.patch("/api/students/<student_id>/teacher")
@teacher_required
def move_student(student_id):
    data=request.get_json(silent=True) or {}
    student=db.session.get(User,student_id)
    target=db.session.get(User,str(data.get("teacher_id","")))
    if not student or student.role!="siswa" or student.organization_id!=g.user.organization_id:
        return jsonify(error="Siswa tidak ditemukan di lembaga Anda."),404
    if not target or target.role!="guru" or target.organization_id!=g.user.organization_id:
        return jsonify(error="Guru tujuan tidak valid."),400
    if not (g.user.is_admin or student.teacher_id==g.user.id):
        return jsonify(error="Tidak memiliki izin memindahkan siswa ini."),403
    student.teacher_id=target.id; db.session.commit()
    return jsonify(user=user_json(student))

@app.post("/api/students/<student_id>/reset-password")
@teacher_required
def reset_student_password(student_id):
    data=request.get_json(silent=True) or {}
    password=str(data.get("password",""))
    student=db.session.get(User,student_id)
    if not student or student.role!="siswa" or student.organization_id!=g.user.organization_id:
        return jsonify(error="Siswa tidak ditemukan."),404
    if not (g.user.is_admin or student.teacher_id==g.user.id):
        return jsonify(error="Tidak memiliki izin mereset akun ini."),403
    if len(password)<8: return jsonify(error="Password minimal 8 karakter."),400
    student.password_hash=generate_password_hash(password); db.session.commit()
    return jsonify(status="password_reset")

@app.get("/api/sync/<namespace>")
@login_required
def get_sync(namespace):
    if not namespace or len(namespace)>80: return jsonify(error="Namespace tidak valid."),400
    row=db.session.get(SyncedData,(g.user.id,namespace))
    return jsonify(namespace=namespace, data=row.payload if row else {}, updated_at=row.updated_at.isoformat() if row else None)

@app.put("/api/sync/<namespace>")
@login_required
def put_sync(namespace):
    if not namespace or len(namespace)>80: return jsonify(error="Namespace tidak valid."),400
    payload=(request.get_json(silent=True) or {}).get("data")
    if payload is None: return jsonify(error="Field data wajib ada."),400
    row=db.session.get(SyncedData,(g.user.id,namespace))
    if not row: row=SyncedData(user_id=g.user.id,namespace=namespace,payload=payload); db.session.add(row)
    else: row.payload=payload; row.updated_at=datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(status="saved",updated_at=row.updated_at.isoformat())

@app.post("/api/recordings")
@login_required
def upload_recording():
    if "audio" not in request.files: return jsonify(error="File audio tidak ditemukan."),400
    f=request.files["audio"]
    if not f.filename: return jsonify(error="Nama file kosong."),400
    student_id=request.form.get("student_id") or g.user.id
    student=db.session.get(User,student_id)
    if not student or (g.user.role=="siswa" and student.id!=g.user.id):
        return jsonify(error="Siswa tidak valid."),403
    if g.user.role=="guru" and student.teacher_id!=g.user.id:
        return jsonify(error="Siswa bukan anggota kelas Anda."),403
    if g.user.role not in ("guru","siswa"): return jsonify(error="Akun tidak diizinkan."),403
    rid="rec_"+os.urandom(12).hex()
    rec=Recording(id=rid,student_id=student.id,teacher_id=student.teacher_id,
                  filename=os.path.basename(f.filename)[:255],mime_type=f.mimetype or "audio/webm",audio=f.read())
    db.session.add(rec); db.session.commit()
    return jsonify(id=rid,status="uploaded"),201

@app.get("/api/recordings")
@login_required
def recordings():
    if g.user.role=="guru":
        q=Recording.query.filter_by(teacher_id=g.user.id)
    else:
        q=Recording.query.filter_by(student_id=g.user.id)
    return jsonify(items=[{"id":r.id,"student_id":r.student_id,"filename":r.filename,
        "mime_type":r.mime_type,"created_at":r.created_at.isoformat()} for r in q.order_by(Recording.created_at.desc()).all()])

@app.get("/api/recordings/<recording_id>")
@login_required
def get_recording(recording_id):
    r=db.session.get(Recording,recording_id)
    if not r: return jsonify(error="Rekaman tidak ditemukan."),404
    if g.user.id not in (r.student_id,r.teacher_id): return jsonify(error="Tidak memiliki akses."),403
    return send_file(BytesIO(r.audio), mimetype=r.mime_type, download_name=r.filename)

@app.get("/api/reports/students.csv")
@teacher_required
def export_students():
    students=User.query.filter_by(role="siswa",teacher_id=g.user.id).order_by(User.name).all()
    out=BytesIO()
    # UTF-8 BOM agar Excel membaca nama Indonesia dengan benar.
    content="\\ufeffNama,ID Siswa\\n"+"".join('"'+s.name.replace('"','""')+'","'+s.id+'"\\n' for s in students)
    return Response(content, mimetype="text/csv; charset=utf-8",
                    headers={"Content-Disposition":"attachment; filename=elfashih-daftar-siswa.csv"})

# Quran endpoints: bundled JSON cache remains a read-only convenience, not user storage.
QURAN_CACHE_DIR=os.path.join(BASE_DIR,"static","quran")
def fetch_quran(endpoint):
    req=urllib.request.Request("https://api.alquran.cloud/v1/"+endpoint,headers={"User-Agent":"elfashih/2.0"})
    with urllib.request.urlopen(req,timeout=15) as resp: return json.loads(resp.read().decode("utf-8"))
def json_response(data,status=200):
    response=Response(json.dumps(data,ensure_ascii=False),status=status,mimetype="application/json")
    response.headers["Cache-Control"]="public, max-age=86400"
    return response

@app.route("/")
def index(): return render_template("index.html")

@app.route("/quran/juz/<int:n>")
def get_juz(n):
    if not 1<=n<=30: return json_response({"error":"Invalid juz number"},400)
    path=os.path.join(QURAN_CACHE_DIR,f"juz-{n}.json")
    if os.path.exists(path):
        with open(path,encoding="utf-8") as f: return json_response(json.load(f))
    try:
        data=fetch_quran(f"juz/{n}/quran-uthmani")
        os.makedirs(QURAN_CACHE_DIR,exist_ok=True)
        with open(path,"w",encoding="utf-8") as f: json.dump(data,f,ensure_ascii=False)
        return json_response(data)
    except Exception as e: return json_response({"error":"Data Quran sementara tidak dapat diambil."},502)

@app.route("/quran/surah/<int:n>")
def get_surah(n):
    if not 1<=n<=114: return json_response({"error":"Invalid surah number"},400)
    path=os.path.join(QURAN_CACHE_DIR,f"surah-{n}.json")
    if os.path.exists(path):
        with open(path,encoding="utf-8") as f: return json_response(json.load(f))
    try:
        data=fetch_quran(f"surah/{n}/quran-uthmani")
        with open(path,"w",encoding="utf-8") as f: json.dump(data,f,ensure_ascii=False)
        return json_response(data)
    except Exception: return json_response({"error":"Data Quran sementara tidak dapat diambil."},502)

@app.route("/manifest.json")
def manifest(): return send_from_directory("static/pwa","manifest.json",mimetype="application/manifest+json")
@app.route("/sw.js")
def service_worker():
    response=send_from_directory("static/pwa","sw.js",mimetype="application/javascript")
    response.headers["Cache-Control"]="no-cache, no-store, must-revalidate"
    response.headers["Service-Worker-Allowed"]="/"
    return response
@app.route("/static/pwa/<path:filename>")
def pwa_static(filename): return send_from_directory("static/pwa",filename)

@app.cli.command("init-db")
def init_db():
    db.create_all()
    print("Tabel ElFashih berhasil disiapkan.")

with app.app_context():
    db.create_all()

if __name__=="__main__":
    app.run(host="0.0.0.0",port=int(os.environ.get("PORT",5000)),debug=False)
