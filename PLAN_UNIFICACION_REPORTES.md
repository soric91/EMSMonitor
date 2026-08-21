# Plan — Unificar "Consumo / Exportación" con "Reportes" y darle profundidad al reporte

## 1. Qué hay hoy

### `/consumption-export` — `src/pages/ConsumptionExport.tsx`

| Bloque | Fuente |
| --- | --- |
| TabPills día/semana/mes/año | `FixedPeriod` |
| Tarjetas Importado / Exportado / Balance neto | `getReport(period)` |
| `CostBreakdownSummary` | `report.costs` |
| Barras Importación vs. exportación | `mergeSeries(...)` |
| **Barras Costo por periodo (COP)** | `report.costs.series` |

### `/reports` — `src/pages/Reports.tsx`

| Bloque | Fuente |
| --- | --- |
| TabPills día/semana/mes/año/**personalizado** | `Period` |
| **`DateRangePicker` + Generar** | `getCustomReport(from,to)` |
| **`MonthlyReportButton`** (PDF del mes) | 8 endpoints |
| Franja periodo / generado | `report.period_start/end` |
| Tarjetas Importado / Exportado / Balance neto | `getReport(period)` |
| `CostBreakdownSummary` | `report.costs` |
| Barras Importación vs. exportación + **Exportar CSV** | `mergeSeries(...)` |
| **KPIs** (potencia, voltaje, corriente, factor de potencia) | `report.kpis` |
| **`MetricsGrid`** (max demand, load factor, base load) | `report.max_demand/load_factor/base_load` |

### Diagnóstico

Las dos páginas llaman al **mismo endpoint** (`getReport`), con el **mismo
tipo** (`ReportData`) y pintan **cuatro bloques idénticos**. `Reports` es
superconjunto de `ConsumptionExport` salvo **una** cosa: la gráfica de **costo
por periodo (COP)**, que hoy solo existe en `ConsumptionExport`.

Diferencias reales a preservar al fusionar:

1. `ConsumptionExport` tolera `report === null` en el balance neto (`—`);
   `Reports` asume no-nulo. Se conserva la versión tolerante.
2. `ConsumptionExport` etiqueta los buckets según el periodo
   (`HH:mm` / `EEE` / `d MMM` / `MMM`); `Reports` usa siempre `d MMM HH:mm`,
   que en el tab Anual es ilegible. **Se conserva `BUCKET_FORMAT`** y se usa
   también para el CSV.
3. `ConsumptionExport` oculta la gráfica de costos cuando `costs.series` está
   vacía. Se conserva.

**Conclusión: fusionar sí, y no se pierde ninguna funcionalidad — se ganan
tres (formato de bucket por periodo, tolerancia a nulos, gráfica de costos
dentro de Reportes).**

### Nombre de la página resultante

Se queda en la ruta `/reports` con la etiqueta **"Reportes"** en el sidebar,
y `/consumption-export` pasa a redirigir a `/reports`:

- la ruta ya es la del endpoint (`/reports/*`) y la del PDF;
- "Consumo / Exportación" describía la gráfica, no la página: la página ahora
  también trae costos, KPIs, demanda y el informe en PDF;
- el redirect evita romper enlaces guardados o pestañas abiertas.

---

## 2. Qué le falta al reporte (lo "muy básico")

Hoy un reporte **Mensual** —o uno Personalizado de tres meses— dibuja lo mismo
que uno **Diario**: tres totales y una barra por bucket. Nada responde las preguntas que se le hacen a un mes:

- ¿cómo se movió el consumo **semana a semana**?
- ¿**qué día** consumí más y cuánto?
- ¿a **qué hora** se concentra el pico?
- ¿qué semana fue la peor y cuánto peor?

Todo eso ya es calculable con datos que el backend entrega:

| Pregunta | Fuente | Cómo |
| --- | --- | --- |
| Consumo por semana | `report.consumption_series` / `export_series` (buckets diarios en el mes) | Agrupar por semana ISO en `America/Bogota` |
| Día de mayor consumo | idem | `max` por bucket diario |
| Hora pico del rango / de cada semana | `getHeatmap({from,to,metric:'import'})` → `values[díaIndex][hora]` | `max` sobre la matriz, y `max` por franja semanal |
| Perfil horario medio | `getDailyProfile({from,to})` → `HourProfilePoint[]` | Ya existe `HourlyProfileChart` |
| Reparto hora × día | `getHeatmap` | Ya existe `HeatmapCard` |

### Regla de costos (no negociable)

Los costos **no se agregan en el cliente**: el crédito de exportación se
reparte en tramo 1 / tramo 2 contra lo importado **del mes**, así que sumar
buckets no es lineal. El desglose semanal de la Fase 5 es **solo energía
(kWh)**. Ver Fase 0 para la única condición bajo la cual se habilitaría un
costo por semana.

---

## 3. Fases

### Fase 0 — Verificaciones previas (sin código de producción)

1. Confirmar contra el backend si `Σ costs.series[].net_cost_cop` es igual a
   `costs.net_cost_cop` del periodo. Si **no** lo es (lo esperable por el
   umbral de tramos), el costo por semana queda descartado y se documenta en
   el propio módulo de dominio.
2. Confirmar que `/analytics/heatmap` acepta el rango de un reporte de periodo
   fijo (`report.period_start` / `period_end`) y no solo rangos personalizados.
3. Confirmar que `/analytics/daily-profile` responde para rangos de un mes.
4. Medir `/reports/custom` con el rango más largo que se piense ofrecer (un
   año) y ver si el backend responde completo, tarda o trunca la serie. De ahí
   sale si hace falta un tope de rango en el picker y con qué aviso.

**Test Fase 0** — `tests/costosNoSeSuman.test.ts`

- Con la fixture de `CostBreakdown`, aserta la invariante que se haya
  confirmado (igualdad o desigualdad), de modo que si el backend cambia el
  contrato, el test lo dice antes que un cliente.

---

### Fase 1 — Extraer lo duplicado (sin cambio visible) ✅ HECHA

Nuevos componentes, ambos alimentados por `ReportData`:

- `src/components/dashboard/EnergyBalanceCards.tsx`
  Las tres tarjetas Importado / Exportado / Balance neto.
  Props: `{ consumptionKwh: number; exportKwh: number; netKwh: number | null }`.
  Se queda con la variante tolerante a `null` de `ConsumptionExport`.
- `src/components/charts/PeriodCostChart.tsx`
  Las barras Costo por periodo (COP) a partir de `CostPoint[]`.
  Props: `{ series: CostPoint[]; labelOf: (time: string) => string }`.
  No renderiza nada si `series.length === 0`.
- `src/domain/periods.ts`: mover ahí `BUCKET_FORMAT` (hoy copiado en
  `ConsumptionExport`) pero **como función, no como tabla por periodo**:

  ```ts
  /**
   * Cómo se etiqueta un bucket. Va por la DURACIÓN del reporte, no por su
   * nombre: un "Personalizado" de seis meses y uno de dos horas son el mismo
   * `report_type` y necesitan etiquetas opuestas. Con la tabla por periodo,
   * todo custom salía como `d MMM HH:mm` — ilegible en medio año.
   */
  export function formatoDeBucket(inicio: string, fin: string): string;
  //  < 48 h  -> 'HH:mm'
  //  < 10 d  -> 'EEE d'
  //  < 90 d  -> 'd MMM'
  //  resto   -> 'MMM yyyy'
  ```

  Los periodos fijos caen solos en el formato que ya tenían
  (día→`HH:mm`, semana→`EEE d`, mes→`d MMM`, año→`MMM yyyy`).

Ambas páginas pasan a usarlos. Sin cambios de comportamiento.

**Tests Fase 1**

- `tests/tarjetasDeBalance.test.tsx`
  - importado y exportado salen formateados en kWh;
  - neto positivo dice "Importador neto" y usa ámbar;
  - neto negativo dice "Exportador neto" y usa esmeralda;
  - `net === null` pinta `—` y no afirma ninguna de las dos cosas.
- `tests/graficaDeCostos.test.tsx`
  - con serie vacía no se monta nada;
  - con serie, hay una barra de costo importado y otra de crédito exportado;
  - las etiquetas del eje usan el formato del periodo (Anual → `MMM`).
- `tests/periods.test.ts` (ampliar)
  - `formatoDeBucket` devuelve el formato que hoy tiene cada periodo fijo
    (no hay regresión visual en día/semana/mes/año);
  - un custom de 3 horas etiqueta en `HH:mm` y uno de 8 meses en `MMM yyyy`;
  - los cortes se prueban en su frontera exacta (48 h, 10 d, 90 d).

---

### Fase 2 — Fusionar las dos páginas ✅ HECHA

1. `Reports.tsx` absorbe `PeriodCostChart` y `formatoDeBucket`
   (las etiquetas de `mergeSeries`, de las dos gráficas y del CSV salen todas
   de la misma función, calculada sobre `report.period_start/period_end`).
2. Borrar `src/pages/ConsumptionExport.tsx`.
3. `src/App.tsx`: `<Route path="/consumption-export" element={<Navigate to="/reports" replace />} />`
   dentro de `AppLayout`.
4. `src/components/layout/Sidebar.tsx`: quitar la entrada
   "Consumo / Exportación"; queda "Reportes".
5. Actualizar los comentarios que nombran la página muerta:
   `src/utils/mergeSeries.ts`, `src/components/ui/TabPills.tsx`,
   `src/components/ui/StatCard.tsx`.
6. Actualizar `tests/helpersUnicos.test.ts` y `tests/periods.test.ts`, que
   listan `pages/ConsumptionExport.tsx` por ruta.
7. README: la tabla de Pantallas.

**Tests Fase 2**

- `tests/unificacionReportes.test.tsx`
  - `/consumption-export` redirige a `/reports`;
  - el sidebar ya no ofrece "Consumo / Exportación";
  - en `/reports` con un reporte cargado están, a la vez, la gráfica de
    energía **y** la de costos (lo que antes obligaba a visitar dos páginas);
  - el tab Anual etiqueta los buckets como meses, no como `d MMM HH:mm`;
  - el CSV exportado usa la misma etiqueta que la gráfica.
- `tests/helpersUnicos.test.ts` (ajustar): ninguna ruta del proyecto vuelve a
  referirse a `ConsumptionExport`.

**Corte de control:** al terminar la Fase 2 el proyecto queda entregable —
una sola página, cero funcionalidad perdida. Las fases siguientes agregan.

---

### Fase 3 — El reporte por fecha, de primera clase ✅ HECHA

El modo Personalizado **ya existe** (`getCustomReport(from, to)` + `DateRangePicker`),
pero hoy es un tab más y arrastra siete fallas. Esta fase lo vuelve la forma
principal de pedir un reporte; los periodos fijos quedan como atajos a rangos.

| # | Falla de hoy | Arreglo |
| --- | --- | --- |
| 1 | El `MonthlyReportButton` **siempre** genera el mes calendario en curso, ignorando el rango elegido. Si el usuario mira julio, el PDF sale de agosto. | El botón recibe `{ desde, hasta, etiqueta }` del reporte en pantalla y titula el informe con ese rango. Deja de llamar a `mesActual()` salvo cuando no hay reporte. |
| 2 | Las etiquetas de bucket son `d MMM HH:mm` fijas: un rango de seis meses es ilegible. | Resuelto en Fase 1 con `formatoDeBucket`. |
| 3 | El CSV se llama `reporte_custom.csv` para **todos** los rangos: se pisan al bajar varios. | `reporte_2026-07-01_2026-07-31.csv`, con las fechas del rango en hora Bogotá. |
| 4 | Sin validación: `from > to`, rango de duración cero o rango futuro llegan al backend. | `validarRango(fromIso, toIso)` en `src/domain/periods.ts`, con el botón Generar deshabilitado y el motivo escrito debajo. |
| 5 | Los presets son solo 24 h / 7 d / 30 d — nadie pide un reporte "de las últimas 720 horas", pide **julio**. | `RANGE_PRESETS` gana rangos de calendario: *Este mes*, *Mes pasado*, *Este año*, cortados a medianoche Bogotá con `startOfLocalDay`. |
| 6 | Cambiar de tab hace `setReport(null)` y el rango no vive en la URL: no se puede recargar ni compartir un reporte por fecha. | El periodo y el rango van a la query string (`?period=custom&from=…&to=…`) y la página se inicializa desde ahí. |
| 7 | El `DateRangePicker` solo aparece dentro del tab Personalizado, como si fuera un modo aparte. | Elegir fechas en el picker **cambia solo** a Personalizado. Un tab fijo escribe su rango en el picker, así se ve de qué fechas se está hablando y se pueden ajustar desde ahí. |

Con esto, los cuatro tabs fijos pasan a ser presets de un único mecanismo:
un rango de fechas. `getReport(period)` se conserva para ellos —el backend
calcula sus límites y no hay por qué duplicar ese calendario en el cliente—,
pero la UI ya no distingue dos modos.

**Nota sobre el detalle semanal:** `admiteDetalleSemanal` (Fase 4) mira la
**duración** del reporte, no su `report_type`. Un rango personalizado de dos
meses trae exactamente las mismas secciones de detalle que el tab Mensual.

**Tests Fase 3** — `tests/reportePorFecha.test.tsx`

- elegir un rango y presionar Generar pide `/reports/custom` con esos `from`/`to`
  convertidos a UTC desde hora Bogotá;
- `from` posterior a `to` deshabilita Generar y muestra el motivo, sin llamar
  a la API;
- un rango de duración cero se rechaza igual;
- el preset *Mes pasado* produce el 1 al último día del mes anterior a
  medianoche Bogotá (probado en una fecha fija, incluido un cambio de año);
- el nombre del CSV lleva las fechas del rango, y dos rangos distintos no
  producen el mismo nombre;
- el PDF del informe se pide con el rango **en pantalla**, no con el mes en
  curso (el bug #1);
- montar la página con `?period=custom&from=…&to=…` reconstruye ese reporte
  sin tocar los controles;
- elegir un tab fijo deja sus fechas visibles en el picker.

---

### Fase 4 — Dominio del detalle (funciones puras, sin UI) ✅ HECHA

`src/domain/detalleDelPeriodo.ts`:

```ts
export interface SemanaDelPeriodo {
  /** Lunes de la semana, ISO en UTC. */ inicio: string;
  fin: string;
  etiqueta: string;          // "1–7 sep"
  consumoKwh: number;
  exportacionKwh: number;
}

