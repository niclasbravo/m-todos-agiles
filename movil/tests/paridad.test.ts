/**
 * Paridad con la app web: compara la lógica TypeScript con las salidas reales de Python.
 * El archivo tests/paridad.json lo genera `python3 scripts/generar_paridad.py ..` (npm run paridad).
 * Si no existe, estas pruebas se omiten.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { barrio } from "../src/logica/escena";
import { INSTRUMENTOS, comparar, sinInvertir } from "../src/logica/instrumentos";
import { armarProyeccion } from "../src/logica/proyeccion";
import { recomendar, type Respuestas } from "../src/logica/recomendador";

const ruta = fileURLToPath(new URL("./paridad.json", import.meta.url));
const hay = existsSync(ruta);
const datos = hay ? JSON.parse(readFileSync(ruta, "utf-8")) : { simulador: [], quiz: [], proyeccion: [] };

/** Deja solo el id de cada instrumento, igual que el generador en Python. */
function sinInst(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sinInst);
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if ("id" in o && "fuente" in o) return { id: o.id };
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, sinInst(v)]));
  }
  return x;
}

/** Compara recursivamente: textos exactos, números con tolerancia relativa mínima. Devuelve la primera diferencia. */
function diferencia(py: unknown, ts: unknown, camino = "$"): string | null {
  if (typeof py === "number" && typeof ts === "number") {
    const tol = 1e-9 * Math.max(1, Math.abs(py));
    return Math.abs(py - ts) <= tol ? null : `${camino}: python=${py} ts=${ts}`;
  }
  if (Array.isArray(py)) {
    if (!Array.isArray(ts) || ts.length !== py.length) return `${camino}: largo python=${py.length} ts=${Array.isArray(ts) ? ts.length : typeof ts}`;
    for (let i = 0; i < py.length; i++) { const d = diferencia(py[i], ts[i], `${camino}[${i}]`); if (d) return d; }
    return null;
  }
  if (py && typeof py === "object") {
    if (!ts || typeof ts !== "object") return `${camino}: ts no es objeto`;
    for (const k of Object.keys(py)) {
      const d = diferencia((py as Record<string, unknown>)[k], (ts as Record<string, unknown>)[k], `${camino}.${k}`);
      if (d) return d;
    }
    return null;
  }
  if (typeof py === "boolean" && typeof ts === "boolean") return py === ts ? null : `${camino}: ${py} vs ${ts}`;
  return py === ts ? null : `${camino}: python=${JSON.stringify(py)} ts=${JSON.stringify(ts)}`;
}

describe.skipIf(!hay)("paridad con Python", () => {
  it(`simulador, sin invertir y escena 3D (${datos.simulador.length} casos)`, () => {
    for (const c of datos.simulador) {
      const { inicial, aporte, meses, inflacion } = c.entrada;
      const filas = comparar(inicial, aporte, meses, inflacion);
      expect(diferencia(c.filas, filas), JSON.stringify(c.entrada)).toBeNull();
      expect(diferencia(c.sin_invertir, sinInvertir(inicial, aporte, meses, inflacion)), JSON.stringify(c.entrada)).toBeNull();
      if (c.escena) expect(diferencia(c.escena, barrio(filas, c.entrada)), JSON.stringify(c.entrada)).toBeNull();
    }
  });

  it(`recomendador (${datos.quiz.length} perfiles)`, () => {
    for (const c of datos.quiz) {
      expect(diferencia(c.salida, sinInst(recomendar(c.entrada as Respuestas))), JSON.stringify(c.entrada)).toBeNull();
    }
  });

  it(`proyección y gráfico (${datos.proyeccion.length} casos)`, () => {
    for (const c of datos.proyeccion) {
      const inst = INSTRUMENTOS.find((i) => i.id === c.entrada.id)!;
      const p = armarProyeccion(inst, c.entrada.monto, c.entrada.meses, c.entrada.inflacion, c.entrada.aporte);
      expect(diferencia(c.salida, sinInst(p)), JSON.stringify(c.entrada)).toBeNull();
    }
  });
});
