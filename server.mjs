import express from 'express';
import { scrapeTotales, getCachedData, getLastScrape } from './scraper.mjs';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;
const IMG_DIR = new URL('./img-cache', import.meta.url).pathname.replace(/^\/(?!\/)/, '/');

app.use(express.static('public'));

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

async function start() {
  console.log('[server] Starting...');
  
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
