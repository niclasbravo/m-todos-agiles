/**
 * Geometría del gráfico de proyección (SVG). Port de comparador/graficos.py: se calcula aparte del dibujo
 * para poder probarla. Las coordenadas salen como texto con punto decimal, igual que en la web.
 */
import { clp, fijo, redondear } from "./formatos";
import type { Punto } from "./instrumentos";

export interface Medidas { W: number; H: number; ML: number; MR: number; MT: number; MB: number }
/** Medidas de la web: 600 × 340 con márgenes izquierda, derecha (etiquetas finales), arriba y abajo. */
export const WEB: Medidas = { W: 600, H: 340, ML: 62, MR: 138, MT: 14, MB: 46 };
/** Medidas para el teléfono: el SVG se ve casi a tamaño real, así que el texto queda legible. */
export const MOVIL: Medidas = { W: 360, H: 260, ML: 46, MR: 84, MT: 12, MB: 38 };
const PASOS_X = [1, 2, 3, 6, 12, 24, 36, 60, 120];

const n = (v: number) => fijo(v, 1);

function pasoBonito(rango: number, cant: number): number {
  const crudo = rango / cant;
  const mag = 10 ** Math.floor(Math.log10(crudo));
  for (const m of [1, 2, 2.5, 5, 10]) if (crudo <= m * mag * 1.0000001) return m * mag;
  throw new Error("sin paso");
}

/** Devuelve [mínimo, máximo, marcas] con números redondos que cubren el rango. */
export function ejesY(vmin: number, vmax: number, cant = 4): [number, number, number[]] {
  if (vmax - vmin < 1e-9 * Math.max(1.0, vmax)) [vmin, vmax] = vmax > 0 ? [vmin * 0.9, vmax * 1.1] : [0.0, 1.0];
  const paso = pasoBonito(vmax - vmin, cant);
  const lo = Math.max(0.0, Math.floor(vmin / paso) * paso);
  const hi = Math.ceil(vmax / paso) * paso;
  const total = redondear((hi - lo) / paso) + 1;
  return [lo, hi, Array.from({ length: total }, (_, k) => lo + k * paso)];
}

/** Etiquetas cortas ($5,25 M, $800 mil) con los decimales justos para que no se repitan. */
export function etiquetasEje(marcas: number[]): string[] {
  const tope = Math.max(...marcas);
  const [base, suf] = tope >= 1_000_000 ? [1_000_000, " M"] : tope >= 1_000 ? [1_000, " mil"] : [1, ""];
  const paso = marcas.length > 1 ? (marcas[1] - marcas[0]) / base : 1;
  let dec = 0;
  while (dec < 3 && Math.abs(redondear(paso, dec) - paso) > 1e-9) dec++;
  return marcas.map((m) => (m === 0 ? "$0" : ("$" + fijo(m / base, dec)).replace(".", ",") + suf));
}

export function abrevClp(v: number): string {
  if (Math.abs(v) >= 1_000_000) return ("$" + fijo(v / 1_000_000, 2)).replace(".", ",") + " M";
  if (Math.abs(v) >= 1_000) return "$" + fijo(v / 1_000, 0) + " mil";
  return "$" + fijo(v, 0);
}

/** Evita que las etiquetas finales se encimen: las empuja hacia abajo y, si se pasan, sube el grupo. */
function separar(ys: number[], tope: number, hueco = 16): number[] {
  const orden = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b]);
  let res = [...ys];
  for (let k = 0; k + 1 < orden.length; k++) {
    const a = orden[k], b = orden[k + 1];
    if (res[b] - res[a] < hueco) res[b] = res[a] + hueco;
  }
  const exceso = res[orden.at(-1)!] - tope;
  if (exceso > 0) res = res.map((y) => y - exceso);
  return res;
}

export function marcasX(meses: number): [number[], boolean] {
  const paso = PASOS_X.find((p) => meses / p <= 7) ?? PASOS_X.at(-1)!;
  const ms: number[] = [];
  for (let m = 0; m <= meses; m += paso) ms.push(m);
  return [ms, paso % 12 === 0];
}

