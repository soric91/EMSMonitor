import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Building2,
  CircleAlert,
  CircleCheck,
  Cpu,
  EyeOff,
  MapPin,
  Radio,
  Search,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getAccessToken } from '../api/tokenStore';
import { listProyectos } from '../api/proyectos';
import type { EstadoCliente, Proyecto } from '../api/types';
import { desdeUltimaConexion, diagnosticar, porUrgencia, type Nivel } from '../domain/salud';
import { Card } from '../components/ui/Card';
import { UserMenu } from '../components/layout/UserMenu';
import { GatewaysCaidos } from '../components/proyectos/GatewaysCaidos';
import { EmptyState } from '../components/ui/EmptyState';

/**
 * Dónde cae un administrador después de entrar.
 *
 * Su cuenta no pertenece a ninguna empresa, así que no hay un tablero que
 * mostrarle: primero elige cuál mirar. Al elegir pide un token acotado a esa
 * empresa y a partir de ahí el panel funciona igual que para un cliente —esa
 * es toda la gracia, no hay una segunda versión de cada pantalla.
 */
export function Proyectos() {
  const { entrarA } = useAuth();
  const navigate = useNavigate();
  const [proyectos, setProyectos] = useState<Proyecto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function cargar() {
      const token = getAccessToken();
      if (!token) return;
      try {
        const lista = await listProyectos(token);
        if (!cancelled) setProyectos(lista);
      } catch {
        if (!cancelled) setError('No se pudieron cargar los proyectos.');
      }
    }

    void cargar();
    return () => {
      cancelled = true;
    };
  }, []);

  async function abrir(proyecto: Proyecto) {
    setEntrando(proyecto.id);
    setError(null);
    try {
      await entrarA(proyecto.id);
      // Hay que navegar explícitamente. El guardia solo *manda* a esta
      // pantalla cuando falta elegir empresa; al elegirla deja de mandar,
      // pero no saca de acá — sin esto la tarjeta se queda en "abriendo…"
      // para siempre con la sesión ya cambiada.
      navigate('/dashboard', { replace: true });
    } catch {
      setError(`No se pudo abrir ${proyecto.nombre_empresa}.`);
      setEntrando(null);
    }
  }

  // El filtro es local: la lista ya está en memoria y son pocas empresas, así
  // que ir al servidor por cada tecla agregaría latencia sin ganar nada.
  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    const filtrados = termino
      ? (proyectos ?? []).filter((p) => p.nombre_empresa.toLowerCase().includes(termino))
      : (proyectos ?? []);
    // Primero lo que hay que atender. Ordenado por nombre, un proyecto roto se
    // esconde entre veinte que andan bien.
    return [...filtrados].sort(porUrgencia);
  }, [proyectos, busqueda]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-900/5 bg-white/80 px-4 backdrop-blur-xl sm:px-6 dark:border-white/5 dark:bg-slate-950/80">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Building2 className="h-4 w-4 text-accent-600 dark:text-accent-400" />
          Proyectos
        </span>
        {/* Sin esto no había forma de saber con qué cuenta entraste ni de
            salir: la pantalla no monta el Topbar, que necesita una empresa. */}
        <UserMenu />
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Proyectos
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Elegí una empresa para ver su consumo como lo ve ella.
            </p>
          </div>

          {/* Aparece recién con la lista cargada: un buscador sobre nada
              invita a escribir en algo que todavía no puede responder. */}
          {proyectos !== null && proyectos.length > 0 && (
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar empresa…"
                aria-label="Buscar empresa"
                className="w-56 rounded-lg border border-slate-900/10 bg-white py-1.5 pr-2.5 pl-8 text-xs text-slate-700 outline-none transition focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
              />
            </label>
          )}
        </div>

        <GatewaysCaidos />

        {error && (
          <Card className="flex items-center gap-2 border-amber-500/30 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </Card>
        )}

        {proyectos === null && !error && (
          <Grilla>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <TarjetaFantasma key={i} />
            ))}
          </Grilla>
        )}

        {proyectos !== null && proyectos.length === 0 && (
          <EmptyState
            icon={Building2}
            title="No hay proyectos"
            description="Todavía no se dio de alta ninguna empresa en el CRM."
          />
        )}

        {proyectos !== null && proyectos.length > 0 && visibles.length === 0 && (
          <EmptyState
            icon={Search}
            title="Sin coincidencias"
            description={`Ninguna empresa coincide con "${busqueda}".`}
          />
        )}

        {visibles.length > 0 && (
          <Grilla>
            {visibles.map((proyecto) => (
              <Tarjeta
                key={proyecto.id}
                proyecto={proyecto}
                abriendo={entrando === proyecto.id}
                bloqueada={entrando !== null}
                onClick={() => void abrir(proyecto)}
              />
            ))}
          </Grilla>
        )}
      </div>
    </div>
  );
}