export interface PicoDiario { fecha: string; kwh: number }
export interface PicoHorario { hora: number; kwh: number; fecha: string | null }

/** Agrupa buckets diarios en semanas (lunes a domingo, America/Bogota). */
export function agruparPorSemana(merged: MergedEnergyPoint[]): SemanaDelPeriodo[];

/** El bucket con más consumo. null si no hubo consumo. */
export function diaDeMayorConsumo(merged: MergedEnergyPoint[]): PicoDiario | null;

/** La hora con más consumo del rango, según el heatmap. */
export function horaDeMayorConsumo(heatmap: HeatmapResult): PicoHorario | null;

/** La hora pico de cada semana. */
export function horaPicoPorSemana(heatmap: HeatmapResult): Map<string, PicoHorario>;

/**
 * Si el detalle semanal aplica: solo cuando el periodo abarca ≥ 14 días y sus
 * buckets son diarios o más finos. En un reporte diario no hay semanas.
 */
export function admiteDetalleSemanal(report: ReportData): boolean;
```

Decisiones que el módulo documenta en comentarios:

- las semanas se cortan en **lunes hora de Bogotá**, no en UTC: un bucket de
  las 19:00 del domingo local es lunes UTC y caería en la semana equivocada;
- una semana parcial (la primera o la última del mes) se incluye **con su
  etiqueta real de fechas**, para que nadie lea "semana floja" donde solo hay
  tres días;
- **nunca** se suman pesos: solo kWh (ver la regla de costos).

**Tests Fase 4** — `tests/detalleDelPeriodo.test.ts`

- 30 buckets diarios producen 5 semanas, la primera y la última parciales;
- un bucket del domingo 19:00 hora Bogotá cae en esa semana, no en la
  siguiente (el caso UTC);
- `diaDeMayorConsumo` con empate devuelve el más antiguo, y `null` si todo es 0;
- `horaDeMayorConsumo` ignora los `null` del heatmap y no los cuenta como 0;
- `horaPicoPorSemana` devuelve una entrada por semana con datos, ninguna por
  semana totalmente vacía;
- `admiteDetalleSemanal` es `false` para día y semana, `true` para mes, y
  para `custom` depende de la duración;
- el módulo no exporta ninguna función que sume COP (guardia explícita).

---

### Fase 5 — El detalle en pantalla ✅ HECHA

Solo cuando `admiteDetalleSemanal(report)`:

1. **`src/components/dashboard/WeeklyBreakdownCard.tsx`**
   `ComparisonBarChart` de kWh importado/exportado por semana, etiqueta
   "1–7 sep". Tooltip con el rango de fechas completo.
2. **`src/components/dashboard/PeakInsightsCard.tsx`**
   Tres `StatCard`: **Día de mayor consumo** (fecha + kWh), **Hora pico**
   (`19:00` + kWh medio), **Semana de mayor consumo** (etiqueta + kWh y su
   delta % contra la media de las semanas del periodo).
   Cada tile se omite si su dato no existe — no se pinta `—` en un informe.
3. **Reutilizar lo que ya está construido** pasándole el rango del reporte:
   `HeatmapCard fromIso={report.period_start} toIso={report.period_end}` y
   `HourlyProfileChart` con `getDailyProfile` del mismo rango.
4. Las peticiones del detalle (`getHeatmap`, `getDailyProfile`) van con
   `.catch(() => null)` y **no** bloquean el reporte: si fallan, la página
   sigue mostrando lo de la Fase 2.

Orden final de la página `/reports`:

```
[tabs + rango + Informe del mes (PDF)]
franja periodo / generado
Importado · Exportado · Balance neto
Desglose de costos
Importación vs. exportación (+ CSV)
Costo por periodo (COP)
── solo si admiteDetalleSemanal ──
Consumo por semana
Día pico · Hora pico · Semana pico
Reparto hora × día (heatmap)
Perfil horario medio
──────────────────────────────────
KPIs eléctricos
Demanda máxima · Factor de carga · Carga base
```

**Tests Fase 5** — `tests/reporteMensualDetallado.test.tsx`

- con periodo **Diario** no aparece ninguna sección semanal;
- con periodo **Mensual** aparecen "Consumo por semana" y los tiles de pico;
- si `/analytics/heatmap` falla, el reporte se muestra igual y solo faltan las
  secciones que dependían de él (ningún estado de error global);
- el tile de hora pico dice la hora en formato local (`19:00`), no el índice;
- el tile de semana pico expresa el delta contra la media del periodo;
- ningún tile del detalle muestra pesos.

---

### Fase 6 — Que el PDF mensual cuente lo mismo ✅ HECHA

`src/domain/informeMensual.ts` gana la sección `'semanas'` (entre `'cascada'`
y `'cobertura'`) y `src/utils/monthlyReportPdf.ts` la dibuja con el **mismo**
`detalleDelPeriodo.ts` de la Fase 4 — una sola definición de "semana" para
pantalla y papel.

Contenido de la sección: tabla semana → kWh importado / exportado / Δ% contra
la semana anterior, más una línea con día pico y hora pico del mes.
`seccionesDelInforme` la omite si `agruparPorSemana` devuelve menos de dos
semanas.

**Tests Fase 6**

- `tests/informeMensual.test.ts` (ampliar): la sección `'semanas'` entra con
  un mes completo y se omite con un reporte de 5 días.
- `tests/informesPdf.test.ts` (ampliar, vía `pdfInspector`): el PDF contiene
  la fila de cada semana y la línea de día/hora pico, y la tabla no se parte a
  mitad de página (`ensureSpace`).

---

### Fase 7 — Cierre ✅ HECHA

- README: Pantallas (una fila menos, descripción nueva de Reportes) y el badge
  de tests.
- `PLAN_ANALITICA.md` / `PLAN_REFACTORIZACION.md`: marcar lo que este plan
  cierra.
- `npm run lint && npm run typecheck && npm run test` en verde.

---

## 4. Lo que apareció al hacerlo

- **Las fechas salían en inglés.** `formatLocalDateTime` no le pasaba locale a
  date-fns, así que la franja del reporte decía "1 Aug 2026" al lado de tarjetas
  de costo que decían "ago. 2026" (esas salen de `Intl` con es-CO). Arreglado en
  `format.ts`, `LiveLineChart` y `useLocalClock`, con `tests/fechasEnEspanol.test.ts`
  de guardia. Era previo a este plan y afectaba toda la app.
- **La cuadrícula del PDF se comía el pie.** `seccionHeatmap` reservaba 200 pt
  fijos, que alcanzan para unos 25 días: un mes de 31 empujaba las últimas
  filas sobre la banda del pie. El alto de fila se calcula ahora desde el
  número de días, así que la cuadrícula siempre cabe. Era un bug latente que
  solo se destapó al darle series diarias al fixture.
- **`admiteDetalleSemanal` mira dos cosas, no una.** Además de la duración,
  el espaciado de los buckets: el reporte anual llega con doce puntos
  mensuales y agruparlos "por semana" daría doce semanas de un bucket.
- **No se reusó `HeatmapCard` en Reportes.** Trae su propia consulta, y el
  detalle ya necesita el mapa de importación para la hora pico: habría pedido
  el mismo dato dos veces para dibujarlo una. Se pide una vez y se monta
  `CalendarHeatmap` directo; el selector de métrica sigue en Análisis.
- **`DatosInformeMensual.mes` desapareció.** El título y el nombre del archivo
  salen ahora del periodo que reportó el backend (`etiquetaDelPeriodo`,
  `sufijoDeArchivo`), que es el único dato que no puede contradecir a la
  pantalla. El PDF pasó a llamarse `informe_energia_*`.

---

## 5. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sumar COP por semana daría un total que no cuadra con la factura | El dominio no expone ninguna función que sume pesos; test de guardia en Fase 4 |
| Semanas cortadas en UTC descolocan los domingos | Corte en hora de Bogotá + test del caso domingo 19:00 |
| Dos llamadas extra (`heatmap`, `daily-profile`) encarecen la página | Solo se piden cuando `admiteDetalleSemanal`, y con `catch` que no bloquea |
| Enlaces guardados a `/consumption-export` | Redirect permanente + test |
| Un rango personalizado de un año pide buckets que el backend puede tardar o truncar | Se mide en Fase 0 con el rango más largo esperable; si trunca, el aviso sale en pantalla, no en silencio |
| El rango en la query string choca con el `device_id` del selector de medidor | El rango describe el tiempo, no la sede: al cambiar de medidor se conserva el rango y se vuelve a pedir el reporte |
| El heatmap podría no aceptar rangos de periodo fijo | Se verifica en Fase 0 antes de escribir la Fase 5 |
