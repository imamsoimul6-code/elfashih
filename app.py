from flask import Flask, render_template, send_from_directory, jsonify, Response
import os, json, urllib.request, urllib.error, time

app = Flask(__name__)

QURAN_CACHE_DIR = os.path.join(os.path.dirname(__file__), 'static', 'quran')
os.makedirs(QURAN_CACHE_DIR, exist_ok=True)

# ── Multiple API sources untuk fallback ──────────────────────────────────────
JUZ_APIS = [
    'https://api.alquran.cloud/v1/juz/{n}/quran-uthmani',
    'https://cdn.jsdelivr.net/npm/quran-json@3.1.2/data/quran.json',  # tidak cocok, skip via except
]

SURAH_APIS = [
    'https://api.alquran.cloud/v1/surah/{n}/quran-uthmani',
]

def _fetch_url(url, timeout=20):
    """Fetch URL dengan retry sekali."""
    headers = {
        'User-Agent': 'elfashih/1.0',
        'Accept': 'application/json',
    }
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode('utf-8')
                return json.loads(raw)
        except (urllib.error.URLError, OSError) as e:
            if attempt == 0:
                time.sleep(1)
                continue
            raise
        except json.JSONDecodeError as e:
            raise ValueError(f'Invalid JSON from {url}: {e}')

def fetch_juz_from_api(juz_num):
    errors = []
    urls = [
        f'https://api.alquran.cloud/v1/juz/{juz_num}/quran-uthmani',
        f'https://quranapi.pages.dev/api/juz/{juz_num}.json',
    ]
    for url in urls:
        try:
            data = _fetch_url(url)
            # Normalise quranapi.pages.dev format jika perlu
            if isinstance(data, list):
                # Format berbeda, wrap supaya konsisten
                data = {'code': 200, 'status': 'OK', 'data': {'ayahs': data}}
            return data
        except Exception as e:
            errors.append(f'{url}: {e}')
            continue
    raise RuntimeError('Semua API gagal untuk juz ' + str(juz_num) + ': ' + '; '.join(errors))

def fetch_surah_from_api(surah_num):
    url = f'https://api.alquran.cloud/v1/surah/{surah_num}/quran-uthmani'
    return _fetch_url(url)

def get_cached_juz_path(juz_num):
    return os.path.join(QURAN_CACHE_DIR, f'juz-{juz_num}.json')

def get_cached_surah_path(surah_num):
    return os.path.join(QURAN_CACHE_DIR, f'surah-{surah_num}.json')

def json_response(data, status=200):
    resp = Response(
        json.dumps(data, ensure_ascii=False),
        status=status,
        mimetype='application/json'
    )
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Cache-Control'] = 'public, max-age=86400'
    return resp

# ── Routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/quran/juz/<int:juz_num>')
def get_juz(juz_num):
    if not 1 <= juz_num <= 30:
        return json_response({'error': 'Invalid juz number'}, 400)
    cache_path = get_cached_juz_path(juz_num)
    # Sajikan dari cache dulu
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json_response(json.load(f))
    # Fetch dari API dengan fallback
    try:
        data = fetch_juz_from_api(juz_num)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        return json_response(data)
    except Exception as e:
        app.logger.error(f'fetch_juz {juz_num} failed: {e}')
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
        app.logger.error(f'fetch_surah {surah_num} failed: {e}')
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
