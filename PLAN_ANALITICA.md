# Plan de analítica energética — frontendEMS (+ ApiEMS)

Alcance aprobado: **Fase 0 completa, Fase 1 completa, Fase 2 (2.3, 2.4),
Fase 3 (3.1, 3.2, 3.3, 3.4)**. Fuera de alcance: 2.1 (penalización reactiva),
**2.2 (normalización por clima — descartado 2026-08-17: pedía lat/lon en cada
sede y una llamada saliente a una API externa desde ApiEMS, que hoy solo habla
con InfluxDB y el CRM)**, 2.5 (simulador), 2.6 (metas), 3.5 (CO₂), Fase 4
completa (hardware nuevo).

Estado al 2026-08-17: Fase 0 y Fase 1 entregadas; de la Fase 2, 2.3 y 2.4
entregadas. Queda la Fase 3.

Fecha de análisis: 2026-08-17. Ramas `main` de ApiEMS, frontendEMS, CRMBackend,
CRMweb, energyML.

---

## 0. Restricción de producto que atraviesa todo: sitios con y sin generación

El sitio de referencia tiene fotovoltaica inyectando y **no admite medición
descentralizada**, por eso se mide en la frontera y solo se ve el balance neto.
Pero **la mayoría de los sitios que se instalarán son de consumo puro, sin
generación**, y habrá clientes con generación. La analítica tiene que funcionar
bien en los dos casos, sin ramas improvisadas y sin mostrar widgets vacíos.

### 0.A Definición de modo

| Modo | Cómo se comporta el dato | Consecuencia analítica |
|---|---|---|
| `consumo` (sin generación) | `TotW` prácticamente siempre > 0; `TotWh_export` no avanza | Toda la potencia observada es consumo real de la instalación. Los indicadores de carga son válidos las 24 h. La analítica es más limpia y más potente |
| `generacion` (con fotovoltaica) | `TotW` cambia de signo; `TotWh_export` avanza | Solo se observa el **neto** en frontera. En horas de sol el consumo real queda oculto tras la generación. Varios indicadores solo son válidos en ventana sin sol |

### 0.B Cómo se determina el modo

1. **Fuente de verdad: CRMBackend.** Campos nuevos en `Site`
   (`CRMBackend/app/models/site.py`):
   - `tiene_generacion: bool | None` — **nullable, default `NULL` = "detectar
     automáticamente"**. No `False`: una migración que ponga `False` a todo
     apagaría de golpe la exportación y el balance neto en el sitio que hoy sí
     tiene solar. `NULL` deja que decida la detección, y el campo solo se usa
     para forzar el modo cuando alguien lo setea a propósito.
   - `capacidad_kwp: Numeric | None` (opcional, informativo; habilita Fase 4 el día que se mida el inversor)
   Se expone en el documento de flota que ApiEMS ya consume
   (`ApiEMS/app/services/crm/fleet.py`) y se edita desde CRMweb.
2. **Respaldo automático** cuando el campo es `NULL`: `modo = generacion` si
   `TotWh_export` acumuló > 1 kWh en los últimos 30 días. Se calcula una vez al
   día y se cachea (mismo patrón que las bandas de `anomaly.py`). Con esta regla,
   el sitio actual resuelve `generacion` sin que nadie configure nada, y sigue
   viéndose exactamente igual que hoy.
3. El modo viaja en las respuestas de analítica (`site_mode: "consumo" |
   "generacion"`) para que el frontend no tenga que adivinarlo ni pedirlo aparte.

### 0.C Qué cambia por modo (resumen; el detalle va en cada ítem)

