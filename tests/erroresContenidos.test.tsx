/**
 * Que el error de una sección no deje la página en blanco.
 *
 * lightweight-charts lanza "Value is null" desde sus propios recálculos al
 * cambiar de página con datos en vuelo. Dentro de un efecto de React eso
 * desmonta el árbol ENTERO: el cliente se queda sin barra lateral, sin menú y
 * sin manera de volver salvo recargar.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from '@rstest/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { ErrorBoundary } from '../src/components/layout/ErrorBoundary';

/** Revienta al renderizar, como lo hace una gráfica con el modelo a medias. */
function Explota(): never {
  throw new Error('Value is null');
}

// React escribe el error en consola aunque el boundary lo atrape; el ruido
// taparía el resultado del test.
const errorOriginal = console.error;
beforeAll(() => {
  console.error = () => {};
});
afterAll(() => {
  console.error = errorOriginal;
});
afterEach(cleanup);

describe('lo que ve el cliente', () => {
  test('un hijo que revienta se convierte en un aviso, no en una pantalla vacía', () => {
    render(
      <ErrorBoundary>
        <Explota />
      </ErrorBoundary>,
    );

    expect(screen.getByText('No se pudo mostrar esta sección')).toBeInTheDocument();
    expect(screen.getByText(/El resto del panel sigue funcionando/)).toBeInTheDocument();
  });

  test('el aviso puede llevar el nombre de lo que falló', () => {
    render(
      <ErrorBoundary titulo="No se pudo dibujar la gráfica">
        <Explota />
      </ErrorBoundary>,
    );

    expect(screen.getByText('No se pudo dibujar la gráfica')).toBeInTheDocument();
  });

  test('sin error, los hijos se muestran tal cual y no hay aviso', () => {
    render(
      <ErrorBoundary>
        <p>Consumo del mes</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Consumo del mes')).toBeInTheDocument();
    expect(screen.queryByText('Reintentar')).toBeNull();
  });
});

describe('cómo se sale del error', () => {
  test('Reintentar vuelve a montar el subárbol', () => {
    // El caso real: la gráfica reventó porque el contenedor aún no tenía
    // tamaño, y al reintentar ya lo tiene.
    let falla = true;
    function Grafica() {
      if (falla) throw new Error('Value is null');
      return <p>Gráfica lista</p>;
    }

    render(
      <ErrorBoundary>
        <Grafica />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Reintentar')).toBeInTheDocument();

    falla = false;
    fireEvent.click(screen.getByText('Reintentar'));

    expect(screen.getByText('Gráfica lista')).toBeInTheDocument();
  });

  test('cambiar de sección limpia el error: lo que falló fue lo de antes', () => {
    function Navegable() {
      const [ruta, setRuta] = useState('/dashboard');
      return (
        <>
          <button onClick={() => setRuta('/reports')}>ir a reportes</button>
          <ErrorBoundary resetKey={ruta}>
            {ruta === '/dashboard' ? <Explota /> : <p>Reportes</p>}
          </ErrorBoundary>
        </>
      );
    }

    render(<Navegable />);
    expect(screen.getByText('No se pudo mostrar esta sección')).toBeInTheDocument();

    fireEvent.click(screen.getByText('ir a reportes'));

    expect(screen.getByText('Reportes')).toBeInTheDocument();
    expect(screen.queryByText('No se pudo mostrar esta sección')).toBeNull();
  });
});

describe('dónde está puesto', () => {
  test('el layout envuelve la página, no la app entera', () => {
    // Adentro del layout: si envolviera todo, un error se llevaría también la
    // barra lateral y el selector de medidor, que es lo que hay que conservar
    // para poder irse a otra sección sin recargar.
    const layout = readFileSync('src/components/layout/AppLayout.tsx', 'utf8');

    expect(layout).toMatch(/<ErrorBoundary resetKey=\{pathname\}>\s*<Outlet \/>/);
  });
});

describe('la gráfica en vivo', () => {
  test('sus llamadas a lightweight-charts van dentro de una guarda', () => {
    // El stack del crash no pasa por código nuestro: sale de los recálculos
    // internos que disparan setData/applyOptions/remove.
    const grafica = readFileSync('src/components/charts/LiveLineChart.tsx', 'utf8');

    expect(grafica).toContain("sinReventar('dibujar las series'");
    expect(grafica).toContain("sinReventar('aplicar el tema'");
    expect(grafica).toContain("sinReventar('destruir'");
    // Y no se le habla a una gráfica ya destruida.
    expect(grafica).toContain('destruidaRef.current = true');
  });
});
