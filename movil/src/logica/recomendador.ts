/**
 * Perfil de usuario, matching con instrumentos y ranking de recomendaciones (port de comparador/recomendador.py).
 *
 * Flujo: perfil -> descartes (con motivo) -> puntaje -> hasta 3 recomendaciones con al menos 3 razones.
 * Es una orientación educativa basada en reglas simples y visibles. No es asesoría financiera.
 */
import { clp, pctTxt, redondear } from "./formatos";
import {
  INSTRUMENTOS, ORIGEN_TXT, RIESGO_TXT, TOPE_BONO_APV_UTM, UTM, bonoApv, simular,
  type Instrumento, type Simulacion,
} from "./instrumentos";

export type PlazoId = "menos_6m" | "6_12m" | "1_3a" | "3_5a" | "mas_5a";
export type Ingresos = "bajos" | "medios" | "altos";
export type Caida = "vender" | "esperar" | "aportar";
export type Colchon = "no" | "parcial" | "si";

/** Plazo: [id, texto, meses_max, meses_ref]. */
export const PLAZOS: [PlazoId, string, number, number][] = [
  ["menos_6m", "Menos de 6 meses", 6, 3],
  ["6_12m", "Entre 6 meses y 1 año", 12, 9],
  ["1_3a", "Entre 1 y 3 años", 36, 24],
  ["3_5a", "Entre 3 y 5 años", 60, 48],
  ["mas_5a", "Más de 5 años", 10 ** 6, 84],
];

export interface Pregunta { id: "ingresos" | "plazo" | "caida" | "colchon"; texto: string; opciones: [string, string][] }

export const PREGUNTAS: Pregunta[] = [
  { id: "ingresos", texto: "¿Cómo son tus ingresos hoy?", opciones: [
    ["bajos", "Bajos o variables (mesada, beca, trabajo part-time)"],
    ["medios", "Medios y bastante estables"],
    ["altos", "Holgados y estables"]] },
  { id: "plazo", texto: "¿En cuánto tiempo podrías necesitar este dinero?",
    opciones: PLAZOS.map(([pid, texto]) => [pid, texto]) },
  { id: "caida", texto: "Si tu inversión cayera 10% en un mes, ¿qué harías?", opciones: [
    ["vender", "Retiraría todo: no soporto perder plata"],
    ["esperar", "Esperaría a que se recupere"],
    ["aportar", "Aportaría más, porque está más barato"]] },
  { id: "colchon", texto: "¿Tienes ahorrado el equivalente a 3 meses de gastos para emergencias?", opciones: [
    ["no", "No"],
    ["parcial", "Tengo una parte"],
    ["si", "Sí"]] },
];

export const PLAZO_FRASE: Record<PlazoId, string> = {
  menos_6m: "en menos de 6 meses", "6_12m": "entre 6 meses y 1 año", "1_3a": "entre 1 y 3 años",
  "3_5a": "entre 3 y 5 años", mas_5a: "en más de 5 años",
};

export const TOLERANCIA_CAIDA: Record<Caida, number> = { vender: 2, esperar: 4, aportar: 5 };
export const CAPACIDAD_INGRESOS: Record<Ingresos, number> = { bajos: 3, medios: 4, altos: 5 };
export const RIESGO_IDEAL_PLAZO: Record<PlazoId, number> = { menos_6m: 1, "6_12m": 2, "1_3a": 3, "3_5a": 4, mas_5a: 5 };

export const PESOS = { normal: [0.35, 0.40, 0.25], sin_colchon: [0.25, 0.30, 0.45] } as const;
export const MAX_RECOMENDACIONES = 3;

export interface Respuestas { monto: number; ingresos: Ingresos; plazo: PlazoId; caida: Caida; colchon: Colchon }

export interface Perfil {
  nombre: "Conservador" | "Moderado" | "Agresivo"; riesgo_max: number; plazo_id: PlazoId; plazo_txt: string;
  meses_max: number; meses_ref: number; monto: number; monto_fmt: string; colchon: Colchon;
}

