#!/usr/bin/env python3
"""Linux Docker smoke checks; uses only isolated test containers and data."""
import argparse
import http.cookiejar
import json
import os
import pathlib
import re
import subprocess
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--image', required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
data = (args.output / 'data').resolve()
data.mkdir()
subprocess.run(['sudo', 'chown', '1000:1000', str(data)], check=True)
checks = []
containers = []
cookie = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie))
secret = 'isolated-docker-test-secret-only'
password = 'isolated-test-password'


def docker(*arguments):
    return subprocess.check_output(['docker', *arguments], text=True).strip()


def check(name, result):
    assert result, name
    checks.append(name)
    print('PASS ' + name, flush=True)


def request(origin, path, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(origin + path, data=body, headers={'Content-Type': 'application/json'})
    try:
        with opener.open(req, timeout=10) as response:
            return response.status, response.headers, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read().decode()


def start(label, prefixes):
    name = 'gip-release-smoke-' + label + '-' + str(os.getpid())
    containers.append(name)
    environment = {'APP_SECRET': secret, 'ADMIN_PASSWORD': password, **prefixes}
    command = ['run', '-d', '--name', name, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
               '--memory', '1536m', '--pids-limit', '128', '-p', '127.0.0.1::8787', '-v', str(data) + ':/app/data']
    for key, value in environment.items():
        command += ['-e', key + '=' + value]
    docker(*command, args.image)
    address = docker('port', name, '8787/tcp')
    origin = 'http://' + address.splitlines()[0]
    health = '/' + prefixes.get('HEALTH_BASE_PATH', '').strip('/')
    health = health.rstrip('/') + '/health'
    until = time.time() + 60
    while time.time() < until:
        try:
            if request(origin, health)[0] == 200:
                return name, origin
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(.5)
    raise RuntimeError('Container failed to become ready: ' + docker('logs', name))


def web(origin, app, assets):
    status, _, html = request(origin, app + '/')
    check('homepage serves at ' + app + '/', status == 200)
    scripts = re.findall(r'<script[^>]*src="([^"]+)"', html)
    styles = re.findall(r'<link[^>]*href="([^"]+\.css)"', html)
    check('entry script uses assets prefix ' + assets, bool(scripts) and all(url.startswith(assets + '/assets/') for url in scripts))
    check('entry stylesheet uses assets prefix ' + assets, bool(styles) and all(url.startswith(assets + '/assets/') for url in styles))
    for url in scripts + styles:
        status, headers, body = request(origin, url)
        check('static resource exists ' + url, status == 200 and 'text/html' not in headers.get('content-type', ''))
    return html


try:
    inspect = json.loads(docker('image', 'inspect', args.image))[0]
    check('Linux amd64 image', inspect['Os'] == 'linux' and inspect['Architecture'] == 'amd64')
    check('image version label matches release', inspect['Config']['Labels']['org.opencontainers.image.version'] == args.image.split(':')[-1])
    name, origin = start('default', {})
    check('application runs as UID 1000', docker('exec', name, 'id', '-u') == '1000')
    web(origin, '', '')
    check('default health works with trailing slash', request(origin, '/health/')[0] == 200)
    check('fresh instance requires login', not json.loads(request(origin, '/api/auth/status')[2])['authenticated'])
    status, _, body = request(origin, '/api/auth/admin/login', {'password': password})
    check('administrator login succeeds', status == 200 and json.loads(body)['authenticated'])
    check('session cookie authenticates subsequent request', json.loads(request(origin, '/api/auth/status')[2])['authenticated'])
    docker('stop', name)
    seed = """
      import {AppDatabase} from '/app/server/dist/lib/db.js';
      const db=new AppDatabase('/app/data/app.db');
      db.createTask({id:'legacy-sort-smoke',prompt:'test',paramsJson:'{}'});
      for(const id of ['z-first','m-second','a-third']) db.addTaskImage({id,taskId:'legacy-sort-smoke',kind:'input',filePath:id+'.png',mimeType:'image/png',bytes:1,sha256:id});
      db.sqlite.prepare('UPDATE task_images SET created_at=?').run('2026-10-31T00:00:00.000Z');
      db.sqlite.exec('DROP INDEX idx_task_images_order; ALTER TABLE task_images DROP COLUMN sort_order');
      db.sqlite.close();
    """
    docker('run', '--rm', '-v', str(data) + ':/app/data', '--entrypoint', 'node', args.image, '--input-type=module', '-e', seed)
    prefixes = {'APP_BASE_PATH': 'web', 'ASSETS_BASE_PATH': 's', 'API_BASE_PATH': 'a', 'MEDIA_BASE_PATH': 'm', 'HEALTH_BASE_PATH': 'h'}
    name, origin = start('independent', prefixes)
    html = web(origin, '/web', '/s')
    for key, prefix in [('app', '/web'), ('assets', '/s'), ('api', '/a'), ('media', '/m'), ('health', '/h')]:
        check(key + ' runtime prefix is injected', re.search(r'<meta\s+name="' + key + r'-base-path"\s+content="' + prefix + '"', html) is not None)
    check('independent health works with slash', request(origin, '/h/health/')[0] == 200)
    check('previous root API no longer matches', request(origin, '/api/auth/status')[0] == 404)
    # CookieJar scopes cookies to host and path, and does not include the port.
    check('data volume preserves authenticated session after recreation', json.loads(request(origin, '/a/api/auth/status')[2])['authenticated'])
    verify = """
      import {AppDatabase} from '/app/server/dist/lib/db.js';
      const db=new AppDatabase('/app/data/app.db');
      console.log(JSON.stringify(db.listTaskImages('legacy-sort-smoke').map(i=>({id:i.id,sortOrder:i.sortOrder}))));
      db.sqlite.close();
    """
    images = json.loads(docker('exec', name, 'node', '--input-type=module', '-e', verify))
    check('legacy data migration retains actual upload order in Docker', [image['id'] for image in images] == ['z-first', 'm-second', 'a-third'])
    check('legacy data receives persistent positions', [image['sortOrder'] for image in images] == [0, 1, 2])
    check('container server reports correct package version', docker('exec', name, 'node', '-p', "require('/app/server/package.json').version") == args.image.split(':')[-1])
    (args.output / 'report.json').write_text(json.dumps({'result': 'passed', 'image': args.image, 'imageId': inspect['Id'], 'checks': checks}, indent=2))
finally:
    for name in containers:
        logs = subprocess.run(['docker', 'logs', name], text=True, capture_output=True)
        # Login responses contain an opaque test cookie. Do not publish raw logs.
        (args.output / (name + '.log')).write_text(logs.stdout + logs.stderr)
        subprocess.run(['docker', 'rm', '-f', name], check=False, capture_output=True)
