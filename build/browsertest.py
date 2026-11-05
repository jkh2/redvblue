import sys, time
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]
url = 'file:///home/claude/redvblue/index.html'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1360, 'height': 860})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(url); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/1-start.png')
    pg.click('#modeSeg >> text=Voters'); pg.wait_for_timeout(700)
    pg.screenshot(path=f'{OUT}/2-start-voters.png')
    pg.click('#modeSeg >> text=Land'); pg.click('#startDlg >> text=Start game'); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/3-board.png')
    # place all on the biggest red region (Texas) via All chip
    pg.click('#actions >> text=All')
    tx = pg.evaluate("[...document.querySelectorAll('#badges .badge')].findIndex((b,i)=>DATA.regions[i].name.startsWith('Tarrant'))")
    box = pg.evaluate(f"(()=>{{const r=document.querySelectorAll('#badges .badge')[{tx}].getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}})()")
    pg.mouse.click(*box); pg.wait_for_timeout(300)
    print('phase after place', pg.inner_text('#prompt'))
    # find a blue neighbor of the Texas region and drag onto it
    tgt = pg.evaluate(f"DATA.regions[{tx}].adj.find(j=>DATA.regions[j].party==='D' && DATA.regions[j].st==='TX')")
    tb = pg.evaluate(f"(()=>{{const r=document.querySelectorAll('#badges .badge')[{tgt}].getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}})()")
    pg.mouse.move(*box); pg.mouse.down(); pg.mouse.move((box[0]+tb[0])/2,(box[1]+tb[1])/2, steps=5); pg.mouse.move(*tb, steps=5)
    pg.screenshot(path=f'{OUT}/4-drag.png')
    pg.mouse.up(); pg.wait_for_timeout(400)
    print('toast', pg.inner_text('#toast'))
    print('log', pg.inner_text('#log')[:200])
    pg.screenshot(path=f'{OUT}/5-after-attack.png')
    # zoom in on the northeast
    pg.mouse.move(1150, 330)
    for _ in range(6): pg.mouse.wheel(0, -300); pg.wait_for_timeout(50)
    pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/6-zoom.png')
    pg.click('#zfit')
    pg.click('#actions >> text=Done attacking'); pg.click('#actions >> text=End turn')
    t0 = time.time()
    while 'Place' not in pg.inner_text('#prompt') and time.time()-t0 < 60:
        pg.wait_for_timeout(500)
    print('after AI turn:', pg.inner_text('#prompt'), round(time.time()-t0,1),'s')
    pg.screenshot(path=f'{OUT}/7-after-ai.png')
    # mobile
    m = b.new_page(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)
    m.goto(url); m.wait_for_timeout(1200); m.screenshot(path=f'{OUT}/8-mobile-start.png')
    m.click('#startDlg >> text=Start game'); m.wait_for_timeout(500); m.screenshot(path=f'{OUT}/9-mobile-board.png')
    print('errors', errs)
    b.close()