| Ítem | Modo `consumo` | Modo `generacion` |
|---|---|---|
| 1.1 Heatmap | Métricas `import` y `cost`. Sin selector de exportación | Se agregan `export` y `net` |
| 1.2 Proyección de factura | Solo importación | Se proyecta también exportación y se aplican los dos tramos |
| 1.3 Carga fantasma | Ventana **24 h completa** (p5 del día entero es válido) | Ventana **nocturna 00:00–05:00 obligatoria** |
| 1.4 Curva de duración | Sobre toda la serie | Solo sobre muestras de importación (`TotW > 0`), etiquetado explícito |
| 2.3 Arquetipos | Vector de energía importada por hora | Igual vector (importada por hora), **no** potencia neta |
| 2.4 Anomalías | Bandas p10/p90 sobre todas las horas | Se mantiene la regla de "exportar nunca alerta" que ya existe |
| 3.2 Benchmark | Grupo de comparación solo con sitios `consumo` | Grupo solo con sitios `generacion` |
| 3.3 NILM-lite | **Válido 24 h** — es donde mejor funciona | Solo horas sin sol |

### 0.D Escalar sin romper lo que hoy funciona

El sistema en producción funciona bien y el sitio actual no puede degradarse ni
un widget. Reglas de ejecución, no recomendaciones:

1. **Todo es aditivo.** Los endpoints nuevos son rutas nuevas. Los que ya existen
   solo **agregan** campos (`site_mode`); no se renombra ni se quita ninguno, así
   que un frontend viejo contra un backend nuevo sigue funcionando.
2. **El modo `generacion` es el comportamiento actual, textual.** Todo lo que hoy
   se ve (exportación, balance neto, saldo a favor, tarjeta de eficiencia, los
   dos tramos del excedente, la regla de "exportar nunca alerta") queda igual. El
   modo `consumo` es una **rama nueva** para sitios nuevos, no una reescritura de
   la existente.
3. **Sin migración obligatoria.** Con `tiene_generacion = NULL` y la detección
   automática, desplegar el CRM nuevo no requiere tocar el sitio actual. Si el
   documento de flota todavía no trae el campo, ApiEMS asume `generacion` (el
   comportamiento de hoy) y no falla.
4. **Un solo cambio visible y a propósito: la demanda máxima subirá** cuando se
   aplique 0.1, porque hoy está subestimada. Se comunica al cliente en vez de
   dejar que lo note solo; el resto de las cifras no se mueve.
5. **Sin regresiones de rendimiento.** Cada endpoint nuevo entra con su TTL de
   caché desde el primer día (24 h para lo diario, 30 s para lo interactivo) y no
   se agrega ninguna consulta nueva al arranque del Dashboard, que ya está
   afinado en cascada (`Dashboard.tsx:16-21`). Los widgets nuevos se cargan
   después del resumen, nunca compitiendo con él.
6. **Cada fase es reversible por capa.** Backend primero (aditivo, sin
   consumidores), frontend después; revertir el frontend deja el backend
   inofensivo. Mismo criterio de despliegue que ya usa
   `PLAN_REFACTORIZACION.md`.
7. **Escalar en número de sitios:** ningún cálculo nuevo recorre la flota entera
   por petición. Lo pesado (arquetipos, bandas, benchmark) se recalcula por sitio
   una vez al día y se sirve cacheado; el benchmark se agrega en CRMBackend, no
   pidiéndole N series a InfluxDB en el momento.

**Regla de oro:** ningún indicador se calcula sobre potencia neta cuando existe
una versión equivalente basada en **energía importada por hora**
(`difference(TotWh_import)`), que es siempre ≥ 0 y tiene el mismo significado en
los dos modos. Esto es lo que permite que un solo cálculo sirva para toda la
flota.

---

## 1. Qué mide realmente el sistema (límites duros)

