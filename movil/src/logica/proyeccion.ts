/** Proyección de un instrumento elegido: trayectoria mensual, textos de resumen y datos del gráfico (port de proyeccion.py). */
import { clp, fijo, pctTxt } from "./formatos";
import { construirGrafico, WEB, type Grafico, type Medidas } from "./graficos";
import { aporteMinimo, sinInvertir, trayectoria, type Instrumento, type SinInvertir } from "./instrumentos";
import { mesesTxt } from "./recomendador";

function aniosTxt(meses: number): string {
  return fijo(meses / 12, 2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
}

export interface FilaTabla { periodo: string; mes: number; aportado: string; efectivo: string; nominal: string; real: string }
export interface Proyeccion {
  inst: Instrumento; grafico: Grafico; tabla: FilaTabla[]; resumen: string; poder_compra: string; formula: string;
  bono_txt: string; aporte: number; aporte_txt: string; sin_invertir: SinInvertir; meses: number; inflacion: number;
  nominal: number; real: number; gana: boolean;
}

export function armarProyeccion(inst: Instrumento, monto: number, meses: number, inflacion: number, aporte = 0, medidas: Medidas = WEB): Proyeccion {
  const apv = inst.apv ?? false;
  const minimo = aporteMinimo(inst);
  const puntos = trayectoria(monto, aporte, meses, inst.tasa, inflacion, apv, minimo);
  const ult = puntos.at(-1)!;
  const g = construirGrafico(puntos, medidas);

  const gananciaReal = ult.real - ult.aportado;
  const inicio = `Con ${clp(monto)}` + (aporte ? ` y aportes de ${clp(aporte)} al mes` : "");
  const resumen = `${inicio} en ${mesesTxt(meses)}, esta opción llegaría a unos ${clp(ult.nominal)}. ` +
    `Con una inflación de ${pctTxt(inflacion)}% anual, eso equivale a ${clp(ult.real)} en pesos de hoy.`;
  const poder = gananciaReal >= 0
    ? `En poder de compra ganarías unos ${clp(gananciaReal)}.`
    : `En poder de compra perderías unos ${clp(-gananciaReal)}: la inflación le gana a esta opción.`;

  const formula = aporte
    ? `cada mes el saldo gana ${fijo(inst.tasa, 2)}% anual (equivalente mensual compuesto) y se suma el aporte de ` +
      `${clp(aporte)} al final del mes; el resultado es ${clp(ult.nominal - ult.bono)}`
    : `${clp(monto)} × (1 + ${fijo(inst.tasa, 2)}%)^${aniosTxt(meses)} años = ${clp(ult.nominal - ult.bono)}`;
  let aporteTxt = "";
  if (aporte && minimo) {
    aporteTxt = "En un depósito a plazo no se puede agregar dinero a uno que ya está abierto. Por eso cada aporte se " +
      `modela como un depósito nuevo, a la misma tasa, que exige al menos ${clp(minimo)}.`;
    if (aporte < minimo)
      aporteTxt += ` Tu aporte es menor: se junta sin ganar interés (cada ${Math.ceil(minimo / aporte)} meses ` +
        `reúne el mínimo y recién ahí se deposita). Al final quedan ${clp(ult.sin_interes)} esperando.`;
    aporteTxt += " Si al vencer la tasa cambia, el resultado también cambiaría.";
  }
  let bonoTxt = "";
  if (apv)
    bonoTxt = meses >= 12
      ? `Cada salto anual incluye el bono del Estado (15% de lo aportado, con tope de 6 UTM). En total suma ${clp(ult.bono)}.`
      : "El bono del APV se suma al cumplir un año completo, así que en este plazo todavía no aparece.";
  const tabla = g.meses_tabla.map((m) => ({
    periodo: m === 0 ? "Hoy" : mesesTxt(m), mes: m, aportado: clp(puntos[m].aportado), efectivo: clp(puntos[m].efectivo_real),
    nominal: clp(puntos[m].nominal), real: clp(puntos[m].real),
  }));
  return { inst, grafico: g, tabla, resumen, poder_compra: poder, formula, bono_txt: bonoTxt, aporte, aporte_txt: aporteTxt,
    sin_invertir: sinInvertir(monto, aporte, meses, inflacion), meses, inflacion, nominal: ult.nominal, real: ult.real,
    gana: gananciaReal >= 0 };
}