function Grilla({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

const MARCO =
  'rounded-2xl border border-slate-900/5 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-slate-900';

/**
 * El hueco que deja una tarjeta mientras carga.
 *
 * Tiene el marco de la tarjeta real y barras grises adentro, en vez de un
 * bloque liso: un rectángulo del tamaño de la tarjeta sobre un fondo claro se
 * lee como una tarjeta vacía —como si el proyecto no tuviera nada— y no como
 * algo que todavía está llegando.
 */
function TarjetaFantasma() {
  return (
    <div className={`${MARCO} animate-pulse space-y-3`}>
      <div className="h-9 w-9 rounded-lg bg-slate-900/10 dark:bg-white/10" />
      <div className="h-4 w-3/5 rounded bg-slate-900/10 dark:bg-white/10" />
      <div className="h-3 w-2/5 rounded bg-slate-900/[0.07] dark:bg-white/[0.07]" />
    </div>
  );
}

const ESTADO: Record<EstadoCliente, { texto: string; clase: string }> = {
  activo: {
    texto: 'Activo',
    clase: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  suspendido: {
    texto: 'Suspendido',
    clase: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
  prospecto: {
    texto: 'Prospecto',
    clase: 'bg-slate-500/10 text-slate-500 dark:text-slate-400',
  },
};

const SEMAFORO: Record<Nivel, { clase: string; icono: typeof CircleCheck }> = {
  ok: {
    clase: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    icono: CircleCheck,
  },
  atencion: {
    clase: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    icono: WifiOff,
  },
  incompleto: {
    clase: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    icono: CircleAlert,
  },
};

function Tarjeta({
  proyecto,
  abriendo,
  bloqueada,
  onClick,
}: {
  proyecto: Proyecto;
  abriendo: boolean;
  bloqueada: boolean;
  onClick: () => void;
}) {
  const estado = ESTADO[proyecto.estado];
  const diagnostico = diagnosticar(proyecto);
  const semaforo = SEMAFORO[diagnostico.nivel];
  const Icono = semaforo.icono;
  const desde = desdeUltimaConexion(proyecto.ultima_conexion);

  return (
    <motion.button
      onClick={onClick}
      disabled={bloqueada}
      whileHover={{ y: -2 }}
      className={`${MARCO} flex flex-col items-start gap-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-accent-500/40 hover:shadow-lg hover:shadow-slate-900/5 disabled:opacity-60 dark:hover:shadow-black/40`}
    >
      <span className="flex w-full items-start justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/10 text-accent-600 dark:text-accent-400">
          <Building2 className="h-4 w-4" />
        </span>
        {estado && <Etiqueta className={estado.clase}>{estado.texto}</Etiqueta>}
      </span>

      <span className="text-sm font-semibold text-slate-900 dark:text-white">
        {proyecto.nombre_empresa}
      </span>

      {/* El inventario, para distinguir de un vistazo un proyecto instalado
          de uno recién dado de alta. */}
      <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <Conteo icono={MapPin} n={proyecto.sedes} uno="sede" varias="sedes" />
        <Conteo
          icono={Radio}
          n={proyecto.gateways}
          uno="gateway"
          varias="gateways"
          detalle={proyecto.gateways > 0 ? `${proyecto.gateways_en_linea} en línea` : undefined}
        />
        <Conteo icono={Cpu} n={proyecto.equipos} uno="medidor" varias="medidores" />
      </span>

      <span className="flex flex-wrap items-center gap-1.5">
        {/* El semáforo: qué falta, o que está midiendo. Una línea, la que hay
            que leer — no la lista completa de todo lo pendiente. */}
        <Etiqueta className={semaforo.clase}>
          <Icono className="h-3 w-3" />
          {diagnostico.mensaje}
        </Etiqueta>
        {!proyecto.puede_ver_consumo && (
          <Etiqueta className="bg-slate-500/10 text-slate-500 dark:text-slate-400">
            <EyeOff className="h-3 w-3" />
            Oculto para el cliente
          </Etiqueta>
        )}
      </span>

      {desde !== null && (
        <span className="text-[11px] text-slate-400">Última conexión {desde}</span>
      )}

      {abriendo && <span className="text-xs text-slate-400">abriendo…</span>}
    </motion.button>
  );
}

function Conteo({
  icono: Icono,
  n,
  uno,
  varias,
  detalle,
}: {
  icono: typeof MapPin;
  n: number;
  uno: string;
  varias: string;
  detalle?: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <Icono className="h-3 w-3" />
      {n} {n === 1 ? uno : varias}
      {detalle && <span className="text-slate-400">· {detalle}</span>}
    </span>
  );
}

function Etiqueta({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}