| Hecho | Dónde se ve |
|---|---|
| Un solo medidor **bidireccional en frontera**. Sin medidor en el inversor: no se mide generación ni consumo bruto en sitios con solar | `app/schemas/analytics.py:1-8`, `energyML/README.md` |
| Contadores acumulativos monótonos (`TotWh_import`, `TotWh_export`, `Q1Eq..Q4Eq`): solo `difference()` / `last()`, jamás `mean()` | `app/models/variables.py:45-96` |
| Instantáneas: `TotW`, `W_phsA/B/C`, `TotVAr`, `TotVA`, `TotPF`, `Hz`, `PhV_phsA/B/C`, `A_phsA/B/C` | `app/models/variables.py:25-44` |
| Datos crudos a **1 Hz** en InfluxDB | `app/api/v1/analytics.py:147-165`, `frontendEMS/src/pages/Reactiva.tsx:71-77` |
| Tarifa: **CU mensual plano** + excedente en dos tramos, sin cargo fijo, sin franjas | `app/schemas/tariff.py`, `CRMBackend/app/models/tariff.py` |
| Tarifa **global de plataforma**, no por cliente | `CRMBackend/app/models/tariff.py:32` |
| `Site` guarda dirección y ciudad, **no coordenadas** | `CRMBackend/app/models/site.py:34-38` |
| Forecast horario ya entrenado (RandomForest, `lag_24h` con importancia 0.72), **sin exponer** | `energyML/README.md` |

---

## 2. Inventario actual de frontendEMS

| Página | Widgets | Matemática |
|---|---|---|
| Dashboard | Hero de flujo en vivo, 6 KPIs (kWh hoy/mes, COP neto), gráfica en vivo, estado de equipos, alarmas, comparación 7 y 30 días | Sumas de contadores, costo 2 tramos, delta % |
| Histórico | Serie de una variable, min/máx/prom/último, CSV | Reducciones sobre buckets ya agregados |
| Consumo/Exportación | Barras import vs export por día/semana/mes/año, barras de costo | Contadores + tarifa |
| Analítica | Totales, demanda máx / factor de carga / carga base, costo, perfil horario, perfil semanal, resumen + eficiencia + PDF | Media/máx/mín, cuantil, avg/peak, delta % |
| Reactiva | 4 cuadrantes kvarh, tendencia, CSV crudo, PDF | Sumas y balance |
| Reportes | Tabs de periodo, totales, balance neto, costo, barras, KPIs, CSV | Igual |

Gráficos existentes: área, barras comparadas, perfil horario, línea en vivo.
**Faltan:** heatmap, curva de duración, histograma, boxplot, dispersión con
regresión, Sankey, banda de predicción, sparklines.

**Matemática ausente:** proyección, intervalos de confianza, normalización
climática, regresión, CUSUM/EWMA, clustering, concentración de carga, cobertura
del dato, comparación contra pares.

---

## Fase 0 — Corregir lo que hoy engaña (aprobada completa)

| # | Tarea | Archivos |
|---|---|---|
| 0.1 | **Demanda máxima real.** Hoy sale de buckets promediados con `mean()` (~86 min en un rango de 30 días): un pico de 3 min desaparece. Consultar la serie con `Aggregation.MAX` para el pico, separada de la de `mean` que se usa para el promedio | `ApiEMS/app/services/analytics/common.py:67-85`, `app/services/kpis/summary.py:34-39`, `app/services/reports/builder.py` |
| 0.2 | **Min/máx del Histórico** pedidos con `aggregation=max`/`min`, no calculados sobre buckets promediados | `frontendEMS/src/pages/History.tsx:121-129` |
| 0.3 | **Etiquetas "(prom.)"** que muestran el acumulado del día/semana/mes en curso: o el backend devuelve el promedio real por día del rango, o la etiqueta dice "hoy / esta semana / este mes" | `AnalyticsSummary.tsx:13-20`, `ApiEMS/app/services/kpis/summary.py:76-92` |
| 0.4 | **Comparación de periodos con día parcial**: alinear ambos rangos a límites de día locales o normalizar a kWh/día | `PeriodComparisonCard.tsx:23-30` |
| 0.5 | **Tooltip** aclarando que factor de carga y carga base se calculan solo sobre importación (en modo `generacion`; en modo `consumo` la aclaración sobra y no se muestra) | `MetricsGrid.tsx` |
| 0.6 | **Campos de modo en CRM** (`tiene_generacion`, `capacidad_kwp`) + detección automática de respaldo + propagación a ApiEMS. Prerequisito de casi toda la Fase 1 | `CRMBackend/app/models/site.py`, `schemas/site.py`, migración Alembic, `CRMweb`, `ApiEMS/app/services/crm/fleet.py` |

