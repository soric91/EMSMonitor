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
    title: 'EMS Residencial',
    favicon: './public/favicon.svg',
  },
  output: {
    assetPrefix: basePath,
  },
});
