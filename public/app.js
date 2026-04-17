const API = '/api/totales';
const API_CAND = '/api/candidatos';

let appData = null;
let currentScope = 'nacional';

export async function fetchAllData() {
  if (appData) return appData;
  try {
    const [r1, r2] = await Promise.all([fetch(API), fetch(API_CAND)]);
    const d1 = await r1.json();
    const d2 = await r2.json();
    appData = {
      proceso: d1.proceso,
      elecciones: d1.elecciones,
      presiId: d1.presiId,
      scrapedAt: d1.scrapedAt,
      totales: d1.totales || {},
      participantes: d2.participantes || [],
      participantesPeru: d2.participantesPeru || [],
      participantesExtranjero: d2.participantesExtranjero || [],
      candidatos: d2.candidatos || [],
    };
    return appData;
  } catch (e) {
    console.error('fetch error', e);
    throw e;
  }
}

export function getData() { return appData; }

export function setScope(s) { currentScope = s; }
export function getScope() { return currentScope; }

export function getList() {
  if (!appData) return [];
  if (currentScope === 'peru') return appData.participantesPeru || [];
  if (currentScope === 'extranjero') return appData.participantesExtranjero || [];
  return appData.participantes || [];
}

export function getTotales(scope) {
  const s = scope || currentScope;
  const t = appData?.totales || {};
  if (s === 'peru') return t.peru;
  if (s === 'extranjero') return t.extranjero;
  return t.nacional;
}

export const fmt = (n) => n == null ? '-' : Math.round(n).toLocaleString('es-PE');
export const fmtPct = (n) => n == null ? '-' : Number(n).toFixed(3) + '%';
export const fmtPctShort = (n) => n == null ? '-' : Number(n).toFixed(1) + '%';
export const fmtDiff = (n) => {
  if (n == null) return '-';
  if (n >= 1000000) return '+' + (n / 1000000).toFixed(2) + 'M';
  return '+' + Math.round(n).toLocaleString('es-PE');
};
export const fmtDate = (ts) => {
  if (!ts) return '-';
  const d = ts > 1e12 ? new Date(ts) : new Date(ts);
  return d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export function photoUrl(dni) {
  return dni ? `/img/candidatos/${dni}.jpg` : '';
}

export function partyLogoUrl(code) {
  return code != null ? `/img/partidos/${String(code).padStart(8, '0')}.jpg` : '';
}

export function renderHeader() {
  const data = getData();
  const ts = data?.totales?.nacional?.fechaActualizacion || data?.scrapedAt;
  document.getElementById('update-time').textContent = ts ? fmtDate(ts) : '...';
  document.getElementById('process-name').textContent =
    data?.proceso?.nombreProcesoElectoral || 'Elecciones Generales 2026';
}

export function renderScopeTabs(containerId, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const scopes = [
    { key: 'nacional', label: 'Nacional' },
    { key: 'peru', label: 'Peru' },
    { key: 'extranjero', label: 'Extranjero' },
  ];
  el.innerHTML = `<div class="scope-tabs">${scopes.map(s =>
    `<button class="scope-tab${s.key === currentScope ? ' active' : ''}" data-scope="${s.key}">${s.label}</button>`
  ).join('')}</div>`;

  el.querySelectorAll('.scope-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      el.querySelectorAll('.scope-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      setScope(tab.dataset.scope);
      if (onChange) onChange();
    });
  });
}

export function renderMiniStats(containerId, t) {
  if (!t) return;
  document.getElementById(containerId).innerHTML = `
    <div class="mini-stat"><div class="label">Actas Contabilizadas</div><div class="value red">${fmtPct(t.actasContabilizadas)}</div></div>
    <div class="mini-stat"><div class="label">Participacion</div><div class="value green">${fmtPct(t.participacionCiudadana)}</div></div>
    <div class="mini-stat"><div class="label">Votos Validos</div><div class="value blue">${fmt(t.totalVotosValidos)}</div></div>
    <div class="mini-stat"><div class="label">Votos Emitidos</div><div class="value">${fmt(t.totalVotosEmitidos)}</div></div>
  `;
}