**Criterio de aceptación 0.1:** con una serie sintética que tiene un pico de 1 s
de 10 kW dentro de una hora a 500 W, `/reports/daily` devuelve
`max_demand.peak_power_w ≈ 10000`, no ≈ 520.

**Criterio de aceptación 0.6:** un sitio sin exportación en 30 días resuelve
`site_mode = "consumo"` sin configuración manual; setear `tiene_generacion=true`
en el CRM lo fuerza a `generacion` aunque no haya exportado todavía.

---

## Fase 1 — Base que toda plataforma de energía tiene (aprobada completa)

### 1.1 Heatmap calendario (hora × día)

- **Cliente ve:** cuadrícula de 24 filas × N días, color = kWh importados; vista
  alterna en COP. Salta a la vista "los martes a las 7 p.m. siempre gasto".
- **Matemática:** `E(d,h) = difference(TotWh_import)` en buckets de 1 h,
  reordenado a matriz por (fecha local, hora local). Escala de color por
  **cuantiles**, no lineal, para que un outlier no aplane el resto.
- **Por modo:** `consumo` expone `import` y `cost`. `generacion` agrega `export`
  y `net` (esta última con escala divergente centrada en 0).
- **Backend:** `GET /analytics/heatmap?from&to&metric=import|export|net|cost&bucket=1h`
  → `{ site_mode, days, hours, values[][], unit }`. Reusa `cached_energy_series`
  con `every=1h`, agrupa en Polars como `_daily_profile_df` pero sin colapsar días.
- **Frontend:** `charts/CalendarHeatmap.tsx` en SVG (Recharts no trae heatmap).

### 1.2 Proyección de factura del mes

- **Cliente ve:** "Vas en 142 kWh · $118.400. Proyección a fin de mes: ~$248.000
  (rango $221.000 – $276.000)."
- **Matemática:**
  - `kWh_mtd` = importado del mes a la fecha.
  - Media diaria ponderada por tipo de día: EWMA (α ≈ 0.3) de los kWh/día de los
    últimos 28 días, separando laboral / sábado / domingo-festivo.
  - `kWh_proy = kWh_mtd + Σ_{días restantes} media_tipo(d)`.
  - Banda: percentiles p10/p90 de la distribución de kWh/día por tipo de día,
    propagados sobre los días restantes.
  - Costo: la misma `compute_cost_from_points`, respetando los dos tramos por mes
    calendario.
- **Por modo:** `consumo` proyecta solo importación (tramo único, más preciso).
  `generacion` proyecta además la exportación con el mismo método y aplica el
  reparto tramo 1 / tramo 2.
- **Backend:** `GET /forecast/bill?month=YYYY-MM&device_id=` →
  `{ site_mode, kwh_mtd, kwh_projected, kwh_p10, kwh_p90, cost_projected_cop, cost_p10, cost_p90, days_elapsed, days_total, method }`.
- **Honestidad:** con menos de 14 días de historial devuelve
  `method: "insufficient_history"` y la UI no proyecta.
- **Frontend:** tarjeta destacada en Dashboard con barra de progreso y banda de
  incertidumbre.

### 1.3 Carga fantasma ("siempre encendido") en COP

- **Cliente ve:** "Tu instalación consume 180 W constantes = 130 kWh/mes ≈
  $108.000/mes, el 31% de tu factura."
- **Matemática:** percentil 5 de `TotW` por día + mediana móvil de 7 días para
  ver si sube. Costo = `P_base(W) × 24 h × días × CU / 1000`.
