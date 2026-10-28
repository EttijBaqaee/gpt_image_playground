#!/usr/bin/env python3
"""Browser integration regression for touch and mouse reference-image sorting.

Run against an isolated test deployment with Chromium/chromedriver on the same
host. No provider API is called. ADMIN_PASSWORD and the four path prefixes are
read from the environment or --env-file. Example:
  python3 scripts/verify-touch-sort.py --origin http://127.0.0.1:8787 \
      --env-file deploy/.env --output touch-sort-validation.json
"""
import argparse
import os
import tempfile
import json
import pathlib
import time
import urllib.error
import urllib.request
import struct
import zlib

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--origin',default='http://127.0.0.1:8787')
parser.add_argument('--driver',default='http://127.0.0.1:9515')
parser.add_argument('--env-file',type=pathlib.Path)
parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path('touch-sort-validation.json'))
args=parser.parse_args()
env=dict(os.environ)
if args.env_file:
    env.update(line.split('=',1) for line in args.env_file.read_text().splitlines() if '=' in line and not line.lstrip().startswith('#'))
if not env.get('ADMIN_PASSWORD'):
    parser.error('Set ADMIN_PASSWORD or use --env-file with the test deployment password')
def prefix(name):
    value=env.get(name,'').strip().strip('/')
    return '/'+value if value else ''
driver=args.driver.rstrip('/')
origin=args.origin.rstrip('/')
api=prefix('API_BASE_PATH')+'/api'
session = None
checks = []


def request(method, route, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(driver + route, data=data, headers={"Content-Type": "application/json"}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response).get("value")
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode()) from error


def wd(method, route, body=None):
    return request(method, f"/session/{session}{route}", body)


def js(source, *args):
    return wd("POST", "/execute/sync", {"script": source, "args": list(args)})


def check(name, result):
    assert result, name
    checks.append(name)
    print("PASS " + name, flush=True)


