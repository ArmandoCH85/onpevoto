import express from 'express';
import { scrapeTotales, getCachedData, getLastScrape } from './scraper.mjs';
import maxmind from 'maxmind';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;
const IMG_DIR = new URL('./img-cache', import.meta.url).pathname.replace(/^\/(?!\/)/, '/');
const GEOIP_DB = new URL('./geoip/GeoLite2-Country.mmdb', import.meta.url).pathname;
const VISITS_FILE = new URL('./visits.json', import.meta.url).pathname;

let geoipReader = null;

const visits = {
  total: 0,
  countries: {},
  lastSave: 0,
};

function loadVisits() {
  if (fs.existsSync(VISITS_FILE)) {
    try {
      const d = JSON.parse(fs.readFileSync(VISITS_FILE, 'utf8'));
      visits.total = d.total || 0;
      visits.countries = d.countries || {};
    } catch {}
  }
}

function saveVisits() {
  const now = Date.now();
  if (now - visits.lastSave < 30000) return;
  visits.lastSave = now;
  fs.writeFileSync(VISITS_FILE, JSON.stringify({ total: visits.total, countries: visits.countries }, null, 2));
}

function getClientIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

function trackVisit(req, res, next) {
  const ip = getClientIP(req);
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();

  const now = Date.now();
  const sessionKey = `v_${ip}_${Math.floor(now / 300000)}`;
  if (req.headers.cookie?.includes(sessionKey)) return next();

  visits.total++;
  if (geoipReader) {
    try {
      const result = geoipReader.get(ip);
      const country = result?.country?.iso_code || result?.registered_country?.iso_code || 'XX';
      const name = result?.country?.names?.es || result?.country?.names?.en || result?.registered_country?.names?.en || 'Desconocido';
      const key = `${country}|${name}`;
      visits.countries[key] = (visits.countries[key] || 0) + 1;
    } catch {
      visits.countries['XX|Desconocido'] = (visits.countries['XX|Desconocido'] || 0) + 1;
    }
  } else {
    visits.countries['XX|Sin GeoIP'] = (visits.countries['XX|Sin GeoIP'] || 0) + 1;
  }

  res.setHeader('Set-Cookie', `${sessionKey}=1; Path=/; Max-Age=300; HttpOnly`);
  saveVisits();
  next();
}

app.use(express.static('public'));
app.use(trackVisit);

app.get('/img/candidatos/:dni.jpg', (req, res) => {
  const dni = req.params.dni.replace('.jpg', '');
  const cached = path.join(IMG_DIR, `c-${dni}.jpg`);
  if (fs.existsSync(cached)) return res.sendFile(cached);
  res.status(404).send('Not cached yet');
});

app.get('/img/partidos/:code.jpg', (req, res) => {
  const code = req.params.code.replace('.jpg', '');
  const cached = path.join(IMG_DIR, `p-${code}.jpg`);
  if (fs.existsSync(cached)) return res.sendFile(cached);
  res.status(404).send('Not cached yet');
});

app.get('/api/totales', (req, res) => {
  const data = getCachedData();
  if (!data) return res.status(503).json({ error: 'No data available yet. Wait for first scrape.' });
  res.json(data);
});

app.get('/api/refresh', async (req, res) => {
  try {
    const data = await scrapeTotales();
    res.json({ success: true, scrapedAt: data.scrapedAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/candidatos', (req, res) => {
  const data = getCachedData();
  if (!data) return res.status(503).json({ error: 'No data available yet.' });
  const t = data.totales || {};
  res.json({
    proceso: data.proceso,
    presiId: data.presiId,
    scrapedAt: data.scrapedAt,
    totalesNacional: t.nacional,
    participantes: t.participantes,
    participantesPeru: t.participantesPeru,
    participantesExtranjero: t.participantesExtranjero,
    candidatos: t.candidatos,
  });
});

  app.get('/api/status', (req, res) => {
    const data = getCachedData();
    res.json({
      hasData: !!data,
      lastScrape: getLastScrape()?.toISOString() || data?.scrapedAt || null,
      totalTypes: data ? Object.keys(data.totales || {}) : []
    });
  });

  app.get('/api/departamentos', (req, res) => {
    const data = getCachedData();
    if (!data) return res.status(503).json({ error: 'No data available yet.' });
    const deptoList = data.totales.departamentos || [];
    const resultados = data.totales.departamentosResultados || {};
    if (req.query.all === '1') {
      const all = {};
      for (const d of deptoList) {
        if (resultados[d.ubigeo]) all[d.ubigeo] = { nombre: d.nombre, participantes: resultados[d.ubigeo] };
      }
      return res.json(all);
    }
    res.json(deptoList);
  });

  app.get('/api/departamentos/:ubigeo', (req, res) => {
    const data = getCachedData();
    if (!data) return res.status(503).json({ error: 'No data available yet.' });
    const ubigeo = req.params.ubigeo;
    const resultados = data.totales.departamentosResultados?.[ubigeo];
    if (!resultados) return res.status(404).json({ error: 'Departamento not found' });
    const depto = (data.totales.departamentos || []).find(d => d.ubigeo === ubigeo);
    res.json({ ubigeo, nombre: depto?.nombre || '', participantes: resultados });
  });

  app.get('/api/visitas', (req, res) => {
    const top = Object.entries(visits.countries)
      .map(([key, count]) => {
        const [code, name] = key.split('|');
        return { code, name, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    res.json({ total: visits.total, countries: top });
  });

async function start() {
  console.log('[server] Starting...');

  loadVisits();

  if (fs.existsSync(GEOIP_DB)) {
    try {
      geoipReader = await maxmind.open(GEOIP_DB);
      console.log('[server] GeoIP loaded');
    } catch (e) {
      console.error('[server] GeoIP load failed:', e.message);
    }
  } else {
    console.log('[server] No GeoIP DB found at', GEOIP_DB);
    console.log('[server] Visit tracking will work without country detection');
  }
  
  try {
    await scrapeTotales();
  } catch (e) {
    console.error('[server] Initial scrape failed:', e.message);
    console.log('[server] Will retry in 60s...');
    setTimeout(() => scrapeTotales().catch(console.error), 60000);
  }
  
  setInterval(() => {
    scrapeTotales().catch(e => console.error('[server] Periodic scrape failed:', e.message));
  }, 5 * 60 * 1000);
  
  app.listen(PORT, () => {
    console.log(`[server] Running at http://localhost:${PORT}`);
  });
}

start();
