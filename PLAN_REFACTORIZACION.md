# Plan de Refactorización — ApiEMS + frontendEMS

> Objetivo: **reducir complejidad, no añadir features.** Eliminar duplicación de API y de componentes frontend, consolidar en un único flujo de datos, y dejar la superficie mínima mantenible para el sistema de monitoreo energético (medidores IoT).
> Fuente del plan: análisis arquitectónico sobre código real (rutas `archivo:línea`).

---

## Principios rectores

1. **Una sola fuente de verdad por métrica** → los cálculos de negocio viven SOLO en el backend; el frontend solo formatea y grafica.
2. **Un solo endpoint por necesidad** → `/reports/{type}` y `/dashboard/summary` como consolidadores; eliminar todos los deprecated.
3. **Lógica de periodos en un solo helper** → `resolve_period()` compartido, nunca más copias inline.
4. **Componentes reutilizables** → `Metric`/`StatCard`, `TabPills`, helpers (`mergeSeries`, `monthLabel`, `downloadCsv`).
5. **Caché donde los datos no cambian** → agregados de meses cerrados / downsampling de storage.
6. Cada fase termina **verde en tests** antes de pasar a la siguiente.

**Regla de oro**: si dos funcionalidades hacen lo mismo → quedarse con la MÁS SIMPLE y eliminar la otra.

---

## Convenciones de test (mantener el estilo existente de cada repo)

### ApiEMS (pytest) — `python -m pytest`

- Config ya activa: `testpaths=["tests"]`, `-q --strict-markers`, `asyncio_mode=auto`, **`filterwarnings=["error"]`** → un warning rompe el suite. Nunca silenciar con `pytest.warns` salvo excepción documentada.
- Convención de nombres: `test_<modulo>_api.py` = endpoints vía `TestClient` (envelope `{ok,data,error}`, códigos 200/404/422, exacto payload) · `test_<modulo>_service.py` = unidades sin HTTP.
- Dobles: `tests/fakes.py` (`FakeInfluxRepository`, `FakeInfluxService`) + fixtures de `tests/conftest.py` (autouse `_clear_ttl_caches`, `fleet`, `TEST_DEVICE_ID/TEST_CLIENT_ID/TEST_TOKEN`). **Nunca** tocar Influx/MQTT reales en unit.
- **Aislamiento multi-tenant obligatorio** (patrón `test_cache_isolation.py`): dos clientes distintos nunca comparten caché ni datos.
- `clear_all_caches()` por test (autouse) — los caches `@cached` son globales al módulo.

### frontendEMS (rstest) — `npm test` (con `npm run lint` + `npm run typecheck`)

- Archivos en `tests/<nombre>.test.tsx` / `.test.ts`, `@rstest/core` (`describe/test/expect`) + `@testing-library/react` (`render/screen/waitFor/cleanup`), `happy-dom`, setup `tests/rstest.setup.ts`.
- `describe` narra el **comportamiento** en español (ej. `'una sola petición'`, `'sin la suscripción del socket'`, `'el aviso de tarifa vieja'`).
- **Asserts de red estrictos**: contar llamadas exactas al `apiClient` (mismo patrón que `costoDelPeriodo.test.tsx:71` describe `'una sola petición'`). Toda página nueva/refactorizada exige su test de recuento de fetch.
- Pure functions → `.test.ts` (ej. `unidades.test.ts`, `salud.test.ts`).
- Estados obligatorios por componente: carga (skeleton), error, vacío y dato. Un render sin estos tres casos no se acepta.
- **Regla de oro**: la suite debe quedar tan estricta como está hoy (sin `filter`/`skip` nuevos para esquivar).

---

## Estrategia de despliegue seguro en producción (+ rollback)

> Contexto: ambos proyectos están **en producción**. El único riesgo real no es perder datos (el esquema de Influx no cambia, salvo la fase de downsampling), sino **quitarle datos al frontend en producción** porque se borraron endpoints antes de migrarlo. Por eso toda la reforma se divide en dos tracks.

### 1. Dos tracks por fase