- **Por modo:** `consumo` usa el **día completo** (el p5 diario es la carga base
  real). `generacion` usa **ventana nocturna local 00:00–05:00 obligatoria**: de
  día el neto está contaminado por la generación y el p5 sería negativo o
  absurdo.
- **Backend:** `GET /analytics/baseload-trend?from&to&percentile=0.05` (la
  ventana la decide el backend según `site_mode`, no el cliente).
- **Diferencia con hoy:** `base_load` actual es un número puntual del rango, sin
  tendencia ni traducción a dinero.

### 1.4 Curva de duración de carga

- **Cliente ve:** "El 5% del tiempo consumes por encima de 4,2 kW, y ese 5%
  explica el 22% de tu energía."
- **Matemática:** potencia ordenada de mayor a menor; x = % del tiempo acumulado,
  y = W. Anotar p1/p5/p50/p95 y el % de energía acumulado en el primer 5% del
  tiempo (índice de concentración).
- **Por modo:** `consumo` sobre toda la serie. `generacion` solo sobre muestras
  con `TotW > 0`, con la etiqueta "curva de importación desde la red".
- **Backend:** `GET /analytics/load-duration?from&to&points=200` (devuelve 200
  percentiles, no la serie entera).

### 1.5 Cobertura y calidad del dato

- **Cliente ve:** cintillo "Datos completos al 97% en este rango"; cuando falta,
  franjas grises sobre las gráficas y totales marcados como parciales.
- **Matemática:** `cobertura(bucket) = muestras_recibidas / muestras_esperadas`,
  con esperadas = duración del bucket / periodo de publicación del gateway.
- **Backend:** `GET /analytics/coverage?from&to&bucket=1h` (usa `count()` en
  Flux, barato).
- **Por qué primero:** es prerequisito de confianza de todo lo demás; sin esto,
  un gateway caído 10 horas se lee como "consumo bajo". Igual en ambos modos.

### 1.6 Sparklines en las tarjetas KPI

Miniserie de 14 días en cada `KpiCard`, desde `/history/downsample` que ya está
cacheado. Bajo costo, alto efecto: ningún número queda solo.

---

## Fase 2 — Aprobados 2.3 y 2.4 (2.2 descartado)

### 2.2 Normalización por clima (días-grado) — DESCARTADO

Se sale del alcance por sus dependencias, no por su valor: exige coordenadas
por sede (otra migración en CRMBackend, geocodificando la ciudad) y una llamada
saliente desde ApiEMS a una API de clima — hoy el servicio solo habla con
InfluxDB y con el CRM, y abrir esa puerta trae caché, fallos de red y una
dependencia externa en el camino de una pantalla.

Se deja documentado el diseño por si vuelve a la mesa:

- **Cliente ve:** "Consumiste 8% más que el año pasado, pero hizo 3 °C más de
  calor: a clima igual, bajaste 4%."
- **Matemática:** temperatura horaria de Open-Meteo (gratuita, sin llave) para
  las coordenadas del sitio. `CDD(d) = max(0, T_media(d) − T_base)`,
  `HDD(d) = max(0, T_base − T_media(d))`. Regresión por sitio
  `kWh_día = a + b·CDD + c·HDD`; se reportan `a` (consumo no climático), `b`
  (sensibilidad al calor en kWh/°C-día) y `R²`. Comparación normalizada =
  `kWh_real − b·(CDD_periodo − CDD_referencia)`.
- **Por modo — importante:** en modo `generacion` la regresión se corre sobre
  **energía importada**, no sobre neto, y aun así queda confundida: los días
  calurosos suelen ser soleados, así que más calor produce a la vez más consumo
  de refrigeración y más generación, y el coeficiente `b` puede salir bajo o
  incluso negativo. Regla: si `R² < 0.3` o `b < 0`, la API devuelve
  `confidence: "low"` y el frontend muestra la comparación sin normalizar,
  explicando por qué. En modo `consumo` la regresión es directa y fiable.
