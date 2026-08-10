import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, PlugZap, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useVariables } from '../../hooks/useVariables';

/**
 * El aviso de que este proyecto todavía no mide nada.
 *
 * Sin esto, entrar a un proyecto sin configurar muestra un tablero lleno de
 * ceros — que es indistinguible de un medidor apagado, o de una falla de red.
 * Los tres se ven igual y ninguno dice qué hacer.
 *
 * Se apoya en que el contexto de variables distingue "no hay ninguna" de "no
 * se pudo preguntar". Si la consulta falló, esto no aparece: afirmar que no
 * hay nada configurado cuando en realidad no se sabe sería peor que el
 * tablero en cero.
 *
 * Y distingue un tercer caso, que costó una tarde de depuración: el CRM tiene
 * las variables cargadas y ninguna reportó nunca. Se ve igual que no tener
 * nada configurado, pero se arregla en el lado opuesto —el gateway o el
 * almacenamiento, no el CRM— así que mandar a configurar el CRM manda a
 * revisar lo único que estaba bien.
 */
export function SinConfiguracion() {
  const { variables, declaradas, cargando, error } = useVariables();
  const { suplantando, salirDelProyecto } = useAuth();
  const [descartado, setDescartado] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const vacio = !cargando && !error && variables.length === 0;
  if (!vacio || descartado) return null;

  const sinConfigurar = declaradas === 0;

  async function volver() {
    setSaliendo(true);
    try {
      await salirDelProyecto();
    } catch {
      setSaliendo(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sin-configuracion-titulo"
      >
        <motion.div
          initial={{ scale: 0.96, y: 8 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 8 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="relative w-full max-w-md rounded-2xl border border-slate-900/5 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900"
        >
          {/* Se puede cerrar: el tablero vacío igual es navegable, y encerrar
              a alguien en un aviso es peor que el aviso. */}
          <button
            onClick={() => setDescartado(true)}
            aria-label="Cerrar"
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-900/5 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <PlugZap className="h-5 w-5" />
          </div>

          <h2
            id="sin-configuracion-titulo"
            className="mt-4 text-base font-semibold text-slate-900 dark:text-white"
          >
            {sinConfigurar ? 'Este proyecto todavía no mide nada' : 'Todavía no llegó ninguna lectura'}
          </h2>

          {sinConfigurar ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                No hay ninguna variable cargada, así que no va a llegar ni un dato — el tablero se
                vería en cero aunque el medidor esté funcionando.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Se configuran en el CRM: hay que dar de alta el medidor y las mediciones que va a
                leer.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                El medidor está configurado —{declaradas}{' '}
                {declaradas === 1 ? 'medición cargada' : 'mediciones cargadas'}— pero ninguna
                reportó todavía, así que no hay nada que graficar.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                No hay nada que corregir en el CRM. Falla más abajo: el gateway no está publicando,
                o lo que publica no se está guardando.
              </p>
            </>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {/* Solo para quien puede cambiar de proyecto. A un cliente,
                ofrecerle "volver a proyectos" lo mandaría a una pantalla que
                no tiene. */}
            {suplantando && (
              <button
                onClick={() => void volver()}
                disabled={saliendo}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {saliendo ? 'volviendo…' : 'Volver a proyectos'}
              </button>
            )}
            <button
              onClick={() => setDescartado(true)}
              className="rounded-lg border border-slate-900/10 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-900/5 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Ver el panel igual
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