- **Track ADITIVO (no rompe nada, se puede desplegar en cualquier momento)**: añadir `/dashboard/summary`, el servicio `consolidate()`, `resolve_period()`, caché de meses cerrados. Los endpoints viejos **siguen existiendo con el mismo contrato** pero reimplementados como wrappers de `consolidate()` → misma salida, menos código, y doble verificación en staging.
- **Track DESTRUCTIVO (rompe contrato, se despliega SOLO después de que el consumidor migró)**: borrar los 21 endpoints legacy + `/dashboard/cards`, borrar clientes API muertos y componentes copiados del frontend.

### 2. Orden de despliegue por pareja backend + frontend

1. **V1 — Backend aditivo**: `consolidate()` + `/dashboard/summary` + `resolve_period()` (F2, F3.1-3.2), y los endpoints legacy pasan a ser wrappers. Deploy backend. **El frontend en producción no nota nada.**
2. **V2 — Frontend migrado**: consumo de `/reports/*`, `/dashboard/summary`, componentes base (F4, F5). Deploy coordinado con V1 ya arriba. Un tag **anterior** del frontend sigue funcionando contra el backend V1 (compatibilidad).
3. **V3 — Backend destructivo** (tras ≥1 semana de observación, ver §5): quitar legacy (F1). Si falla, se revierte SOLO V3 (`git revert`) y todo vuelve a V2 funcionando, sin tocar Influx.

> Nunca desplegar F1 (borrar endpoints) sin que F4-F5 ya estén en producción.

### 3. Reversibilidad por capa

- **Código**: cada fase es un tag `release/f<N>` + PR independiente → rollback = `git revert <sha>` **de esa fase**, no de todo el bundle.
- **API**: mantener los 21 endpoints legacy como wrappers durante toda la ventana (con toggle `LEGACY_ENDPOINTS` en env, default `true` hasta V3). Así un frontend viejo puede volver sin migrar nada.
- **Datos / Influx**: la refactorización no toca el esquema de Influx salvo la Fase 3.3 (downsampling). En esa fase: **backup Influx previo**, flag `DOWNSAMPLING_ENABLED=false` primero, retención de crudo 48 h antes de borrar y **borrado diferido** (nada de drop inmediato).
- **Aplicación**: imágenes Docker versionadas por sha; `docker-compose.yml` fija versiones; **rolling restart** con healthcheck (`/api/v1/health`) antes de cortar el tráfico.

### 4. Runbook de rollback (qué hacer si algo falla en producción)

| Síntoma                                          | Fase culpable                                  | Acción de rollback                                                               |
| ------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Dashboard en blanco / 404 en datos               | V3 (legacy apagado) antes que frontend migrado | poner `LEGACY_ENDPOINTS=true` o `git revert` de V3                               |
| Frontend nuevo roto (blank/error)                | V2                                             | revert a tag **anterior** del frontend (compatible con backend V1)               |
| `/reports` o `/dashboard/summary` lento/timout   | F3.3 (downsampling)                            | `DOWNSAMPLING_ENABLED=false` o revert F3.3 — degrada rendimiento, datos intactos |
| Fuga de datos entre empresas (caché)             | F3.2                                           | `clear_all_caches()` + revert F3.2                                               |
| Valores de energía/costo cambian respecto a ayer | F2 (consolidate)                               | revert F2; verificar golden live (§5) de nuevo                                   |
| Error rate > umbral en `/reports` o `/health`    | cualquiera                                     | revert la fase que acabó de entrar; monitorear 2 h                               |

### 5. Verificación antes de cada corte (gate de promoción a producción)

- [ ] **Staging idéntico a prod**: restore de un backup Influx reciente + mismas variables de entorno (tarifas CRM reales).
- [ ] **Golden live**: sobre los mismos datos de staging, comparar `consolidate()`/ `/reports` NUEVO vs endpoint legacy VIEJO — respuesta byte a byte (o por campos para fechas con hora actual).
- [ ] **Smoke E2E**: login CRM → dashboard en vivo → reporte PDF/Excel → historial crudo (río el flujo del frontend migrado contra staging).
- [ ] **CI verde con los tests estrictos de la fase**, sin `--ignore` ni `filter` (ver Convenciones de test).
- [ ] **Monitor de prod tras deploy**: vigilar 4xx/5xx de `/reports`, `/dashboard*`, `/history*`, latencia y health 2 h. Si el error rate sube → tabla §4.