- **Dato que falta:** coordenadas del sitio. Basta geocodificar la ciudad una vez
  y guardar lat/lon como campos nuevos en `Site` (van junto con 0.6).
- **Backend:** `GET /analytics/weather-normalized?from&to&base_temp=18`.
- **Frontend:** `charts/ScatterWithFit.tsx` (kWh/día vs temperatura con recta) +
  tarjeta de comparación año a año normalizada.

### 2.3 Arquetipos de día (clustering)

- **Cliente ve:** "Tienes 3 tipos de día: laboral (18 kWh), fin de semana
  (11 kWh) y día atípico (34 kWh, 6 veces en 90 días)", con la curva media de
  cada uno y un calendario coloreado por arquetipo.
- **Matemática:** vector de 24 dimensiones por día = **fracción de la energía
  importada diaria en cada hora** (normaliza magnitud, agrupa por forma). K-means
  con k ∈ [2,5], k elegido por silhouette. Etiquetado automático según la
  composición de días de semana de cada clúster.
- **Por modo:** el vector se construye con `difference(TotWh_import)` por hora en
  ambos modos — siempre ≥ 0, así que el mismo cálculo sirve para toda la flota.
  Usar potencia neta rompería la normalización en sitios con generación (valores
  negativos, fracciones sin sentido). En modo `generacion` el arquetipo describe
  la **forma de la importación**, que es lo que se paga.
- **Backend:** `GET /analytics/day-archetypes?days=90`, cacheado 24 h (mismo
  patrón que `anomaly.py`).
- **Mínimo de datos:** 30 días; por debajo devuelve `insufficient_history`.

### 2.4 Historial de anomalías con narrativa

- **Hoy:** el detector existe (`app/services/alerts/detector.py`) pero el
  frontend solo tiene un panel de alarmas vivas — no hay memoria de lo ocurrido.
- **Qué agregar:** `GET /alerts/history?from&to` + línea de tiempo de insights:
  "martes 12: 34 kWh, 62% por encima de lo típico para un martes"; "desde el 3 de
  agosto tu carga base subió de 120 W a 190 W".
- **Matemática adicional:** CUSUM o EWMA sobre kWh/día para detectar **cambios
  sostenidos de nivel** (una nevera degradándose, un termo mal configurado), que
  las bandas p10/p90 puntuales no ven. Se reporta la fecha estimada de cambio y
  la magnitud del escalón.
- **Por modo:** en `generacion` se mantiene la regla ya existente de que exportar
  nunca genera alerta, y la señal de "se esperaba exportar y está importando"
  (`detector.py:54-65`) solo aplica en ese modo. En `consumo` esa rama se apaga:
  no tiene sentido y generaría ruido.
- **Persistencia:** hoy las alertas viven en memoria (`services/alerts/state.py`).
  Para tener historial hay que persistirlas — decisión abierta: tabla en
  CRMBackend, o un `measurement` propio en InfluxDB. Recomendado InfluxDB: son
  eventos con marca de tiempo, ya está desplegado, y no obliga a migración en el
  CRM.

---

## Fase 3 — Aprobados 3.1, 3.2, 3.3, 3.4

### 3.1 Forecast servido (energyML → ApiEMS → frontend)

- El modelo existe y ya vence al baseline naive en validación
  (`energyML/README.md`). Falta empaquetarlo tras
  `GET /forecast/power?horizon_h=48`: carga del `.joblib`, features de calendario
  y lags leídos de InfluxDB, y **banda de predicción** construida con los
  cuantiles del error de validación **por hora del día** (no un intervalo
  teórico).
- **Por modo:** el modelo actual predice `TotW` neto, que en sitios con
  generación mezcla consumo y solar. Para servir a toda la flota se entrena por
  modo: en `consumo`, sobre energía importada por hora (target más limpio, mejor
  MAE esperado); en `generacion`, sobre el neto como hoy. El endpoint indica qué
  variante respondió (`target: "import_kwh" | "net_w"`).
