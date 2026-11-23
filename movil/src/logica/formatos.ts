/**
 * Formatos y redondeos idénticos a los de Python.
 *
 * Python redondea "mitad al par" sobre el valor binario exacto (format(x, ".2f"), round(x)).
 * `toFixed` de JavaScript redondea las mitades hacia arriba, así que 2,25 daría "2,3" en vez de "2,2".
 * Para que la app móvil muestre exactamente las mismas cifras que la web, se redondea a mano sobre
 * la expansión decimal exacta del número (toFixed(100) es exacto según la especificación).
 */

function redondearDecimal(x: number, d: number): { neg: boolean; entero: string; frac: string } {
  const neg = x < 0 || Object.is(x, -0);
  const exacto = Math.abs(x).toFixed(100);
  let [ent, fr] = exacto.split(".");
  const mantener = fr.slice(0, d);
  const resto = fr.slice(d);
  let digitos = (ent + mantener).split("").map(Number);
  const primero = resto.charCodeAt(0) - 48;
  const colaNoCero = /[1-9]/.test(resto.slice(1));
  const ultimo = digitos[digitos.length - 1];
  const subir = primero > 5 || (primero === 5 && (colaNoCero || ultimo % 2 === 1));
  if (subir) {
    let i = digitos.length - 1;
    while (i >= 0) {
      if (digitos[i] === 9) { digitos[i] = 0; i--; } else { digitos[i]++; break; }
    }
    if (i < 0) digitos = [1, ...digitos];
  }
  const s = digitos.join("");
  ent = s.slice(0, s.length - d).replace(/^0+(?=\d)/, "");
  fr = d ? s.slice(s.length - d) : "";
  return { neg, entero: ent || "0", frac: fr };
}

/** Equivale a f"{x:.{d}f}" de Python (punto decimal, sin separador de miles). */
export function fijo(x: number, d: number): string {
  if (!Number.isFinite(x)) return String(x);
  const r = redondearDecimal(x, d);
  return (r.neg ? "-" : "") + r.entero + (d ? "." + r.frac : "");
}

/** Equivale a round(x, d) de Python (d = 0 devuelve un entero). */
export function redondear(x: number, d = 0): number {
  return Number(fijo(x, d));
}

/** Equivale a f"{n:,.0f}" de Python, con punto como separador de miles. */
function miles(n: number): string {
  const r = redondearDecimal(n, 0);
  const ent = r.entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (r.neg ? "-" : "") + ent;
}

/** clp(1234567.4) → "$1.234.567" */
export function clp(n: number): string {
  return "$" + miles(n);
}

/** pct_txt(4.53) → "4,5" */
export function pctTxt(n: number): string {
  return fijo(n, 1).replace(".", ",");
}

/** Igual a str(x) de Python para floats/ints usados en textos de etiquetas ("3.0", "10"). */
export function strPy(x: number, esFloat: boolean): string {
  if (!esFloat) return String(Math.trunc(x));
  const s = String(x);
  return /[.e]/.test(s) ? s : s + ".0";
}

/** Formato corto que usa la escena 3D: "$1,2 M" o "$850 mil". (Es JS en la web, se copia tal cual.) */
export function corto(n: number): string {
  return n >= 1e6 ? "$" + (n / 1e6).toFixed(1).replace(".", ",") + " M"
    : "$" + Math.round(n / 1e3).toLocaleString("es-CL") + " mil";
}

/** Formato de la escena 3D: "$" + Math.round(n).toLocaleString("es-CL"). */
export function clpJs(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CL");
}
