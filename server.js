'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = parseInt(process.env.PORT || '3002', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── German national public holidays ──────────────────────────────────────────

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=März, 4=April
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function shiftDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Returns a Set of YYYY-MM-DD strings for all German national holidays in `year`.
function germanHolidays(year) {
  const easter = easterSunday(year);
  const fixed = [
    new Date(year,  0,  1),  // Neujahr
    new Date(year,  4,  1),  // Tag der Arbeit
    new Date(year,  9,  3),  // Tag der deutschen Einheit
    new Date(year, 11, 25),  // 1. Weihnachtstag
    new Date(year, 11, 26),  // 2. Weihnachtstag
  ];
  const movable = [
    shiftDays(easter, -2),   // Karfreitag
    shiftDays(easter,  1),   // Ostermontag
    shiftDays(easter, 39),   // Christi Himmelfahrt
    shiftDays(easter, 50),   // Pfingstmontag
  ];
  return new Set([...fixed, ...movable].map(dateKey));
}

function isWorkday(date, holidays) {
  const dow = date.getDay(); // 0=So, 6=Sa
  return dow !== 0 && dow !== 6 && !holidays.has(dateKey(date));
}

// Returns the n-th workday (1-indexed) of a given year/month (month 0-indexed).
// German national holidays are excluded from the workday count.
function nthWorkday(year, month, n) {
  const holidays = germanHolidays(year);
  let count = 0;
  let day   = new Date(year, month, 1);
  while (day.getMonth() === month) {
    if (isWorkday(day, holidays)) {
      if (++count === n) return new Date(day);
    }
    day = shiftDays(day, 1);
  }
  return null;
}

// Returns `howMany` upcoming 7th-workday paydays starting from today (inclusive).
function nextPaydays(howMany) {
  const today = dateKey(new Date());
  const result = [];
  let year  = new Date().getFullYear();
  let month = new Date().getMonth();

  for (let guard = 0; result.length < howMany && guard < 24; guard++) {
    const payday = nthWorkday(year, month, 7);
    if (payday && dateKey(payday) >= today) {
      result.push(dateKey(payday));
    }
    if (++month > 11) { month = 0; year++; }
  }
  return result;
}

// ── Static file server ────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type':  MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.url === '/api/payday' || req.url.startsWith('/api/payday?')) {
    const paydays = nextPaydays(7);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ paydays }));
  }

  serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Gehalt Countdown läuft auf http://127.0.0.1:${PORT}`);
});
