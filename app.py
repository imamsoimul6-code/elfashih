from flask import Flask, render_template, send_from_directory
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

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
