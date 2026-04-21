const HEADER_HTML = `
<a href="/" class="nav-brand">
  <span class="nav-logo">ONPE</span>
  <span class="nav-sub" id="process-name">Elecciones Generales 2026</span>
</a>
<nav class="nav-links">
  <a href="/" data-page="top3">Top 3</a>
  <a href="/proyecciones.html" data-page="proyecciones">Proyecciones</a>
  <a href="/candidatos.html" data-page="candidatos">Candidatos</a>
  <a href="/resumen.html" data-page="resumen">Resumen</a>
  <div class="nav-update">
    <span class="nav-pulse"></span>
    <span id="update-time">...</span>
  </div>
</nav>
`;

function injectHeader() {
  const h = document.getElementById('app-header');
  if (!h) return;
  h.innerHTML = HEADER_HTML;
  const page = document.documentElement.dataset.page;
  if (page) {
    const active = h.querySelector(`[data-page="${page}"]`);
    if (active) active.classList.add('active');
  }
}

document.addEventListener('DOMContentLoaded', injectHeader);
if (document.readyState !== 'loading') injectHeader();
