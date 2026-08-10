/**
 * Descarga un CSV en el navegador.
 *
 * Dos implementaciones casi idénticas vivían en Reports.tsx (exportar CSV con
 * costos) y en el resumen de analytics. El Blob, el link temporal y la
 * revocación de la URL son idénticos; lo único que cambia es el contenido.
 */
export function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((row) => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