- **Regla de honestidad:** si en la última semana el MAE del modelo no le gana al
  baseline "mismo valor hace 24 h", la API devuelve el baseline y lo declara en
  `method`.
- **Frontend:** `charts/ForecastBandChart.tsx` — la gráfica en vivo continúa
  hacia adelante en línea punteada con banda sombreada.

### 3.2 Benchmark de flota

- Percentil del sitio contra sitios comparables, calculado en CRMBackend, que es
  quien conoce la flota.
- **Agrupación obligatoria por modo:** un sitio con solar tiene importación neta
  estructuralmente menor; compararlo contra sitios de consumo puro sería un
  número sin sentido. Grupo = (mismo `site_mode`, misma ciudad, mismo rango de
  consumo).
- **Privacidad:** mínimo 5 sitios por grupo, solo agregados, nunca datos
  identificables de otro cliente.
- **Cliente ve:** "Consumes 22% menos que sitios similares" — el insight con más
  engagement documentado del sector.

### 3.3 Detección de eventos a 1 Hz (NILM-lite)

- **Matemática:** escalones `|ΔP| > 200 W` sostenidos ≥ 20 s sobre la serie de
  1 Hz; emparejar encendido/apagado por magnitud similar; agrupar por
  (ΔP, duración) con DBSCAN.
- **Por modo — aquí está la ganancia:** en modo `consumo` funciona **las 24 h**,
  porque la única fuente de variación es la carga; es el escenario para el que
  esta técnica fue diseñada y donde da resultados presentables. En modo
  `generacion` solo es fiable de noche o en días muy estables, porque el medidor
  ve el neto y una nube produce un escalón idéntico al de un electrodoméstico.
  Dado que la mayoría de la flota será de consumo puro, este ítem sube de valor
  respecto a la evaluación inicial.
- **Cómo se presenta:** nunca como "identificamos tus electrodomésticos", sino
  "carga grande detectada: ~2.100 W, 45 min, entre 19:00 y 22:00, 5 veces esta
  semana".
- **Dónde:** investigación primero en energyML (con datos reales de un sitio de
  consumo puro), y solo después endpoint en ApiEMS.

### 3.4 Sankey del periodo + informe mensual PDF

- **Sankey:** en modo `consumo` es un flujo simple red → instalación desglosado
  por arquetipo/franja, útil pero modesto. En modo `generacion`: red → casa,
  solar → casa (**estimado**, marcado como tal), solar → red. Las ramas solares
  son estimaciones mientras no se mida el inversor y la UI debe decirlo, igual
  que hoy se marca `stale_months` en la tarifa.
- **Informe mensual PDF:** factura estimada, comparación con el mes anterior y
  con el mismo mes del año pasado, heatmap, top 5 días, carga fantasma,
  anomalías. La infraestructura de PDF programático ya existe
  (`src/utils/analyticsSummaryPdf.ts`); falta el contenido. Dos plantillas, una
  por modo.

---

## 3. Endpoints nuevos en ApiEMS (alcance aprobado)

```
GET /analytics/heatmap?from&to&metric=import|export|net|cost&bucket=1h
GET /analytics/load-duration?from&to&points=200
GET /analytics/baseload-trend?from&to&percentile=0.05
GET /analytics/coverage?from&to&bucket=1h
GET /analytics/weather-normalized?from&to&base_temp=18
GET /analytics/day-archetypes?days=90
GET /analytics/benchmark
GET /alerts/history?from&to
GET /forecast/bill?month=YYYY-MM
GET /forecast/power?horizon_h=48
```

Todos siguen el patrón existente: `ApiResponse[T]`, `ScopedInfluxRepository`,
`CurrentFleet`, cálculo Polars fuera del event loop con `asyncio.to_thread`,
caché con TTL acorde al costo (24 h para lo que se recalcula por día, 30 s para
lo interactivo) — como en `app/services/influx/cache.py` y
`app/services/analytics/anomaly.py`. **Todos devuelven `site_mode`.**

