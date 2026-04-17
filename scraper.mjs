import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'https://resultadoelectoral.onpe.gob.pe/presentacion-backend';
const DATA_FILE = new URL('./data.json', import.meta.url);
const IMG_CACHE = new URL('./img-cache', import.meta.url).pathname;

if (!fs.existsSync(IMG_CACHE)) fs.mkdirSync(IMG_CACHE, { recursive: true });

let browser = null;
let page = null;
let cachedData = null;
let scraping = false;
let lastScrape = null;

async function initBrowser() {
  if (browser && page && !page.isClosed()) return;
  if (browser) { try { await browser.close(); } catch(e) {} }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  page = await ctx.newPage();
  await page.goto('https://resultadoelectoral.onpe.gob.pe/main/resumen', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('text=ACTAS', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

async function fetchAPI(path) {
  if (!page) throw new Error('Browser not initialized');
  const url = `${BASE}${path}`;
  const result = await page.evaluate(async (u) => {
    try {
      const r = await fetch(u, { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } });
      if (!r.ok) return { success: false, status: r.status, data: null };
      const json = await r.json();
      return { success: json.success ?? true, data: json.data ?? json };
    } catch (e) {
      return { success: false, error: e.message, data: null };
    }
  }, url);
  return result;
}

export async function scrapeTotales(params = {}) {
  if (scraping) return cachedData;
  scraping = true;
  console.log('[scraper] Starting scrape...');
  
  try {
    await initBrowser();
    
    const proceso = await fetchAPI('/proceso/proceso-electoral-activo');
    const procesoId = proceso.data?.id || 2;
    
    const elecciones = await fetchAPI(`/proceso/${procesoId}/elecciones`);
    const eleccionesList = elecciones.data || [];
    
    const presi = eleccionesList.find(e => e.url?.includes('presidenciales') || e.nombre?.toLowerCase().includes('presiden'));
    const presiId = presi?.idEleccion || 10;
    
    const queries = [
      { key: 'nacional', path: `/resumen-general/totales?idEleccion=${presiId}&tipoFiltro=eleccion` },
      { key: 'peru', path: `/resumen-general/totales?idAmbitoGeografico=1&idEleccion=${presiId}&tipoFiltro=ambito_geografico` },
      { key: 'extranjero', path: `/resumen-general/totales?idAmbitoGeografico=2&idEleccion=${presiId}&tipoFiltro=ambito_geografico` },
      { key: 'mesa', path: '/mesa/totales?tipoFiltro=eleccion' },
      { key: 'participantes', path: `/resumen-general/participantes?idEleccion=${presiId}&tipoFiltro=eleccion` },
      { key: 'participantesPeru', path: `/resumen-general/participantes?idAmbitoGeografico=1&idEleccion=${presiId}&tipoFiltro=ambito_geografico` },
      { key: 'participantesExtranjero', path: `/resumen-general/participantes?idAmbitoGeografico=2&idEleccion=${presiId}&tipoFiltro=ambito_geografico` },
      { key: 'candidatos', path: `/eleccion-presidencial/participantes-ubicacion-geografica-nombre?idEleccion=${presiId}&tipoFiltro=eleccion` },
      { key: 'departamentos', path: `/ubigeos/departamentos?idAmbitoGeografico=1&idEleccion=${presiId}` },
    ];
    
    const results = {
      proceso: proceso.data,
      elecciones: eleccionesList,
      presiId,
      scrapedAt: new Date().toISOString(),
      totales: {}
    };
    
    for (const q of queries) {
      const res = await fetchAPI(q.path);
      results.totales[q.key] = res.data;
    }
    
    cachedData = results;
    lastScrape = new Date();
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(results, null, 2));
    console.log(`[scraper] Done at ${lastScrape.toISOString()}`);
    
    await cacheImages(results);
    
    return results;
  } catch (e) {
    console.error('[scraper] Error:', e.message);
    
    if (fs.existsSync(DATA_FILE)) {
      cachedData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      console.log('[scraper] Loaded from cache');
      return cachedData;
    }
    throw e;
  } finally {
    scraping = false;
  }
}

async function cacheImages(data) {
  const participantes = data.totales?.participantes || [];
  console.log(`[scraper] Caching ${participantes.length} images...`);
  
  for (const c of participantes) {
    if (c.dniCandidato) {
      const cached = path.join(IMG_CACHE, `c-${c.dniCandidato}.jpg`);
      if (!fs.existsSync(cached)) {
        try {
          const url = `https://resultadoelectoral.onpe.gob.pe/assets/img-reales/candidatos/${c.dniCandidato}.jpg`;
          const buf = await page.evaluate(async (u) => {
            try {
              const r = await fetch(u);
              if (!r.ok) return null;
              const blob = await r.blob();
              const ab = await blob.arrayBuffer();
              return Array.from(new Uint8Array(ab));
            } catch { return null; }
          }, url);
          if (buf) {
            fs.writeFileSync(cached, Buffer.from(buf));
          }
        } catch(e) {}
      }
    }
    if (c.codigoAgrupacionPolitica != null) {
      const code = String(c.codigoAgrupacionPolitica).padStart(8, '0');
      const cached = path.join(IMG_CACHE, `p-${code}.jpg`);
      if (!fs.existsSync(cached)) {
        try {
          const url = `https://resultadoelectoral.onpe.gob.pe/assets/img-reales/partidos/${code}.jpg`;
          const buf = await page.evaluate(async (u) => {
            try {
              const r = await fetch(u);
              if (!r.ok) return null;
              const blob = await r.blob();
              const ab = await blob.arrayBuffer();
              return Array.from(new Uint8Array(ab));
            } catch { return null; }
          }, url);
          if (buf) {
            fs.writeFileSync(cached, Buffer.from(buf));
          }
        } catch(e) {}
      }
    }
  }
  console.log(`[scraper] Image cache done`);
}

export function getCachedData() {
  if (cachedData) return cachedData;
  if (fs.existsSync(DATA_FILE)) {
    cachedData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return cachedData;
  }
  return null;
}

export function getLastScrape() { return lastScrape; }
export function getPage() { return page; }
