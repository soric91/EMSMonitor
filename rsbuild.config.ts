import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';

// Docs: https://rsbuild.rs/config/
// En GitHub Pages el sitio vive bajo /EMSMonitor/ — el workflow define
// PUBLIC_BASE_PATH; en dev y builds locales queda en raíz.
const basePath = process.env.PUBLIC_BASE_PATH ?? '/';

/**
 * CSP para el build de producción, inyectada como <meta> porque GitHub Pages
 * no permite cabeceras de respuesta propias. Las únicas conexiones permitidas
 * son el propio origen ('self') y los servicios del backend; sin 'unsafe-inline'
 * en script-src por diseño, así un hipotético XSS no puede cargar script.
 */
function toCspOrigin(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function buildCsp(): string | null {
  // En dev no: el HMR/react-refresh inyecta scripts en línea y rompería el navegador.
  if (process.env.NODE_ENV !== 'production') return null;

  const origins = new Set<string>(['self']);
  for (const url of [
    process.env.PUBLIC_API_BASE_URL,
    process.env.PUBLIC_CRM_BASE_URL,
    process.env.PUBLIC_WS_URL,
  ]) {
    const origin = toCspOrigin(url);
    if (!origin) continue;
    origins.add(origin);
    // El WebSocket se abre con ws/wss: su origen de red es el mismo host.
    if (/^http/.test(origin)) {
      origins.add(origin.replace(/^https/, 'wss').replace(/^http/, 'ws'));
    }
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${[...origins].join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

const csp = buildCsp();

export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss()],
  html: {
    title: 'EMS Monitor',
    favicon: './public/favicon.svg',
    tags: csp
      ? [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp } }]
      : [],
  },
  server: {
    // Fijo, no el 3000 por defecto: ese puerto ya lo usa otro panel en esta
    // máquina, y el origen tiene que coincidir con CORS_ORIGINS de ApiEMS.
    port: 3010,
    // Escucha en todas las interfaces para poder abrirlo desde el celular
    // o desde otra máquina de la red.
    host: '0.0.0.0',
  },
  output: {
    assetPrefix: basePath,
  },
});
