import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';

// Docs: https://rsbuild.rs/config/
// En GitHub Pages el sitio vive bajo /EMSMonitor/ — el workflow define
// PUBLIC_BASE_PATH; en dev y builds locales queda en raíz.
const basePath = process.env.PUBLIC_BASE_PATH ?? '/';

export default defineConfig({
  plugins: [pluginReact(), pluginTailwindcss()],
  html: {
    title: 'EMS Monitor',
    favicon: './public/favicon.svg',
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