### 6. Gating por fase

Cada fase solo avanza si: CI verde → staging + golden live verde → ventana de observación de prod ≥1 semana con alertas activas. Las fases aditivas (V1, V2) no requieren ventana antes de la siguiente; V3 (destructivo) sí.

---

## Fase 0 — Baseline y verificación

**Contexto**: confirmar que el sistema funciona antes de tocar nada (red de seguridad).

- [ ] Backend: `cd ApiEMS && python -m pytest` — todo verde.
- [ ] Backend: `ruff check app tests` — sin errores.
- [ ] Frontend: `cd frontendEMS && npm run lint && npm run typecheck && npm test`.
- [ ] Registro del inventario de pruebas: `python -m pytest --collect-only -q | tail` y `npm test 2>&1 | tail` — anotar N de tests por repo (la meta es que estos N **bajen solo** si se borraron tests de endpoints muertos, jamas por recortar cobertura).
- [ ] Commit de referencia / tag `baseline` en ambos repos.

**Criterio de salida**: suites verdes documentadas (si hay tests rojos, arreglarlos ANTES de refactorizar).

---

## Fase 1 — Backend: eliminar API redundante

Todo endpoint marcado `deprecated=True` en el código ya está cubierto por `/reports/{daily,weekly,monthly,yearly,custom}`. Borrarlos.

### 1.1 Eliminar routers deprecated

| Eliminar                                                                  | Archivo                                                             | Cubierto por                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| `/consumption/{day,week,month,year}`                                      | `app/api/v1/consumption.py` + `app/api/v1/energy_router_factory.py` | serie de `/reports/*` (`app/services/reports/`) |
| `/export/{day,week,month,year}`                                           | `app/api/v1/export.py` (misma factory)                              | serie de `/reports/*`                           |
| `/kpis`                                                                   | `app/api/v1/kpis.py` + `app/services/kpis/`                         | bloque KPIs de `/reports/*`                     |
| `/analytics` (raíz)                                                       | `app/api/v1/analytics.py` (endpoint `analytics_overview`)           | `/reports/{type}`                               |
| `/analytics/max-demand`, `/analytics/load-factor`, `/analytics/base-load` | `app/api/v1/analytics.py`                                           | bloque analytics de `/reports/*`                |
| `/costs/{day,week,month,year}`                                            | `app/api/v1/costs.py` (4 presets)                                   | costos de `/reports/*` y `/costs/range`         |
| `/dashboard/cards`                                                        | `app/api/v1/dashboard.py:117-158`                                   | `/dashboard` (mismo `_build_dashboard`)         |

**Detalles**:

- Desregistrar del router en `app/api/v1/router.py:19-31`.
- Borrar tests de esos endpoints (`test_kpis_api.py`, `test_history_api.py` solo si apuntan a rutas muertas, revisar test_costs), NO borrar tests de `reports`/`costs/range`.
- Mantener vivos: `history`, `history/downsample`, `history/range`, `reports/*`, `costs/range`, `analytics/{daily-profile,monthly-profile,compare,summary}`, `dashboard`, `dashboard/status`, `alerts`, `devices`, `variables`, `realtime/*`, `health`, WS `/ws`.

**Criterio de salida**: `pytest` verde + `curl` a un endpoint borrado → 404. `len(router.routes)` baja ~40 → ~22.

### Tests de la fase (F1)