## 4. Componentes nuevos en frontendEMS

```
components/charts/CalendarHeatmap.tsx       (SVG propio)
components/charts/LoadDurationChart.tsx     (Recharts, línea)
components/charts/ScatterWithFit.tsx        (Recharts Scatter + recta)
components/charts/ForecastBandChart.tsx     (banda + línea punteada)
components/charts/SankeyPeriodo.tsx         (Recharts Sankey)
components/dashboard/BillProjectionCard.tsx
components/dashboard/PhantomLoadCard.tsx
components/dashboard/DataCoverageBadge.tsx
components/dashboard/InsightsTimeline.tsx
components/analytics/DayArchetypes.tsx
```

Recharts 3.9 cubre todo salvo el heatmap, que se hace con SVG a mano —
consistente con `HourlyProfileChart`.

**Regla de UI por modo:** un hook `useSiteMode()` decide qué se renderiza. En
modo `consumo` **no se muestran** widgets de exportación, saldo a favor, tarjeta
de eficiencia solar ni métrica de balance neto: desaparecen, no se muestran en
cero. En modo `generacion` se mantiene todo lo actual.

---

## 5. Reglas de honestidad estadística

1. **Nunca proyectar sin historial suficiente.** < 14 días ⇒ sin proyección de
   factura; < 20 muestras por bucket ⇒ sin banda (la regla ya existe en
   `anomaly.py:35-36`; se mantiene en todo lo nuevo).
2. **Marcar siempre lo estimado.** El sistema no mide generación: cualquier cifra
   solar es estimación y debe decirlo, igual que hoy se marca `stale_months`.
3. **Los datos faltantes no son consumo cero.** La cobertura (1.5) es
   prerequisito de las comparaciones año a año y del benchmark.
4. **Comparar solo lo comparable:** el benchmark nunca mezcla sitios de modos
   distintos.
5. **Privacidad:** solo agregados, mínimo 5 sitios por grupo.
6. **Modelos que no ganan, no se muestran:** el forecast cae al baseline y lo
   declara.

---

## 6. Orden de ejecución

| Bloque | Contenido | Por qué ahí |
|---|---|---|
| 1 | 0.6 (modo de sitio) + resto de Fase 0 | El modo condiciona el diseño de casi todos los endpoints; hacerlo después obligaría a reescribirlos. Las correcciones evitan construir sobre números malos |
| 2 | 1.5 cobertura → 1.1 heatmap | Cobertura es la base de confianza; el heatmap es el mayor impacto visual por el menor costo |
| 3 | 1.3 carga fantasma → 1.2 proyección de factura | Los dos insights que se traducen directo a dinero, y funcionan en los dos modos |
| 4 | 1.4 curva de duración + 1.6 sparklines | Cierran la página de Analítica |
| 5 | 2.4 historial de anomalías | Requiere decidir persistencia; es lo que hace que el cliente vuelva |
| 6 | 2.3 arquetipos | Cómputo puro, sin dependencias externas |
| 8 | 3.1 forecast servido | El modelo existe; hay que entrenar la variante de importación para sitios de consumo |
| 9 | 3.2 benchmark → 3.4 Sankey + informe mensual | Diferenciales de producto, se apoyan en todo lo anterior |
| 10 | 3.3 NILM-lite | Investigación en energyML primero, con datos de un sitio de consumo puro |

**Nota de portafolio:** el sitio de referencia (con solar, medición en frontera)
es el caso **difícil**; la mayoría de la flota será el caso **fácil**. Diseñar
para los dos desde 0.6 significa que cada sitio de consumo puro que se instale
después entra sin trabajo adicional, y que las técnicas más ambiciosas (3.1, 3.3)
den mejores resultados justamente en la mayoría de la flota.