try:
    result = request("POST", "/session", {"capabilities": {"alwaysMatch": {
        "browserName": "chrome",
        "goog:chromeOptions": {"binary": "/usr/bin/chromium", "args": ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"]},
    }}})
    session = result["sessionId"]
    version = result["capabilities"]["browserVersion"]
    wd("POST", "/goog/cdp/execute", {"cmd": "Emulation.setDeviceMetricsOverride", "params": {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True}})
    wd("POST", "/goog/cdp/execute", {"cmd": "Emulation.setTouchEmulationEnabled", "params": {"enabled": True, "maxTouchPoints": 1}})
    wd("POST", "/goog/cdp/execute", {"cmd": "Emulation.setUserAgentOverride", "params": {"userAgent": "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36"}})
    app = origin + prefix('APP_BASE_PATH') + '/'
    wd("POST", "/url", {"url": app})
    deadline = time.time() + 15
    while time.time() < deadline and not js('return !!document.querySelector("input[type=password]")'):
        time.sleep(0.2)
    wd("POST", "/execute/async", {"script": "const done=arguments[arguments.length-1];fetch(arguments[1]+'/auth/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:arguments[0]})}).then(r=>done(r.status))", "args": [env["ADMIN_PASSWORD"],api]})
    wd("POST", "/url", {"url": app})
    deadline = time.time() + 20
    editor = False
    while time.time() < deadline:
        editor = js('return !!document.querySelector("[contenteditable=true]")')
        if editor:
            break
        time.sleep(0.2)
    check("mobile UI loaded", editor)
    fixture_dir=tempfile.TemporaryDirectory(prefix='gip-touch-sort-')
    fixtures=pathlib.Path(fixture_dir.name)
    def chunk(kind, data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    for n in range(8):
        pixel=bytes([40+n*25,100,180,255])
        raw=b''.join(b'\x00'+pixel*64 for _ in range(64))
        (fixtures/f'{n}.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',64,64,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
    file_input = wd("POST", "/element", {"using": "css selector", "value": 'input[type=file][accept="image/*"]'})["element-6066-11e4-a52e-4f735466cecf"]
    for n in range(8):
        wd("POST", "/element/" + file_input + "/value", {"text": str(fixtures/f'{n}.png')})
        time.sleep(0.5)
        file_input = wd("POST", "/element", {"using": "css selector", "value": 'input[type=file][accept="image/*"]'})["element-6066-11e4-a52e-4f735466cecf"]
    positions = js("""return Array.from(document.querySelectorAll('[data-input-image-id]')).map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.inputImageId,x:r.left+r.width/2,y:r.top+r.height/2}})""")
    check("eight reference images loaded", len(positions) == 8)
    check("reference images wrap across rows", len(set(p['y'] for p in positions)) > 1)
    source = positions[0]
    wd("POST", "/actions", {"actions": [{"type": "pointer", "id": "tap", "parameters": {"pointerType": "touch"}, "actions": [
        {"type": "pointerMove", "duration": 0, "x": round(source["x"]), "y": round(source["y"])},
        {"type": "pointerDown", "button": 0}, {"type": "pause", "duration": 100}, {"type": "pointerUp", "button": 0},
    ]}]})
    time.sleep(.4)
    check("short touch still selects reference image", js('return document.querySelector(`[data-input-image-id="'+source["id"]+'"] button[aria-pressed="true"]`)!==null'))
    positions = js("""return Array.from(document.querySelectorAll('[data-input-image-id]')).map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.inputImageId,x:r.left+r.width/2,y:r.top+r.height/2}})""")
    before = [item["id"] for item in positions]
    source, target = positions[0], positions[-1]
    wd("POST", "/actions", {"actions": [{"type": "pointer", "id": "touch-drag", "parameters": {"pointerType": "touch"}, "actions": [
        {"type": "pointerMove", "duration": 0, "x": round(source["x"]), "y": round(source["y"])},
        {"type": "pointerDown", "button": 0}, {"type": "pause", "duration": 650},
        {"type": "pointerMove", "duration": 400, "x": round(target["x"]), "y": round(target["y"])},
        {"type": "pause", "duration": 150}, {"type": "pointerUp", "button": 0},
    ]}]})
    time.sleep(0.4)
    after = js('return Array.from(document.querySelectorAll("[data-input-image-id]")).map(e=>e.dataset.inputImageId)')
    check("mobile long press then cross-row drag reorders images", after == before[1:]+before[:1])
    check("drag gesture does not open image editor", not js('return !!document.querySelector("#mask-editor-title,[role=dialog]")'))
    def order():
        return js('return Array.from(document.querySelectorAll("[data-input-image-id]")).map(e=>e.dataset.inputImageId)')
    def points():
        return js("return Array.from(document.querySelectorAll('[data-input-image-id]')).map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.inputImageId,x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})")
    def touch(point,kind='touchStart',extra=None):
        payload={'type':kind,'touchPoints':[] if kind in ('touchEnd','touchCancel') else [{'x':point['x'],'y':point['y'],'id':1}]}
        if extra: payload['touchPoints']+=extra
        return wd('POST','/goog/cdp/execute',{'cmd':'Input.dispatchTouchEvent','params':payload})
    def drag(a,b,hold=.6):
        touch(a);time.sleep(hold)
        for step in range(1,7):
            touch({'x':round(a['x']+(b['x']-a['x'])*step/6),'y':round(a['y']+(b['y']-a['y'])*step/6)},'touchMove')
            time.sleep(.05)
        touch(b,'touchEnd');time.sleep(.8)
    def idle():
        return js('return !document.querySelector("[data-input-image-id].scale-95")')
    time.sleep(.8)
    p=points()
    drag(p[-1],p[0])
    check('mobile reverse drag restores order',order()==before)
    baseline=order();p=points()
    touch(p[0]);time.sleep(.6)
    check('long press shows drag feedback',not idle())
    touch(p[-1],'touchMove');touch(p[-1],'touchCancel');time.sleep(.8)
    check('touchcancel discards reorder and clears feedback',order()==baseline and idle())
    p=points();drag(p[0],{'x':p[0]['x'],'y':p[0]['y']-80})
    check('dropping outside thumbnails cancels reorder',order()==baseline and idle())
    js("window.touchSortMoves=[];document.addEventListener('touchmove',e=>window.touchSortMoves.push(e.defaultPrevented),{passive:true})")
    p=points();drag(p[0],p[-1],hold=.05)
    check('ordinary swipe does not reorder images',order()==baseline and idle())
    check('ordinary swipe leaves native scrolling enabled',js('return touchSortMoves.length>0 && touchSortMoves.every(x=>!x)'))
    wd('POST','/goog/cdp/execute',{'cmd':'Emulation.setTouchEmulationEnabled','params':{'enabled':True,'maxTouchPoints':2}})
    p=points();touch(p[0]);time.sleep(.6)
    touch(p[0],'touchStart',[{'x':p[-1]['x'],'y':p[-1]['y'],'id':2}]);touch(p[0],'touchEnd');time.sleep(.8)
    check('second finger cancels reorder and clears feedback',order()==baseline and idle())
    # A short tap after a completed drag must regain the existing edit action.
    p=points()
    selected=js('return document.querySelector("[data-input-image-id] button[aria-pressed]").getAttribute("aria-pressed")==="true"')
    if not selected:
        touch(p[0]);time.sleep(.08);touch(p[0],'touchEnd');time.sleep(.3)
    check('selection works after cancelled gestures',js('return document.querySelector("[data-input-image-id] button[aria-pressed=true]")!==null'))
    delete=js("const e=document.querySelector('[data-input-image-id] [data-input-image-action=delete]');const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}")
    touch(delete);time.sleep(.08);touch(delete,'touchEnd');time.sleep(.4)
    check('touch delete still removes only its reference image',order()==baseline[1:])
    # Resize the same browser to desktop mode and drive genuine mouse input.
    wd('POST','/goog/cdp/execute',{'cmd':'Emulation.setTouchEmulationEnabled','params':{'enabled':False}})
    wd('POST','/goog/cdp/execute',{'cmd':'Emulation.setUserAgentOverride','params':{'userAgent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'}})
    wd('POST','/goog/cdp/execute',{'cmd':'Emulation.setDeviceMetricsOverride','params':{'width':1200,'height':900,'deviceScaleFactor':1,'mobile':False}})
    time.sleep(.5)
    check('desktop thumbnails retain native draggable behavior',js('return Array.from(document.querySelectorAll("[data-input-image-id]")).every(e=>e.draggable)'))
    p=points();baseline=order();source,target=p[0],p[-1]
    wd('POST','/actions',{'actions':[{'type':'pointer','id':'desktop-mouse','parameters':{'pointerType':'mouse'},'actions':[
        {'type':'pointerMove','duration':0,'x':source['x'],'y':source['y']},
        {'type':'pointerDown','button':0},{'type':'pause','duration':600},
        {'type':'pointerMove','duration':500,'x':target['x'],'y':target['y']},
        {'type':'pause','duration':150},{'type':'pointerUp','button':0},
    ]}]})
    time.sleep(.4)
    check('desktop mouse drag still reorders images',order()==baseline[1:]+baseline[:1])
    args.output.write_text(json.dumps({"browser": "Chromium", "version": version, "touch_input": "emulated via WebDriver and CDP", "physical_phone_tested": False, "passed": len(checks), "checks": checks}, indent=2))
finally:
    if session:
        request("DELETE", "/session/" + session)

    if "fixture_dir" in globals():
        fixture_dir.cleanup()
