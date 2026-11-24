/** Datos de la maqueta 3D (port de views.barrio): evolución de cada instrumento en ~12 momentos. */
import { redondear } from "./formatos";
import { aporteMinimo, trayectoria, type Fila } from "./instrumentos";

export interface InstEscena { nombre: string; riesgo: string; puntos: [number, number, number][] }
export interface DatosEscena { meses: number[]; inst: InstEscena[] }

export function barrio(filas: Fila[], d: { inicial: number; aporte: number; meses: number; inflacion: number }, cortes = 12): DatosEscena {
  const meses = d.meses;
  const marcas = [...new Set(Array.from({ length: cortes + 1 }, (_, k) => redondear(meses * k / cortes)))].sort((a, b) => a - b);
  const inst = filas.map((f) => {
    const t = trayectoria(d.inicial, d.aporte, meses, f.tasa, d.inflacion, f.apv ?? false, aporteMinimo(f));
    return { nombre: f.nombre, riesgo: f.riesgo_txt,
      puntos: marcas.map((m) => [redondear(t[m].aportado), redondear(t[m].nominal), redondear(t[m].real)] as [number, number, number]) };
  });
  return { meses: marcas, inst };
}
