/**
 * Validaciones de los formularios (port de comparador/forms.py), con los mismos mensajes que muestra Django en es-CL.
 * Única diferencia a propósito: en el teléfono se acepta la coma decimal en la inflación ("3,5").
 */
import { INFLACION_DEFECTO } from "./instrumentos";
import { PREGUNTAS, type Respuestas } from "./recomendador";

export type Errores = Record<string, string[]>; // "__all__" para errores generales
export type Entrada = Record<string, string | number | undefined | null>;

const OBLIGATORIO = "Este campo es obligatorio.";
const mayorIgual = (v: number) => `Asegúrese de que este valor es mayor o igual a ${v}.`;
const menorIgual = (v: number) => `Asegúrese de que este valor es menor o igual a ${v}.`;

interface MsjNum { required?: string; invalid?: string }

function entero(v: unknown, min: number, max: number, msj: MsjNum = {}): number | string {
  const s = v == null ? "" : String(v).trim();
  if (s === "") return msj.required ?? OBLIGATORIO;
  const limpio = s.replace(/\.0*$/, ""); // Django acepta "5.00" como 5
  if (!/^[+-]?\d+$/.test(limpio)) return msj.invalid ?? "Introduzca un número entero.";
  const n = Number(limpio);
  if (n < min) return mayorIgual(min);
  if (n > max) return menorIgual(max);
  return n;
}

function decimal(v: unknown, min: number, max: number, msj: MsjNum = {}): number | string {
  const s = v == null ? "" : String(v).trim().replace(",", ".");
  if (s === "") return msj.required ?? OBLIGATORIO;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return msj.invalid ?? "Introduzca un número.";
  const n = Number(s);
  if (!Number.isFinite(n)) return msj.invalid ?? "Introduzca un número.";
  if (n < min) return mayorIgual(min);
  if (n > max) return menorIgual(max);
  return n;
}

function eleccion(v: unknown, opciones: string[], msjRequerido = OBLIGATORIO): string | { error: string } {
  const s = v == null ? "" : String(v);
  if (s === "") return { error: msjRequerido };
  if (!opciones.includes(s)) return { error: `Escoja una opción válida. ${s} no es una de las opciones disponibles.` };
  return s;
}

export const SIM_DEFECTO = { inicial: 1_000_000, aporte: 100_000, plazo: 5, unidad: "anios", inflacion: INFLACION_DEFECTO };
export interface DatosSim { inicial: number; aporte: number; plazo: number; unidad: "anios" | "meses"; inflacion: number; meses: number }

export function validarSimulador(e: Entrada): { ok: true; datos: DatosSim } | { ok: false; errores: Errores } {
  const err: Errores = {};
  const put = (k: string, r: number | string) => { if (typeof r === "string") err[k] = [r]; return r as number; };
  const inicial = put("inicial", entero(e.inicial, 0, 10 ** 10));
  const aporte = put("aporte", entero(e.aporte, 0, 10 ** 9));
  const plazo = put("plazo", entero(e.plazo, 1, 480));
  const u = eleccion(e.unidad, ["anios", "meses"]);
  if (typeof u !== "string") err.unidad = [u.error];
  const inflacion = put("inflacion", decimal(e.inflacion, 0, 30));
  if (Object.keys(err).length) return { ok: false, errores: err };
  const unidad = u as "anios" | "meses";
  const meses = plazo * (unidad === "anios" ? 12 : 1);
  if (meses > 480) return { ok: false, errores: { __all__: ["El plazo máximo es de 40 años."] } };
  if (inicial === 0 && aporte === 0) return { ok: false, errores: { __all__: ["Ingresa un monto inicial o un aporte mensual."] } };
  return { ok: true, datos: { inicial, aporte, plazo, unidad, inflacion, meses } };
}

export function validarQuiz(e: Entrada): { ok: true; datos: Respuestas } | { ok: false; errores: Errores } {
  const err: Errores = {};
  const datos: Record<string, string | number> = {};
  for (const p of PREGUNTAS) {
    const r = eleccion(e[p.id], p.opciones.map(([v]) => v), "Elige una opción.");
    if (typeof r === "string") datos[p.id] = r; else err[p.id] = [r.error];
  }
  const monto = entero(e.monto, 1, 10 ** 10, { required: "Ingresa un monto.", invalid: "Ingresa solo números." });
  if (typeof monto === "string") err.monto = [monto]; else datos.monto = monto;
  if (Object.keys(err).length) return { ok: false, errores: err };
  return { ok: true, datos: datos as unknown as Respuestas };
}

export interface DatosAjuste { inflacion: number; meses: number; aporte: number }

export function validarAjuste(e: Entrada): { ok: true; datos: DatosAjuste } | { ok: false; errores: Errores } {
  const err: Errores = {};
  const inflacion = decimal(e.inflacion, 0, 30, { invalid: "Ingresa un número.", required: "Ingresa la inflación." });
  const meses = entero(e.meses, 1, 480, { invalid: "Ingresa meses completos.", required: "Ingresa el horizonte." });
  const aporte = entero(e.aporte, 0, 10 ** 9, { invalid: "Ingresa solo números.", required: "Ingresa un aporte (puede ser 0)." });
  if (typeof inflacion === "string") err.inflacion = [inflacion];
  if (typeof meses === "string") err.meses = [meses];
  if (typeof aporte === "string") err.aporte = [aporte];
  if (Object.keys(err).length) return { ok: false, errores: err };
  return { ok: true, datos: { inflacion: inflacion as number, meses: meses as number, aporte: aporte as number } };
}
