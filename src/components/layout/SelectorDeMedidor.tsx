import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Gauge, Router, Search, WifiOff } from 'lucide-react';
import { useDevice } from '../../hooks/useDevice';
import { useClickOutside } from '../../hooks/useClickOutside';

/**
 * Qué gateway y qué medidor se está mirando.
 *
 * Dos desplegables encadenados, al lado del indicador de conexión: primero el
 * gateway, después uno de sus equipos. Es el recorrido que hace quien instaló
 * la planta —"el gateway del cuarto de máquinas, el medidor de las bombas"— y
 * no obliga a leer una lista de nombres casi idénticos para encontrar uno.
 *
 * Con un solo gateway el chip lo muestra sin desplegable: no hay nada que
 * elegir, y ofrecer una lista de un elemento sugiere que sí. Lo mismo con los
 * medidores.
 *
 * **No existe "todos los medidores".** Cada medidor mide su propia acometida:
 * sumarlos daría un número que no corresponde a ninguna, y promediar tensiones
 * de dos medidores distintos no significa nada. Antes esa opción existía y el
 * backend elegía uno en silencio.
 *
 * Un gateway caído se muestra igual, marcado: sus medidores tienen histórico
 * guardado y se pueden consultar; lo que no van a tener es dato en vivo.
 */
const DESDE_CUANTOS_BUSCADOR = 8;

export function SelectorDeMedidor() {
  const {
    gateways,
    selectedGatewayId,
    setSelectedGatewayId,
    selectedDeviceId,
    setSelectedDeviceId,
    cargando,
  } = useDevice();

  const gateway = useMemo(
    () => gateways.find((g) => g.id === selectedGatewayId) ?? gateways[0],
    [gateways, selectedGatewayId],
  );
  const medidor = useMemo(
    () => gateway?.medidores.find((m) => m.device_id === selectedDeviceId),
    [gateway, selectedDeviceId],
  );

  if (cargando || gateway === undefined) return null;

  return (
    <div className="flex items-center gap-1.5">
      <Desplegable
        icono={<Router className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
        etiqueta={gateway.serie}
        aviso={!gateway.enLinea}
        titulo="Gateway"
        opciones={gateways.map((g) => ({
          id: g.id,
          principal: g.serie,
          secundario: g.sede,
          aviso: !g.enLinea,
        }))}
        elegido={gateway.id}
        alElegir={setSelectedGatewayId}
      />
      <Desplegable
        icono={<Gauge className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
        etiqueta={medidor?.nombre ?? 'Sin medidores'}
        titulo="Medidor"
        opciones={gateway.medidores.map((m) => ({
          id: m.device_id,
          principal: m.nombre,
          secundario: m.modbus_id !== null ? `Modbus ${m.modbus_id}` : '',
        }))}
        elegido={medidor?.device_id ?? ''}
        alElegir={setSelectedDeviceId}
      />
    </div>
  );
}

interface Opcion {
  id: string;
  principal: string;
  secundario: string;
  aviso?: boolean;
}

interface DesplegableProps {
  icono: React.ReactNode;
  etiqueta: string;
  titulo: string;
  opciones: Opcion[];
  elegido: string;
  alElegir: (id: string) => void;
  aviso?: boolean;
}

function Desplegable({
  icono,
  etiqueta,
  titulo,
  opciones,
  elegido,
  alElegir,
  aviso = false,
}: DesplegableProps) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const contenedor = useClickOutside<HTMLDivElement>(() => setAbierto(false), abierto);

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return opciones;
    return opciones.filter(
      (o) =>
        o.principal.toLowerCase().includes(texto) || o.secundario.toLowerCase().includes(texto),
    );
  }, [opciones, busqueda]);

  // Con uno solo no hay elección: se muestra el nombre y nada más.
  const hayQueElegir = opciones.length > 1;

  const contenido = (
    <>
      {icono}
      <span className="min-w-0 truncate">{etiqueta}</span>
      {aviso && <WifiOff className="h-3 w-3 shrink-0 text-amber-500" />}
      {hayQueElegir && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
    </>
  );
  const clases =
    'flex min-w-0 max-w-[7rem] items-center gap-1.5 rounded-full border border-slate-900/10 px-2.5 py-1.5 text-xs font-medium text-slate-600 sm:max-w-[12rem] dark:border-white/10 dark:text-slate-300';

  if (!hayQueElegir) {
    return (
      <span title={titulo} className={clases}>
        {contenido}
      </span>
    );
  }

  return (
    <div ref={contenedor} className="relative min-w-0">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={titulo}
        title={titulo}
        className={`${clases} transition hover:bg-slate-900/5 dark:hover:bg-white/5`}
      >
        {contenido}
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="listbox"
            aria-label={titulo}
            className="absolute right-0 z-30 mt-2 max-h-[70vh] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-900/10 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-slate-900"
          >
            {opciones.length >= DESDE_CUANTOS_BUSCADOR && (
              <div className="sticky top-0 mb-1 flex items-center gap-2 rounded-lg bg-slate-900/5 px-2.5 py-1.5 dark:bg-white/5">
                <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <input
                  autoFocus
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar"
                  aria-label={`Buscar ${titulo.toLowerCase()}`}
                  className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
                />
              </div>
            )}

            {filtradas.length === 0 && (
              <p className="px-2.5 py-3 text-xs text-slate-400">Ninguno coincide.</p>
            )}

            {filtradas.map((opcion) => {
              const esElegido = opcion.id === elegido;
              return (
                <button
                  key={opcion.id}
                  role="option"
                  aria-selected={esElegido}
                  onClick={() => {
                    alElegir(opcion.id);
                    setAbierto(false);
                    setBusqueda('');
                  }}
                  className={[
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition',
                    esElegido
                      ? 'bg-accent-500/10 text-accent-700 dark:text-accent-400'
                      : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/5',
                  ].join(' ')}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{opcion.principal}</span>
                      {opcion.aviso && (
                        <span
                          title="No está reportando: sus medidores no van a tener datos en vivo"
                          className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                        >
                          <WifiOff className="h-2.5 w-2.5" />
                          sin conexión
                        </span>
                      )}
                    </span>
                    {opcion.secundario && (
                      <span className="block text-[10px] text-slate-400">{opcion.secundario}</span>
                    )}
                  </span>
                  {esElegido && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
