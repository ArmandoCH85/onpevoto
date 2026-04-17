# ONPE Top 3 — Zona de Voltereta + Desglose Geográfico

**Fecha:** 2026-04-17

## Objetivo

Agregar dos secciones a la página Top 3 (index.html) que transforman el dashboard de "mostrar números" a "analizar la elección":

1. **Zona de Voltereta** — alerta cuando los votos pendientes pueden cambiar el resultado
2. **Desglose Geográfico** — dónde gana cada candidato + selector drill-down por departamento

---

## 1. Zona de Voltereta

### Cálculo

```
actasPendientes = totalActas - contabilizadas
promedioVotosPorActa = totalVotosEmitidos / contabilizadas
votosPendientesEstimados = actasPendientes × promedioVotosPorActa
```

### Reglas de estado

| Condición | Estado | Color |
|---|---|---|
| votosPendientes > diff 1ro-2do | LA CARRERA PUEDE DAR VUELTA | Rojo pulsante |
| votosPendientes > diff 2do-3ero | 2do lugar en riesgo | Amarillo |
| votosPendientes < diff 1ro-2do Y < diff 2do-3ero | Ventaja asegurada | Verde |

### UI

Banner entre mini-stats y los cards Top 3:

- Texto principal: estado + cifra ("Faltan ~12,400 votos | Diferencia 1ro-2do: 5,875")
- Barra de progreso: "73.2% contabilizado"
- Iconografía: ⚠ para riesgo, ✅ para asegurado
- Estilo: card con borde grueso y fondo tintado según estado

### Datos

Ya disponibles en `/api/totales` — no requiere cambios en scraper.

---

## 2. Desglose Geográfico

### Nuevos endpoints a scrapear

```
GET /ubigeos/departamentos?idAmbitoGeografico=1   → 26 departamentos del Perú
GET /ubigeos/departamentos?idAmbitoGeografico=2   → continentes del extranjero
GET /eleccion-presidencial/participantes-ubicacion-geografica-nombre
    ?tipoFiltro=ubigeo_nivel_01&idAmbitoGeografico=1&ubigeoNivel1={CODE}&idEleccion=10
    → Top 3 por departamento
```

### Almacenamiento

Agregar a `data.json`:
- `departamentos`: array de `{ idUbigeo, nombre }` (del endpoint de ubigeos)
- `departamentosResultados`: object keyed by ubigeo code, cada uno con participantes array

### Scraper — flujo nuevo

1. Scrape existente (9 endpoints)
2. Scrape `/ubigeos/departamentos?idAmbitoGeografico=1` → lista de deptos
3. Loop: por cada departamento, scrape participantes con filtro `ubigeo_nivel_01`
4. Guardar en data.json bajo `departamentos` y `departamentosResultados`

**Impacto:** ~35 API calls totales (9 + 26 deptos). Tiempo estimado: ~30s por scrape. Aceptable para refresh cada 5 min.

### UI — Sección A: "Dónde gana cada candidato"

Tabla debajo de los cards Top 3:

| Departamento | 1er lugar | 2do lugar | 3er lugar | Diff 1-2 |
|---|---|---|---|---|
| LIMA | Keiko 22.1% | JxP 15.3% | RP 12.0% | 5,400 |
| AREQUIPA | ... | ... | ... | ... |

- Filas con diff < 10k: borde rojo
- Filas con diff < 100k: borde amarillo
- Nombre del 1er lugar en negrita con color del candidato
- Mini foto del 1er lugar

### UI — Sección B: Selector drill-down

Dropdown/select de departamento arriba de la tabla geo. Al seleccionar:
- Las cards Top 3 se actualizan con datos de ese departamento
- Las mini-stats se actualizan con totales de ese departamento
- Botón "Ver Nacional" para volver

### Server — nuevos endpoints

```
GET /api/departamentos          → lista de departamentos
GET /api/departamentos/:ubigeo  → resultados de un departamento específico
```

### Frontend — cambios en app.js

- Agregar funciones: `getDepartamentos()`, `getDepartamentoResultados(ubigeo)`
- Agregar render: `renderVoltereta()`, `renderGeoSection()`, `renderGeoTable()`
- Modificar `renderAll()` para incluir nuevas secciones
- Modificar scope tabs o agregar selector de departamento

---

## Orden de implementación

1. Zona de Voltereta (no requiere scraper nuevo)
2. Scraper: agregar departamentos + resultados por depto
3. Server: exponer nuevos endpoints
4. Frontend: tabla geo + selector drill-down
