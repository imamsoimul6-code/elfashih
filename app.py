from flask import Flask, render_template, send_from_directory, jsonify, Response
import os, json, urllib.request, urllib.error

app = Flask(__name__)

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