export function mesesTxt(m: number): string {
  if (m < 12 || m % 12) return m === 1 ? `${m} mes` : `${m} meses`;
  return m === 12 ? `${m / 12} año` : `${Math.floor(m / 12)} años`;
}

export function armarPerfil(r: Respuestas): Perfil {
  const riesgoMax = Math.min(TOLERANCIA_CAIDA[r.caida], CAPACIDAD_INGRESOS[r.ingresos]);
  const nombre = riesgoMax <= 2 ? "Conservador" : riesgoMax >= 5 ? "Agresivo" : "Moderado";
  const [, plazoTxt, mesesMax, mesesRef] = PLAZOS.find((p) => p[0] === r.plazo)!;
  return { nombre, riesgo_max: riesgoMax, plazo_id: r.plazo, plazo_txt: plazoTxt, meses_max: mesesMax,
    meses_ref: mesesRef, monto: r.monto, monto_fmt: clp(r.monto), colchon: r.colchon };
}

/** Motivos (en lenguaje simple) por los que un instrumento no corresponde. Vacía si es viable. */
export function motivosDescarte(inst: Instrumento, p: Perfil): string[] {
  const m: string[] = [];
  if (p.monto < inst.monto_min)
    m.push(`Pide un monto mínimo de ${clp(inst.monto_min)} y tú indicaste ${clp(p.monto)}.`);
  if (p.meses_max <= inst.plazo_min_meses)
    m.push(`Está pensado para mantenerlo al menos ${mesesTxt(inst.plazo_min_meses)} y tú podrías ` +
      `necesitar el dinero ${PLAZO_FRASE[p.plazo_id]}.`);
  if (inst.riesgo > p.riesgo_max)
    m.push(`Su riesgo es ${RIESGO_TXT[inst.riesgo]} y tu perfil tolera hasta riesgo ${RIESGO_TXT[p.riesgo_max]}.`);
  if (inst.exige_fondo_emergencia && p.colchon === "no")
    m.push("Es ahorro de largo plazo y retirar antes te hace perder el bono. Primero junta un fondo de " +
      "emergencia de unos 3 meses de gastos y luego vuelve a evaluarlo.");
  return m;
}

export function puntajeLiquidez(inst: Instrumento): number {
  if (inst.penaliza_retiro) return 15;
  const d = inst.rescate_dias;
  return d === 0 ? 100 : Math.max(20, 100 - 2 * d);
}

export function puntajeCalce(inst: Instrumento, p: Perfil): number {
  const ideal = Math.min(RIESGO_IDEAL_PLAZO[p.plazo_id], p.riesgo_max);
  return Math.max(0, 100 - 25 * Math.abs(inst.riesgo - ideal));
}

/** Resultado con el monto indicado y el plazo de referencia, más la tasa efectiva anualizada. */
export function proyectar(inst: Instrumento, p: Perfil): [Simulacion, number] {
  const meses = p.meses_ref;
  const sim = simular(p.monto, 0, meses, inst.tasa, 0, inst.apv ?? false);
  const efectiva = ((sim.final / p.monto) ** (12 / meses) - 1) * 100;
  return [sim, efectiva];
}