- [ ] **Nuevo `tests/test_router_surface.py`** (regresión estricta): snapshot de `[route.path for route in app.routes]` == lista mínima (~22 rutas). Probar con `client.get(app.url_path_for(...))` que **ninguna** de las 21 rutas borradas sigue existiendo → 404/405.
- [ ] **Test de 404 para cada endpoint eliminado** (parametrizado sobre la lista borrada): `assert client.get(route).status_code == 404` con el envelope de error (`fichas: `app/schemas`/`exceptions.py`).
- [ ] **Mover cobertura antes de borrar**: los casos valiosos de `test_kpis_api.py`, `test_energy_api.py` (consumption/export) y presets de `test_costs_api.py` pasan a sus equivalentes de reports (`test_reports_api.py`) y `test_costs_api.py` (solo `/costs/range`), **sin perder asserts de valores**, solo cambiando la ruta de destino.
- [ ] `test_router_surface` + suite completa: `python -m pytest` — verde con `filterwarnings=error`.
- [ ] Mantener verdes `test_reports_api.py`, `test_costs_api.py`, `test_dashboard_api` (sin `/cards`), `test_history_api.py`, `test_analytics_services.py`.

---

## Fase 2 — Backend: reconstruir lógica de periodos y consolidación

### 2.1 Helper único `resolve_period()`

- Crear en `app/services/periods.py` (o ampliar `app/utils/period.py`):
  `resolve_period(period: day|week|month|year|custom, from, to, timezone) -> PeriodBounds(start, stop, interval, resolution)`.
- Reemplazar las 5 copias: `_resolve_range` + los bloques inline de `analytics/monthly-profile` (analytics.py:142-146) y `analytics/summary` (:244-248), `kpis.py:47-51`, `_fixed_bounds` (`app/services/reports/builder.py:32-41`), `_bounds` (`app/services/energy/summary.py:54-59`), y el day/month hardcodeado en `dashboard.py:58-59`.
- **Unificar "año"**: elegir UNA implementación (la de `reports/yearly`, ventana diaria) y eliminar los 12 `spread()` por mes de `app/services/energy/summary.py:62-88`. Verificar en tests que el total de energía anual no cambia (diferencia tolerada ≤0.1%).

### 2.2 Un único servicio `ReportBuilder.consolidate(bounds)`

- Consolidar `app/services/reports/builder.py` para que **una sola pasada** sobre las series cacheadas produzca: energía+series, KPIs, max_demand, load_factor, base_load, costos.
- Eliminar lectura duplicada de la misma `cached_instant_series(TotW)` que hoy hacen `compute_kpis` + `max_demand` + `load_factor` + `base_load` (builder:80-85). Dejar un **único** `PolarsFrame` compartido en memoria dentro del request.
- Migrar `/analytics/summary` y `/costs/range` a consumir `consolidate()` para los campos que ya exponen (evitar divergencias de cálculo entre endpoints).

### 2.3 Corregir bug de KPIs con rango

- `app/services/kpis/summary.py:68-85`: hoy recalcula boundaries de "hoy/esta semana/este mes" contra `now` ignorando el rango pedido. Hacerlo calcular cuantías SIEMPRE dentro del rango resolvido por `resolve_period()`.

**Criterio de salida**: `/reports/daily` devuelve idéntico JSON payload (campos y valores) antes/después de la refactorización (snapshot de golden file). `pytest` verde.

### Tests de la fase (F2)

- [ ] **Unit `resolve_period` — ampliar `tests/test_period.py`** (parametrizado): para cada periodo (`day/week/month/year/custom`) y bordes (medianoche local, lunes ISO, cambio DST, año bisiesto, `from>to` → 422, sin `from/to` → default) assert: `start < stop`, bordes alineados a timezone (nunca a UTC crudo), e `interval/resolution` esperados (día=`1h`, semana/mes=`1d`, año=`1d`, custom=`auto_interval`).
- [ ] **Regresión "año"**: en `tests/test_reports_api.py` sembrar `FakeInfluxRepository` (conftest) con ~40 días de lecturas de `TotWh_import`/`TotWh_export` y assert `total_kwh` de `/reports/yearly` == suma de los 12 `spread()` por mes (tolerancia ≤0.1%) — codificar el valor exacto como constante con comentario del origen.
- [ ] **Golden file `/reports/*`**: fixture que `json.dumps` el payload de `/reports/{daily,monthly,custom}` a `tests/golden/reports_{period}.json` (generado en F0). En la fase assert **igualdad byte a byte** tras el refactor. Regenerar SOLO al cambiar el contrato intencionalmente, documentando en el PR.
- [ ] **Spy de consultas Influx** (gol de 2.2): envolver `FakeInfluxRepository.instant_series` con contador y assert que `/reports/daily` la llama **exactamente 1 vez** por familia de métricas (no 3 como `compute_kpis`+`max_demand`+`load_factor` hoy).
- [ ] **Fix KPIs-rango**: en `tests/test_kpis_service.py` añadir caso con rango pasado (`from/to` 30 días atrás) y assert que `consumption_daily/weekly/monthly` se calculan **dentro del rango pedido**, no contra `now` (hoy → falla el test rojo de baseline, se arregla en esta fase).
- [ ] Suite completa verde: `python -m pytest`, `ruff check app tests`.

---

## Fase 3 — Backend: rendimiento

### 3.1 Endpoint consolidado `/dashboard/summary`

- Nuevo GET `app/api/v1/dashboard.py::dashboard_summary`:
  - Devuelve en **una llamada**: snapshots en vivo (RAM), energía de hoy y del mes (`cached_energy_total`), costos del día/mes, KPIs rápidos, conectividad.
  - Internamente reutiliza `consolidate()` y el estado de `RealtimeState` — **sin consultas nuevas a Influx** (solo reutiliza cacheadas).
- El frontend migrará a este endpoint en la Fase 5 (aquí solo exponerlo).

### 3.2 Caché de agregados cerrados

- Añadir caché de largo plazo (persistente, e.g. `TTLCache` con TTL grande o storage de bajo costo) para agregados de **meses calendario ya finalizados** (inmutables). Clave: `(tenant, device_id, month)`.
- Reutilizar la infra existente `app/core/cache.py` y el `cache_identity` de tenant (`app/repositories/scoped.py:43-57`).

### 3.3 Downsampling en storage (según PLAN_RENDIMIENTO / DOWNSAMPLING)

- Fase 2: preferir `device_id = '...'` (indexado) sobre `device_id =~ /.../` en queries Flux de rangos largos (ver `PLAN_RENDIMIENTO.md`).
- Fase 3: crear bucket horario `telemetry_server_hourly`, umbral 48 h, retención, tarea Flux versionada en `infra/downsampling.flux` (no a mano en la UI de Influx). Ver `DOWNSAMPLING.md`.
- Medir con `INFLUX_TIMEOUT_MS` y `/analytics/compare` el caso de 14.6M puntos.

**Criterio de salida**: request de mes completo < 1s con caché caliente; /analytics/compare sin timeout.

### Tests de la fase (F3)

- [ ] **Nuevo `tests/test_dashboard_summary_api.py`**: contra el fake de conftest, assert que `/dashboard/summary` devuelve el payload completo (snapshots RAM + energía día/mes + costos + KPIs + conectividad) y que **los valores coinciden** con `/dashboard` + `/costs/range` + kpis del mismo período (consistencia entre endpoints).
- [ ] **Aislamiento multi-tenant de `/dashboard/summary`** (patrón `test_cache_isolation.py`): dos clientes distintos → respuestas y caché totalmente separadas; el fixture `_clear_ttl_caches` mantiene el orden.
- [ ] **Caché de meses cerrados**: test que un 2º request del mismo mes (ya finalizado) **no** toca `FakeInfluxRepository.energy_series` (contador de llamadas == 0 en el 2º) y devuelve el mismo valor, incluso si se muta la lectura del fake entre llamadas (inmutabilidad del dato cacheado). Clave include tenant+device_id+mes.
- [ ] **Downsampling (F2 índices)**: capturar la query Flux construida por `InfluxRepository` en `FakeInfluxRepository` y assert que usa `device_id = '...'` (igualdad indexada) y no `contains` para rangos > umbral. Si el entorno no tiene Influx, quedar documentado como test de contratación (marcado `@pytest.mark.integration`).
- [ ] Suite completa verde + `ruff`.

---

## Fase 4 — Frontend: limpieza

### 4.1 Borrar clientes API muertos (nunca llamados)

Eliminar de `src/api/` (verificado con grep en el análisis): `getDashboard`, `getDashboardCards`, `getHistoryRange`, `getMaxDemand`, `getLoadFactor`, `getBaseLoad`, `getKpis`, `getConsumption`, `getExport`, `getRealtimeLatest`.

- Borrar también los tipos solo usados por ellas en `src/api/types.ts` (verificar imports con `tsc --noEmit`).
- **No borrar** `getCostsRange`, `getReport`, `getCustomReport`, `getAnalyticsSummary/profiles/compare`, `getHistory`, `getHistoryDownsample`, `getAlerts`, `listVariables`, `listDevices`, `getDashboardStatus`, clientes CRM.
  - **F5.3** dejó huérfanos y se borraron: `getRealtimeDevice` (el hero ya no consulta `/realtime/device`, usa `seedWatts` de `/dashboard/summary`) y `getAnalyticsOverview` (Analytics usa `getCustomReport`). También el tipo `AnalyticsOverview` y `DeviceSnapshot`.

### 4.2 Unificar convención de periodos

- Un **único enum** `Period = 'day'|'week'|'month'|'year'|'custom'` en `src/domain/periods.ts`.
- Eliminar el mapeo manual `PERIOD_TO_REPORT_TYPE` (`ConsumptionExport.tsx:26-31`) y la divergencia `Day` vs `daily`; el cliente de API traduce el enum a las rutas `/reports/{daily|weekly|monthly|yearly|custom}` y `/costs/range`, en un solo lugar (`src/api/reports.ts` + `src/api/costs.ts`).
- `src/domain/periods.ts` exporta también presets de `DateRangePicker`.

### Tests de la fase (F4)

- [ ] **Nuevo `tests/apiSurface.test.ts`** (guard de código muerto): listar todos los exports de `src/api/` y assert que cada función es **importada** por algún módulo de `src/` (excepto las 10 borradas). Si alguien reintroduce un cliente sin usarlo → falla.
- [ ] **Nuevo `tests/periods.test.ts`** (unit, style `unidades.test.ts`): enum `Period` exhaustive → para cada valor assert que `toReportPath(p)` produce `/reports/{daily|weekly|monthly|yearly|custom}` exacto y que `getCostsRange` no depende de mapping manual. Assert que `PERIOD_TO_REPORT_TYPE` **ya no existe** (grep en test o import que falle).
- [ ] **Typecheck estricto**: `npm run typecheck` sin errores tras borrar tipos huérfanos; confirmar con `npx tsc --noEmit --noUnusedLocals`.
- [ ] Suite existente verde: `npm test` (especialmente `variables.test.tsx`, `costoDelPeriodo.test.tsx`, `energyFlowHero.test.tsx` sin tocar).

---

## Fase 5 — Frontend: reconstruir componentes y migrar páginas

### 5.1 Componentes base reutilizables

Crear en `src/components/ui/`:

1. **`StatCard`** (o `MetricCard`) — label + valor + icono + skeleton + tooltip. Única fuente del patrón "Card+valor".
2. **`TabPills`** — el patrón `motion.span layoutId="...tab-pill"` hoy copiado en 3 archivos.
3. **`OnlineDot`** — dot pulsante hoy copiado en 4 archivos.
4. Helpers en `src/utils/`: **`mergeSeries`** (de Reports/ConsumptionExport), **`monthLabel`** (x4 sitios), **`downloadCsv`** (2 impls), **`NOT_APPLICABLE`** y labels compartidos.

### 5.2 Eliminar copias directas

| Duplicado hoy                                                                                     | Acción                                              |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `mergeSeries` en `Reports.tsx:38-64` ≈ `ConsumptionExport.tsx:40-64`                              | usar `utils/mergeSeries`                            |
| Grid demanda/factor/carga-base `Analytics.tsx:133-175` ≈ `Reports.tsx:347-391`                    | `MetricsGrid` sobre `StatCard`                      |
| Cards Importado/Exportado/Balance en `CostoDelPeriodo`, `ConsumptionExport`, `Reports`            | dejar solo `CostBreakdownSummary` (reutilizable x3) |
| `ORDEN_FASE` + agrupación por magnitud (`VariablesContext:42-51` ≈ `useVariablesDelMedidor:6-15`) | exportar de un solo módulo                          |
| efecto "cerrar al hacer click fuera" (x3: SelectorDeMedidor, AlertsBell, NoticeBell)              | hook `useClickOutside`                              |

### 5.3 Migrar páginas al flujo consolidado

- **Dashboard**: pasar de 7 fetch + WS a **1 HTTP + WS** (`getDashboardSummary`); `CostoDelPeriodo` (modo controlado con `costo`) y el hero (`seedWatts`) usan el payload consolidado. **Decisión 2026-08-10**: `ConnectivityStatus` sale del tablero (la conexión se ve en el punto del hero, estado del socket); `PeriodComparisonCard` (7/30 días) se mantiene pidiendo `/analytics/compare` — comparación es caso de uso distinto. Total de red real: 1×summary + 2×compare (+ devices/variables del contexto).
- **Analytics page**: sustituir `getAnalyticsOverview` (deprecated, subset de reports) por `getCustomReport`; perfiles (`daily-profile`,`monthly-profile`) y `compare` se mantienen.
- **ConsumptionExport y Reports**: ambas ya usan `/reports/{type}`; compartir el componente de tarjetas ($5.2) y el `MetricsGrid`.

### Tests de la fase (F5)

- [x] **Componentes UI base** (`tests/statCard.test.tsx`, `tabPills.test.tsx`, `onlineDot.test.tsx`, `clickOutside.test.ts`): render + **los 3 estados** (carga/skeleton, error, dato) + a11y (`role`, label via `screen.getByRole`). TabPills: verificar `layoutId` único por instancia y teclado (flechas/Enter).
- [x] **Unit helpers** (`tests/mergeSeries.test.ts`, `monthLabel.test.ts`, `downloadCsv.test.ts`): `mergeSeries` con huecos/overlap/orden desordenado; `monthLabel` con UTC vs Bogotá; `downloadCsv` con `URL.createObjectURL` mockeado + assert de contenido y filename del Blob.
- [x] **Unicidad de helper**: `tests/helpersUnicos.test.ts` falla si cualquiera de los archivos antiguos vuelve a definir su propia `monthLabel`/`mergeSeries`/`NOT_APPLICABLE`/`ORDEN_FASE`/efecto click-fuera/`layoutId`/onda pulsante (grep sobre el fuente).
- [x] **Dashboard migrado — recuento de red** (`tests/dashboard.test.tsx`): mockear `apiClient` con contador de llamadas; render Dashboard; `waitFor` carga → assert **exactamente 5 llamadas** (`/devices`, `/variables`, 1× `/dashboard/summary`, 2× `/analytics/compare`) y **cero** a `/costs`, `/analytics` (a secas), `/realtime/device`, `/dashboard/status`, `/kpis`, `/consumption`, `/export` (todo consolidado). Además asserts de skeleton inicial y estado de error. `tests/energyFlowHero.test.tsx` reescrito para el modo `seedWatts` (el hero ya no hace fetch).
- [x] **Analytics migrada** (`tests/analytics.test.tsx`): assert que usa `/reports/custom` (no `/analytics`), contador por sección (summary, custom, daily-profile, monthly-profile, costs/range = 1 c/u) y que `compare` solo dispara +1 con los 2 costos al clickear "Comparar".
- [x] **Reports/ConsumptionExport**: ambas importan el MISMO `CostBreakdownSummary` (`components/dashboard/`); `MetricsGrid` sale de `components/ui/` en Reports y Analytics — guard por import path en `tests/helpersUnicos.test.ts`.
- [x] Suite completa: `npm test` (149 verde) + `npm run typecheck` + `npx tsc --noEmit --noUnusedLocals` verdes; `npm run lint` solo falla en el error preexistente `RealtimeContext.tsx:97` (set-state-in-effect, anotado como no de esta refactorización). Barrido de endpoints muertos: 0 referencias a API (el único match es la ruta SPA `/consumption-export`).

---

## Fase 6 — Validación final y contrato

- [ ] Backend: `pytest` + `ruff` verdes; snapshots/golden de `/reports/daily`, `/dashboard/summary`, `/history/downsample` regenerados y commiteados la primera vez.
- [ ] Frontend: `npm run lint`, `npm run typecheck`, `npm test` verdes.
- [ ] Barrido de endpoints usados: `rg "/(consumption|export|kpis|analytics/max-demand|analytics/load-factor|analytics/base-load|dashboard/cards)" src/` → 0 resultados.
- [ ] Barrido de funciones API muertas: 0 referencias fuera de su definición.
- [ ] **Gates de regresión automática** (no negociable):
  - ApiEMS: `python -m pytest` corre entero con `filterwarnings=error` y **sin** `skip`/`xfail` nuevos para esquivar (los ya existentes, solo si documentados).
  - frontendEMS: `npm test` sin filtros; suite cuenta el mismo N de tests estrictos por página migrada (los `describe` de recuento de peticiones SIEMPRE presentes en páginas que hacen fetch).
  - _Meta de inversión_: todo PR de esta refactorización debe traer +1 test estricto de regresión por cada funcionalidad tocada, aun si el test del/endpoint muerto se eliminó.
- [ ] Prueba manual E2E: flujo login (CRM) → dashboard en vivo → reporte PDF/Excel → historial crudo.
- [ ] Actualizar `README.md` de ambos con el nuevo mapa de API.

---

## Resumen de impacto

| Dimensión                                      | Antes                      | Después                                                                                                                                                     |
| ---------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoints GET ApiEMS                           | ~40                        | ~22 (con `/dashboard/summary`)                                                                                                                              |
| Endpoints deprecated en producción             | 21                         | 0                                                                                                                                                           |
| Funciones cliente frontend sin uso             | 10                         | 0                                                                                                                                                           |
| Copias de lógica de periodos (backend)         | 5+                         | 1 (`resolve_period`)                                                                                                                                        |
| Implementaciones de "año"                      | 2                          | 1                                                                                                                                                           |
| Componentes copiados (frontend)                | 8+                         | 0 (sustituidos por ui base)                                                                                                                                 |
| Llamadas del Dashboard                         | 7 + WS                     | 2 (summary + WS)                                                                                                                                            |
| Recálculo de la misma serie Influx por request | hasta 4x                   | 1x                                                                                                                                                          |
| Tests estrictos por fase (regresión)           | ningún guard de superficie | `test_router_surface` (F1), golden + spy de consultas (F2), isolation y meses-cerrados (F3), `apiSurface` + `periods` (F4), recuento de red por página (F5) |

## Orden de commits sugerido (organizado por tracks de producción)

**Track ADITIVO — V1 (backend, no rompe nada, tag `release/v1`)**

1. `baseline` (Fase 0) → tag `release/baseline`
2. ApiEMS: `refactor(services): unify period resolution (resolve_period)` (F2.1)
3. ApiEMS: `refactor(services): ReportBuilder.consolidate() single-pass` (F2.2) — endpoints legacy pasan a wrappers
4. ApiEMS: `fix(kpis): respect requested range bounds` (F2.3)
5. ApiEMS: `feat(api): consolidated /dashboard/summary` + caché de meses cerrados (F3.1-3.2)
   → **deploy V1** en producción (sin cambio visible); tag `release/v1`

**Track ADITIVO — V2 (frontend, compat con backend V1, tag `release/v2`)** 6. frontendEMS: `chore(api): remove dead api clients, unify Period` (F4) — compatible: `/reports` y `/costs/range` ya existen 7. frontendEMS: `refactor(ui): shared StatCard/TabPills/OnlineDot + helpers` (F5.1-5.2) 8. frontendEMS: `refactor(pages): migrate to /dashboard/summary and custom report` (F5.3)
→ **deploy V2** coordidado; ventana de observación ≥1 semana; tag `release/v2`

**Track DESTRUCTIVO — V3 (tras ventana de observación, tag `release/v3`)** 9. ApiEMS: `refactor(api): remove deprecated endpoints + /dashboard/cards` (F1) — `LEGACY_ENDPOINTS=false` 10. Validación final (Fase 6); actualizar READMEs con el mapa de API nuevo

> Si cualquier deploy rompe producción: `git revert` **de esa tag** (regla de oro: revert atómico por fase, no del bundle — ver Estrategia de despliegue seguro, §4).
> Los pasos de rendimiento (F3.3 downsampling) se desacoplan en PR propio y por separado, siempre con `DOWNSAMPLING_ENABLED=false` por defecto.
