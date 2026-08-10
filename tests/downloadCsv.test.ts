/**
 * downloadCsv: crea el Blob correcto, lo descarga con el nombre pedido y
 * revoca la URL temporal.
 */

import { afterEach, beforeEach, describe, expect, test } from '@rstest/core';
import { downloadCsv } from '../src/utils/downloadCsv';

interface LinkSpy {
  href: string;
  download: string;
  click: () => void;
}

describe('downloadCsv', () => {
  let blobs: Blob[];
  let links: LinkSpy[];
  let revoked: string[];
  let originalCreate: typeof URL.createObjectURL;
  let originalRevoke: typeof URL.revokeObjectURL;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    blobs = [];
    links = [];
    revoked = [];
    originalCreate = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    originalCreateElement = document.createElement;

    Object.defineProperty(URL, 'createObjectURL', {
      value: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:mock';
      },
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: (url: string) => {
        revoked.push(url);
      },
      configurable: true,
    });
    document.createElement = ((tag: string) => {
      const el = originalCreateElement.call(document, tag) as HTMLAnchorElement & LinkSpy;
      el.click = () => {
        // sin fanfarria: el link ni siquiera se monta al DOM en el test
      };
      links.push(el);
      return el;
    }) as typeof document.createElement;
  });

  afterEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { value: originalCreate, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: originalRevoke, configurable: true });
    document.createElement = originalCreateElement;
  });

  test('crea un Blob CSV y un link con el nombre pedido', async () => {
    downloadCsv('reporte_2026.csv', [
      ['hora', 'kwh'],
      ['08:00', '10.5'],
    ]);

    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.type).toBe('text/csv;charset=utf-8');
    expect(await blobs[0]?.text()).toBe('hora,kwh\n08:00,10.5');
    expect(links).toHaveLength(1);
    expect(links[0]?.download).toBe('reporte_2026.csv');
    expect(links[0]?.href).toBe('blob:mock');
  });

  test('revoca la URL temporal después de descargar', () => {
    downloadCsv('x.csv', [['a', 'b']]);

    expect(revoked).toEqual(['blob:mock']);
  });
});
