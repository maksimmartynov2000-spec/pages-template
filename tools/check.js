// Проверка шаблона: вид на ширине 393 (iPhone 15) и 744 (iPad mini), светлая и тёмная тема, и самообновление.
// Запуск: node tools/check.js   (нужен Playwright; скриншоты — в .work/)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.join(ROOT, '.work');
fs.mkdirSync(WORK, { recursive: true });

// копия сайта во временной папке: в ней меняем метку, чтобы изобразить «вышла новая версия»
const SITE = path.join(WORK, 'site');
fs.mkdirSync(SITE, { recursive: true });
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const put = (build) => fs.writeFileSync(path.join(SITE, 'index.html'), SRC.replace(/(name="app-build" content=")[^"]*/, '$1' + build));

const server = http.createServer((req, res) => {
  const p = path.join(SITE, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(SITE) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(p));
});

let fails = 0;
const ok = (cond, what) => { console.log((cond ? '  ✓ ' : '  ✗ ') + what); if (!cond) fails++; };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();

  console.log('Вид:');
  put('2026-01-01·aaaaaaaa');
  for (const [name, w, h] of [['iphone15', 393, 852], ['ipadmini', 744, 1133], ['ipadmini-land', 1133, 744]]) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1, hasTouch: true });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      await page.goto(url);
      await page.waitForTimeout(300);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      const small = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.offsetParent && el.childNodes.length && parseFloat(getComputedStyle(el).fontSize) < 15).length);
      ok(sw <= w, `${name} ${scheme}: нет прокрутки вбок (${sw} ≤ ${w})`);
      ok(small === 0, `${name} ${scheme}: нет текста мельче 15px`);
      ok(errs.length === 0, `${name} ${scheme}: без ошибок JS ${errs.join('; ')}`);
      await page.screenshot({ path: path.join(WORK, `${name}-${scheme}.png`), fullPage: true });
      await ctx.close();
    }
  }

  console.log('Самообновление:');
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await ctx.newPage();
  put('2026-01-01·aaaaaaaa');
  await page.goto(url);
  await page.waitForTimeout(2200); // первая проверка через 1,5 с
  ok(await page.evaluate(() => window.__upd.on && window.__upd.found === null), 'та же сборка — ничего не происходит');

  put('2026-01-02·bbbbbbbb');
  await page.evaluate(() => window.__upd.check());
  await page.waitForFunction(() => window.__upd && window.__upd.build === '2026-01-02·bbbbbbbb', null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => window.__upd.build) === '2026-01-02·bbbbbbbb', 'новая сборка, человек свободен — обновилось само');
  ok(!/[?&]v=/.test(page.url()), 'адрес после обновления чистый');

  await page.fill('#note', 'пишу заметку');
  await page.focus('#note');
  put('2026-01-03·cccccccc');
  await page.evaluate(() => window.__upd.check());
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.__upd.build) === '2026-01-02·bbbbbbbb', 'человек печатает — не перезагрузилось');
  ok(await page.isVisible('#updbar'), 'показана плашка «Обновить»');
  await page.screenshot({ path: path.join(WORK, 'updbar.png') });
  await page.click('#updbar [data-upd="go"]');
  await page.waitForFunction(() => window.__upd && window.__upd.build === '2026-01-03·cccccccc', null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => window.__upd.build) === '2026-01-03·cccccccc', 'кнопка «Обновить» — обновилось');
  ok(await page.inputValue('#note') === 'пишу заметку', 'заметка сохранилась');

  await browser.close();
  server.close();
  console.log(fails ? `\nНе прошло: ${fails}` : '\nВсё прошло. Скриншоты — в .work/');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