export type Serie = "nominal" | "real" | "aportado" | "efectivo_real";
const SERIES: [Serie, string, string][] = [["nominal", "nom", ""], ["real", "real", " real"], ["aportado", "apor", " tú"],
  ["efectivo_real", "efec", " guardado"]];
const NOMBRES: Record<Serie, string> = { nominal: "Con la rentabilidad", real: "Descontando inflación",
  aportado: "Lo que pones tú", efectivo_real: "Guardado sin invertir (pesos de hoy)" };

export interface Grafico {
  ancho: number; alto: number; izq: string; der: string; abajo: string; x_titulo_y: string; x_titulo_x: string; y_etiqueta_x: string;
  y_marcas: { y: string; texto: string }[]; x_marcas: { x: string; texto: string }[]; x_titulo: string;
  nominal: string; real: string; aportado: string; efectivo: string;
  etiquetas: { x: string; y: string; clase: string; texto: string }[];
  hover: { x: string; y: string; clase: string; texto: string; mes: number; serie: Serie; valor: number }[];
  meses_tabla: number[];
  /** Coordenadas numéricas de cada mes, para el dedo que recorre el gráfico en el teléfono. */
  recorrido: { mes: number; x: number; y: Record<Serie, number>; v: Record<Serie, number> }[];
}

/** puntos: salida de `trayectoria`. Devuelve todo lo necesario para dibujar el SVG. */
export function construirGrafico(puntos: Punto[], medidas: Medidas = WEB): Grafico {
  const { W, H, ML, MR, MT, MB } = medidas;
  const meses = puntos.at(-1)!.mes;
  const valores = puntos.flatMap((p) => [p.nominal, p.real, p.aportado, p.efectivo_real]);
  const [lo, hi, marcas] = ejesY(Math.min(...valores), Math.max(...valores));
  const izq = ML, der = W - MR, arr = MT, aba = H - MB;
  const X = (m: number) => izq + (der - izq) * m / meses;
  const Y = (v: number) => aba - (aba - arr) * (v - lo) / (hi - lo);
  const linea = (k: Serie) => puntos.map((p) => `${n(X(p.mes))},${n(Y(p[k]))}`).join(" ");
  const ult = puntos.at(-1)!;
  const ys = separar(SERIES.map(([k]) => Y(ult[k])), H - MB, medidas === WEB ? 16 : 14);
  const etiquetas = SERIES.map(([k, c, suf], i) => ({ x: n(der + 8), y: n(ys[i]), clase: c, texto: abrevClp(ult[k]) + suf }));
  const [ms, enAnios] = marcasX(meses);
  const hover = ms.slice(1).flatMap((m) => SERIES.map(([k, c]) => ({
    x: n(X(m)), y: n(Y(puntos[m][k])), clase: c, texto: `${NOMBRES[k]}, mes ${m}: ${clp(puntos[m][k])}`,
    mes: m, serie: k, valor: puntos[m][k],
  })));
  return {
    ancho: W, alto: H, izq: n(izq), der: n(der), abajo: n(aba), x_titulo_y: n(H - 10),
    x_titulo_x: n((izq + der) / 2), y_etiqueta_x: n(izq - 8),
    y_marcas: marcas.map((v, i) => ({ y: n(Y(v)), texto: etiquetasEje(marcas)[i] })),
    x_marcas: ms.map((m) => ({ x: n(X(m)), texto: String(enAnios ? Math.floor(m / 12) : m) })),
    x_titulo: enAnios ? "Años" : "Meses",
    nominal: linea("nominal"), real: linea("real"), aportado: linea("aportado"), efectivo: linea("efectivo_real"),
    etiquetas, hover, meses_tabla: [...new Set([...ms, meses])].sort((a, b) => a - b),
    recorrido: puntos.map((p) => ({ mes: p.mes, x: X(p.mes),
      y: { nominal: Y(p.nominal), real: Y(p.real), aportado: Y(p.aportado), efectivo_real: Y(p.efectivo_real) },
      v: { nominal: p.nominal, real: p.real, aportado: p.aportado, efectivo_real: p.efectivo_real } })),
  };
}
