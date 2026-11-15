from flask import Flask, render_template, send_from_directory, jsonify, Response, request
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.middleware.proxy_fix import ProxyFix
import os, json, time, urllib.request, urllib.error

from models import db, database_url
from api import api

app = Flask(__name__)
# Di Render ada 1 proxy di depan app: percaya X-Forwarded-For/Proto dari satu lapis itu (untuk IP asli & https)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
app.config.update(
    SQLALCHEMY_DATABASE_URI=database_url(),
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    # Neon/Render menutup koneksi yang menganggur; pre_ping + recycle mencegah error "connection closed"
    SQLALCHEMY_ENGINE_OPTIONS={'pool_pre_ping': True, 'pool_recycle': 280},
    MAX_CONTENT_LENGTH=8 * 1024 * 1024,
)
db.init_app(app)
app.register_blueprint(api)


def migrate_db():
    # db.create_all() tidak menambah kolom pada tabel yang sudah ada; tambahkan manual bila database lama belum punya.
    cols = {c['name'] for c in inspect(db.engine).get_columns('users')}
    if 'activation_code' not in cols:
        with db.engine.begin() as con:
            con.execute(text('ALTER TABLE users ADD COLUMN activation_code VARCHAR(12)'))


def init_db(retries=5):
    # Dua worker gunicorn bisa membuat tabel bersamaan; kalau salah satu kalah balapan, coba lagi.
    for i in range(retries):
        try:
            with app.app_context():
                db.create_all()
                migrate_db()
            return
        except SQLAlchemyError as e:
            if i == retries - 1:
                raise
            time.sleep(1 + i)


init_db()


@app.after_request
def security_headers(resp):
    resp.headers.setdefault('X-Content-Type-Options', 'nosniff')
    resp.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    resp.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
    if request.headers.get('X-Forwarded-Proto', request.scheme) == 'https':
        resp.headers.setdefault('Strict-Transport-Security', 'max-age=15552000')
    return resp


@app.errorhandler(404)
@app.errorhandler(405)
@app.errorhandler(413)
@app.errorhandler(500)
def api_errors(e):
    # Untuk /api selalu balas JSON (bukan halaman HTML error)
    if request.path.startswith('/api/'):
        code = getattr(e, 'code', 500) or 500
        msg = {404: 'Tidak ditemukan.', 405: 'Metode tidak diizinkan.', 413: 'Data terlalu besar.'}.get(code, 'Terjadi kesalahan di server.')
        return jsonify({'error': msg}), code
    return e

QURAN_CACHE_DIR = os.path.join(os.path.dirname(__file__), 'static', 'quran')
os.makedirs(QURAN_CACHE_DIR, exist_ok=True)

def fetch_juz_from_api(juz_num):
    url = f'https://api.alquran.cloud/v1/juz/{juz_num}/quran-uthmani'
    req = urllib.request.Request(url, headers={'User-Agent': 'elfashih/1.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))

def fetch_surah_from_api(surah_num):
    url = f'https://api.alquran.cloud/v1/surah/{surah_num}/quran-uthmani'
    req = urllib.request.Request(url, headers={'User-Agent': 'elfashih/1.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))

def get_cached_juz_path(juz_num):
    return os.path.join(QURAN_CACHE_DIR, f'juz-{juz_num}.json')

def get_cached_surah_path(surah_num):
    return os.path.join(QURAN_CACHE_DIR, f'surah-{surah_num}.json')

def json_response(data, status=200):
    resp = Response(json.dumps(data, ensure_ascii=False), status=status,
                    mimetype='application/json')
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Cache-Control'] = 'public, max-age=86400'
    return resp

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/quran/juz/<int:juz_num>')
def get_juz(juz_num):
    if not 1 <= juz_num <= 30:
        return json_response({'error': 'Invalid juz number'}, 400)
    cache_path = get_cached_juz_path(juz_num)
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json_response(json.load(f))
    try:
        data = fetch_juz_from_api(juz_num)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        return json_response(data)
    except Exception as e:
        return json_response({'error': str(e)}, 502)

@app.route('/quran/surah/<int:surah_num>')
def get_surah(surah_num):
    if not 1 <= surah_num <= 114:
        return json_response({'error': 'Invalid surah number'}, 400)
    cache_path = get_cached_surah_path(surah_num)
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json_response(json.load(f))
    try:
        data = fetch_surah_from_api(surah_num)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        return json_response(data)
    except Exception as e:
        return json_response({'error': str(e)}, 502)

@app.route('/quran/prefetch')
def prefetch_all():
    results = {}
    for juz_num in range(1, 31):
        cache_path = get_cached_juz_path(juz_num)
        if os.path.exists(cache_path):
            results[f'juz_{juz_num}'] = 'cached'
            continue
        try:
            data = fetch_juz_from_api(juz_num)
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
            results[f'juz_{juz_num}'] = 'downloaded'
        except Exception as e:
            results[f'juz_{juz_num}'] = f'error: {e}'
    return json_response({'status': 'done', 'results': results})

@app.route('/audio/<path:filename>')
def download_file(filename):
    return send_from_directory('static/audio', filename)

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static/pwa', 'manifest.json',
                               mimetype='application/manifest+json')

@app.route('/sw.js')
def service_worker():
    response = send_from_directory('static/pwa', 'sw.js',
                                   mimetype='application/javascript')
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Service-Worker-Allowed'] = '/'
    return response

@app.route('/static/pwa/<path:filename>')
def pwa_static(filename):
    return send_from_directory('static/pwa', filename)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)
