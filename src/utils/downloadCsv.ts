/**
 * Descarga un CSV en el navegador.
 *
 * Dos implementaciones casi idénticas vivían en Reports.tsx (exportar CSV con
 * costos) y en el resumen de analytics. El Blob, el link temporal y la
 * revocación de la URL son idénticos; lo único que cambia es el contenido.
 */
export function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((row) => row.join(',')).join('\n');
  saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

/**
 * Descarga un Blob ya armado con el nombre pedido.
 *
 * Es la salida de los CSVs que llegan del backend como stream (la reactiva por
 * cuadrante): ahí el contenido no se toca — un `responseType: 'blob'` lo trae
 * listo para bajar, y volverlo a unir a `rows` solo gastaría memoria.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
