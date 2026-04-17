const API = '/api/totales';
const API_CAND = '/api/candidatos';
const API_DEPTOS = '/api/departamentos';

let appData = null;
let currentScope = 'nacional';
let departamentos = [];
let deptoResultadosCache = {};
let selectedDepto = null;

export async function fetchAllData() {
  if (appData) return appData;
  try {
    const [r1, r2, r3] = await Promise.all([fetch(API), fetch(API_CAND), fetch(`${API_DEPTOS}?all=1`)]);
    const d1 = await r1.json();
    const d2 = await r2.json();
    const deptoData = await r3.json();
    departamentos = Object.entries(deptoData).map(([ubigeo, d]) => ({ ubigeo, nombre: d.nombre }));
    for (const [ubigeo, d] of Object.entries(deptoData)) {
      deptoResultadosCache[ubigeo] = d.participantes || [];
    }
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

export function renderVoltereta(containerId, list, t) {
  const el = document.getElementById(containerId);
  if (!el || !t || !list || list.length < 2) { if (el) el.innerHTML = ''; return; }

  const sorted = [...list].sort((a, b) => (b.porcentajeVotosValidos || 0) - (a.porcentajeVotosValidos || 0));
  const top3 = sorted.slice(0, 3);
  if (top3.length < 2) { el.innerHTML = ''; return; }

  const contabilizadas = Number(t.contabilizadas) || 0;
  const totalActas = Number(t.totalActas) || 0;
  const totalVotosEmitidos = Number(t.totalVotosEmitidos) || 0;
  const actasPendientes = totalActas - contabilizadas;
  const promedioVotosPorActa = contabilizadas > 0 ? totalVotosEmitidos / contabilizadas : 0;
  const votosPendientes = Math.round(actasPendientes * promedioVotosPorActa);
  const pctContabilizado = Number(t.actasContabilizadas) || 0;

  const diff12 = top3[0].totalVotosValidos - top3[1].totalVotosValidos;
  const diff23 = top3.length > 2 ? top3[1].totalVotosValidos - top3[2].totalVotosValidos : null;

  let status, statusCls, icon;
  if (votosPendientes > diff12) {
    status = 'LA CARRERA PUEDE DAR VUELTA';
    statusCls = 'voltereta-danger';
    icon = '⚠';
  } else if (diff23 != null && votosPendientes > diff23) {
    status = '2DO LUGAR EN RIESGO';
    statusCls = 'voltereta-warning';
    icon = '⚠';
  } else {
    status = 'VENTAJA ASEGURADA';
    statusCls = 'voltereta-safe';
    icon = '✓';
  }

  el.innerHTML = `
    <div class="voltereta-banner ${statusCls}">
      <div class="voltereta-icon">${icon}</div>
      <div class="voltereta-body">
        <div class="voltereta-status">${status}</div>
        <div class="voltereta-detail">
          Faltan ~${fmt(votosPendientes)} votos (${fmt(actasPendientes)} actas) | Diferencia 1ro-2do: ${fmtDiff(diff12)} votos${diff23 != null ? ' | 2do-3ro: ' + fmtDiff(diff23) : ''}
        </div>
      </div>
      <div class="voltereta-progress">
        <div class="voltereta-progress-label">${fmtPctShort(pctContabilizado)} contabilizado</div>
        <div class="voltereta-progress-bar"><div class="voltereta-progress-fill" style="width:${Math.min(pctContabilizado, 100)}%"></div></div>
      </div>
    </div>`;
}

export function getDepartamentos() { return departamentos; }
export function getSelectedDepto() { return selectedDepto; }
export function setSelectedDepto(ubigeo) { selectedDepto = ubigeo; }

export async function fetchDeptoResultados(ubigeo) {
  if (deptoResultadosCache[ubigeo]) return deptoResultadosCache[ubigeo];
  try {
    const r = await fetch(`/api/departamentos/${ubigeo}`);
    const data = await r.json();
    deptoResultadosCache[ubigeo] = data.participantes || [];
    return deptoResultadosCache[ubigeo];
  } catch { return []; }
}

export async function renderGeoSection(containerId, onDeptoSelect) {
  const el = document.getElementById(containerId);
  if (!el || !departamentos.length) { if (el) el.innerHTML = ''; return; }

  const natList = getList();
  const natSorted = [...natList].sort((a, b) => (b.porcentajeVotosValidos || 0) - (a.porcentajeVotosValidos || 0));
  const top3 = natSorted.slice(0, 3);

  el.innerHTML = `
    <div class="geo-section">
      <div class="geo-title">Donde gana cada candidato</div>
      <div class="geo-depto-select">
        <select id="geo-depto-dropdown">
          <option value="">Ver por departamento...</option>
          ${departamentos.map(d => `<option value="${d.ubigeo}">${d.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="geo-table" id="geo-table"></div>
    </div>`;

  document.getElementById('geo-depto-dropdown').addEventListener('change', async (e) => {
    const ubigeo = e.target.value;
    setSelectedDepto(ubigeo);
    if (onDeptoSelect) await onDeptoSelect(ubigeo);
  });

  await renderGeoTable('geo-table');
}

async function renderGeoTable(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const rows = [];
  for (const depto of departamentos) {
    const list = await fetchDeptoResultados(depto.ubigeo);
    const candidates = list.filter(c => c.dniCandidato && c.nombreCandidato);
    const sorted = [...candidates].sort((a, b) => (b.porcentajeVotosValidos || 0) - (a.porcentajeVotosValidos || 0));
    const d3 = sorted.slice(0, 3);
    if (d3.length < 2) continue;

    const diff12 = d3[0].totalVotosValidos - d3[1].totalVotosValidos;
    const diffCls = diff12 < 10000 ? 'geo-row-danger' : diff12 < 100000 ? 'geo-row-warning' : '';

    rows.push(`
      <div class="geo-row ${diffCls}" data-ubigeo="${depto.ubigeo}">
        <div class="geo-depto-name">${depto.nombre}</div>
        <div class="geo-winner">
          <img class="geo-winner-photo" src="${photoUrl(d3[0].dniCandidato)}" alt="" onerror="this.style.display='none'">
          <div>
            <div class="geo-winner-name">${d3[0].nombreCandidato || d3[0].nombreAgrupacionPolitica}</div>
            <div class="geo-winner-pct">${fmtPctShort(d3[0].porcentajeVotosValidos)}</div>
          </div>
        </div>
        <div class="geo-2nd">
          <div class="geo-2nd-name">${d3[1].nombreCandidato || d3[1].nombreAgrupacionPolitica}</div>
          <div class="geo-2nd-pct">${fmtPctShort(d3[1].porcentajeVotosValidos)}</div>
        </div>
        ${d3[2] ? `<div class="geo-3rd"><div class="geo-3rd-name">${d3[2].nombreCandidato || d3[2].nombreAgrupacionPolitica}</div><div class="geo-3rd-pct">${fmtPctShort(d3[2].porcentajeVotosValidos)}</div></div>` : '<div class="geo-3rd">-</div>'}
        <div class="geo-diff">${fmt(diff12)}</div>
      </div>`);
  }

  el.innerHTML = `
    <div class="geo-table-header">
      <div>Departamento</div><div>1er lugar</div><div>2do lugar</div><div>3er lugar</div><div>Diff 1-2</div>
    </div>
    ${rows.join('')}`;

  el.querySelectorAll('.geo-row').forEach(row => {
    row.addEventListener('click', () => {
      const ubigeo = row.dataset.ubigeo;
      const dropdown = document.getElementById('geo-depto-dropdown');
      if (dropdown) { dropdown.value = ubigeo; }
      setSelectedDepto(ubigeo);
      document.getElementById('geo-depto-dropdown').dispatchEvent(new Event('change'));
    });
  });
}

export async function renderVisitas(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    const r = await fetch('/api/visitas');
    const data = await r.json();
    const total = data.total || 0;
    const top = data.countries || [];

    const countryFlags = { PE: '🇵🇪', AR: '🇦🇷', CL: '🇨🇱', CO: '🇨🇴', EC: '🇪🇨', BR: '🇧🇷', US: '🇺🇸', ES: '🇪🇸', MX: '🇲🇽', VE: '🇻🇪', BO: '🇧🇴', CR: '🇨🇷', IT: '🇮🇹', FR: '🇫🇷', DE: '🇩🇪', GB: '🇬🇧', JP: '🇯🇵', CA: '🇨🇦', AU: '🇦🇺', XX: '🌐' };

    el.innerHTML = `
      <div class="visitas-widget">
        <div class="visitas-count">
          <span class="visitas-number">${total.toLocaleString('es-PE')}</span>
          <span class="visitas-label">visitas</span>
        </div>
        ${top.length > 0 ? `
          <div class="visitas-countries">
            ${top.slice(0, 5).map(c => `
              <div class="visitas-country">
                <span class="visitas-flag">${countryFlags[c.code] || '🌐'}</span>
                <span class="visitas-country-name">${c.name}</span>
                <span class="visitas-country-count">${c.count.toLocaleString('es-PE')}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>`;
  } catch {
    el.innerHTML = '';
  }
}

export function getShareText(list) {
  const sorted = [...(list || [])].sort((a, b) => (b.porcentajeVotosValidos || 0) - (a.porcentajeVotosValidos || 0));
  const top3 = sorted.slice(0, 3);
  if (!top3.length) return '';
  const t = getTotales();
  const pct = t?.actasContabilizadas ? Number(t.actasContabilizadas).toFixed(1) + '%' : '';
  let text = '🇵🇪 Elecciones 2026 — Resultados en vivo\n\n';
  top3.forEach((c, i) => {
    const pctV = Number(c.porcentajeVotosValidos || 0).toFixed(1);
    text += `${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${c.nombreCandidato || c.nombreAgrupacionPolitica} — ${pctV}%\n`;
  });
  if (top3.length >= 2) {
    const diff = top3[0].totalVotosValidos - top3[1].totalVotosValidos;
    text += `\n⚠️ Diferencia 1ro-2do: ${fmt(diff)} votos`;
  }
  if (top3.length >= 3) {
    const diff23 = top3[1].totalVotosValidos - top3[2].totalVotosValidos;
    text += `\n⚡ 2do-3ro: ${fmt(diff23)} votos`;
  }
  if (pct) text += `\n📊 ${pct} contabilizado`;
  text += '\n\n📊 votoperu.site';
  return text;
}

export function renderShareBar(containerId, list) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const text = getShareText(list);
  if (!text) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="share-bar">
      <button class="share-btn share-copy" id="share-copy-btn">📋 Copiar resultado</button>
      <a class="share-btn share-wa" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">💬 WhatsApp</a>
      <a class="share-btn share-tw" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">🐦 Twitter</a>
      <button class="share-btn share-img" id="share-img-btn">📷 Imagen</button>
    </div>`;

  document.getElementById('share-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('share-copy-btn');
      btn.textContent = '✅ Copiado!';
      setTimeout(() => { btn.textContent = '📋 Copiar resultado'; }, 2000);
    });
  });

  document.getElementById('share-img-btn')?.addEventListener('click', () => {
    generateShareImage(list);
  });
}

function generateShareImage(list) {
  const sorted = [...(list || [])].sort((a, b) => (b.porcentajeVotosValidos || 0) - (a.porcentajeVotosValidos || 0));
  const top3 = sorted.slice(0, 3);
  if (!top3.length) return;

  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#C41E3A';
  ctx.fillRect(0, 0, 1200, 90);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 32px Poppins, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🇵🇪  ELECCIONES 2026 — Resultados en Vivo', 600, 55);

  ctx.fillStyle = '#F8F9FA';
  ctx.fillRect(0, 90, 1200, 540);

  const medals = ['🥇', '🥈', '🥉'];
  const colors = ['#D4A017', '#607D8B', '#8D6E63'];
  const y = 130;
  top3.forEach((c, i) => {
    const row = y + i * 145;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.roundRect(40, row, 1120, 120, 16);
    ctx.fill();
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#212529';
    ctx.font = 'bold 28px Poppins, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${medals[i]}}`, 70, row + 45);
    ctx.fillText(c.nombreCandidato || c.nombreAgrupacionPolitica, 120, row + 45);

    ctx.fillStyle = '#868E96';
    ctx.font = '20px Poppins, sans-serif';
    ctx.fillText(c.nombreAgrupacionPolitica, 120, row + 80);

    ctx.fillStyle = '#C41E3A';
    ctx.font = 'bold 48px Poppins, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Number(c.porcentajeVotosValidos || 0).toFixed(1)}%`, 1120, row + 65);
  });

  ctx.fillStyle = '#868E96';
  ctx.font = '18px Poppins, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('votoperu.site — Datos oficiales ONPE', 600, 600);

  const link = document.createElement('a');
  link.download = 'resultados-elecciones-2026.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}