function razones(inst: Instrumento, p: Perfil, sim: Simulacion, efectiva: number, calce: number): string[] {
  const r = [`Rentabilidad referencial de ${pctTxt(efectiva)}% anual (${ORIGEN_TXT[inst.tasa_origen]}): ` +
    `con ${clp(p.monto)} en ${mesesTxt(p.meses_ref)} llegarías a unos ${clp(sim.final)}.`];
  if (inst.tasa_origen === "promedio_3a" && inst.riesgo >= 3) r[0] += " La rentabilidad pasada no garantiza la futura.";
  const riesgo = RIESGO_TXT[inst.riesgo];
  const plazo = p.plazo_txt.toLowerCase();
  if (calce >= 100) r.push(`Su riesgo (${riesgo}) calza bien con tu plazo (${plazo}) y con lo que toleras.`);
  else if (calce >= 75) r.push(`Su riesgo (${riesgo}) calza razonablemente con tu plazo (${plazo}) y está dentro de lo que toleras.`);
  else r.push(`Su riesgo (${riesgo}) se aleja de lo ideal para tu plazo (${plazo}), aunque está dentro de lo que toleras.`);
  r.push(`Liquidez: ${inst.liquidez}.`);
  r.push(inst.monto_min === 0 ? "No exige monto mínimo." : `Tu monto cubre el mínimo de ${clp(inst.monto_min)}.`);
  if (inst.apv)
    r.push(`El Estado bonifica 15% de lo que aportes, con tope de ${clp(TOPE_BONO_APV_UTM * UTM)} al año ` +
      `(${TOPE_BONO_APV_UTM} UTM): con tu monto serían ${clp(bonoApv(p.monto))} el primer año.`);
  else if (inst.garantia_estatal) r.push("Tiene garantía estatal sobre los depósitos.");
  else r.push("No tiene garantía estatal y su valor puede subir o bajar.");
  return r;
}

export interface Recomendacion {
  instrumento: Instrumento; puntaje: number;
  desglose: { rentabilidad: number; calce: number; liquidez: number };
  tasa_txt: string; final_fmt: string; razones: string[];
}
export interface Descartado { instrumento: Instrumento; motivos: string[] }
export interface ResultadoQuiz {
  perfil: Perfil; recomendaciones: Recomendacion[]; descartados: Descartado[]; otras_viables: string[]; notas: string[];
}

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function recomendar(resp: Respuestas): ResultadoQuiz {
  const perfil = armarPerfil(resp);
  type Viable = { instrumento: Instrumento; sim: Simulacion; efectiva: number; desglose?: Recomendacion["desglose"]; puntaje?: number; calce?: number };
  const viables: Viable[] = [], descartados: Descartado[] = [];
  for (const inst of INSTRUMENTOS) {
    const motivos = motivosDescarte(inst, perfil);
    if (motivos.length) descartados.push({ instrumento: inst, motivos });
    else {
      const [sim, efectiva] = proyectar(inst, perfil);
      viables.push({ instrumento: inst, sim, efectiva });
    }
  }
  const [pRent, pCalce, pLiq] = PESOS[perfil.colchon === "no" ? "sin_colchon" : "normal"];
  const mejorTasa = (viables.length ? Math.max(...viables.map((v) => v.efectiva)) : 0) || 1;
  for (const v of viables) {
    const rent = Math.max(0, v.efectiva) / mejorTasa * 100;
    const calce = puntajeCalce(v.instrumento, perfil), liq = puntajeLiquidez(v.instrumento);
    v.desglose = { rentabilidad: redondear(rent), calce: redondear(calce), liquidez: redondear(liq) };
    v.puntaje = redondear(pRent * rent + pCalce * calce + pLiq * liq);
    v.calce = calce;
  }
  // Desempate: más puntaje, luego menos riesgo.
  viables.sort((a, b) => (b.puntaje! - a.puntaje!) || (a.instrumento.riesgo - b.instrumento.riesgo) ||
    cmpStr(a.instrumento.nombre, b.instrumento.nombre));

  const recomendaciones = viables.slice(0, MAX_RECOMENDACIONES).map((v) => ({
    instrumento: v.instrumento, puntaje: v.puntaje!, desglose: v.desglose!,
    tasa_txt: pctTxt(v.efectiva), final_fmt: clp(v.sim.final),
    razones: razones(v.instrumento, perfil, v.sim, v.efectiva, v.calce!),
  }));
  const notas: string[] = [];
  if (perfil.colchon === "no")
    notas.push("Sin fondo de emergencia le dimos más peso a la liquidez. Antes de invertir, junta unos 3 meses " +
      "de gastos en algo de retiro rápido, como una cuenta vista o un fondo money market.");
  return { perfil, recomendaciones, descartados, otras_viables: viables.slice(MAX_RECOMENDACIONES).map((v) => v.instrumento.nombre), notas };
}
