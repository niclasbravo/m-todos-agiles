/**
 * Catálogo de instrumentos y cálculo del simulador (port 1:1 de comparador/instruments.py).
 *
 * Todas las cifras son REFERENCIALES. Cada instrumento indica su fuente y el origen de su tasa (`tasa_origen`):
 *   - contratada: tasa publicada por la institución (DAP, cuenta vista).
 *   - promedio_3a: promedio anual (geométrico) de los últimos 3 años, a partir de la rentabilidad acumulada a 36 meses.
 *   - ficha_12m: rentabilidad nominal de los últimos 12 meses según la ficha del fondo. No garantizada.
 *   - supuesto: supuesto de largo plazo del equipo, sin dato verificado. No garantizado.
 */
import { clp, fijo, pctTxt } from "./formatos";

export const TPM = 4.5; // % anual. Banco Central, reunión del 27-oct-2026.
export const UTM = 72_440; // CLP. Valor de noviembre de 2026.
export const INFLACION_DEFECTO = 3.0;

export const BONO_APV_PORCENTAJE = 0.15; // APV régimen A: el Estado bonifica 15% de lo aportado en el año...
export const TOPE_BONO_APV_UTM = 6; // ...con un tope de 6 UTM de bonificación por año.

export const RIESGO_TXT: Record<number, string> = { 1: "muy bajo", 2: "bajo", 3: "medio", 4: "medio-alto", 5: "alto" };
export type Origen = "contratada" | "promedio_3a" | "ficha_12m" | "supuesto";
export const ORIGEN_TXT: Record<Origen, string> = {
  contratada: "tasa publicada por la institución",
  promedio_3a: "promedio anual de los últimos 3 años, no garantizado",
  ficha_12m: "rentabilidad de los últimos 12 meses, no garantizada",
  supuesto: "supuesto de largo plazo, no garantizado",
};

/** Tasa efectiva anual (%) de una tasa mensual (%) que se reinvierte cada mes. */
export const anualDesdeMensual = (m: number) => ((1 + m / 100) ** 12 - 1) * 100;
/** Tasa efectiva anual (%) de una tasa nominal anual (%) que se paga cada mes. */
export const anualDesdeNominal = (n: number) => ((1 + n / 100 / 12) ** 12 - 1) * 100;
/** Promedio anual (%) a partir de una rentabilidad acumulada (%) en `anios` años. */
export const promedioAnual = (acumulada: number, anios = 3) => ((1 + acumulada / 100) ** (1 / anios) - 1) * 100;

export interface Instrumento {
  id: string;
  nombre: string;
  riesgo: number;
  monto_min: number;
  plazo_min_meses: number;
  rescate_dias: number;
  penaliza_retiro: boolean;
  garantia_estatal: boolean;
  exige_fondo_emergencia: boolean;
  deposito_nuevo_por_aporte?: boolean;
  apv?: boolean;
  rent_36m_acum?: number;
  rent_12m?: number;
  tasa: number;
  tasa_origen: Origen;
  liquidez: string;
  nota: string;
  fuente: string;
}

export const INSTRUMENTOS: Instrumento[] = [
  {
    id: "cuenta_vista_mas", nombre: "Cuenta Vista Más (Banco Consorcio)",
    riesgo: 1, monto_min: 0, plazo_min_meses: 0, rescate_dias: 0,
    penaliza_retiro: false, garantia_estatal: true, exige_fondo_emergencia: false,
    tasa: anualDesdeNominal(TPM + 0.5), tasa_origen: "contratada",
    liquidez: "inmediata",
    nota: "Paga TPM + 0,5% anual, con intereses mensuales. Requiere ser mayor de 18 años y tener presencia crediticia; " +
      "puede tener costo de mantención (UF 0,075 + IVA).",
    fuente: "Rankia, «Mejores cuentas de ahorro» (actualizada el 28-09-2026): TPM + 0,5% y costo de mantención. Confirmar en el banco",
  },
  {
    id: "dap_ripley_30", nombre: "DAP 30 días (Banco Ripley)",
    riesgo: 1, monto_min: 10_000, plazo_min_meses: 1, rescate_dias: 30,
    penaliza_retiro: false, garantia_estatal: true, exige_fondo_emergencia: false,
    deposito_nuevo_por_aporte: true,
    tasa: anualDesdeMensual(0.41), tasa_origen: "contratada",
    liquidez: "al vencimiento (30 días)",
    nota: "Tasa de 0,41% mensual, fija durante los 30 días. Se supone que se renueva a la misma tasa. " +
      "A un depósito ya abierto no se le puede sumar dinero: con aportes mensuales, cada aporte sería un depósito nuevo.",
    fuente: "tasas.cl (0,41% a 30 días, sin fecha visible; Chocale informó 0,40% el 22-09-2026). Monto mínimo de $10.000 según Rankia (feb-2026); tasas.cl muestra $50.000 sin precisar el plazo",
  },
  {
    id: "vision_money_market", nombre: "Visión Money Market (Principal AGF)",
    riesgo: 2, monto_min: 5_000, plazo_min_meses: 1, rescate_dias: 1,
    penaliza_retiro: false, garantia_estatal: false, exige_fondo_emergencia: false,
    rent_36m_acum: 14.23, rent_12m: 3.40, tasa: promedioAnual(14.23), tasa_origen: "promedio_3a",
    liquidez: "1 día (máximo 10 días corridos)",
    nota: "Deuda bancaria de corto plazo, riesgo bajo. Tasa: promedio anual de 3 años (14,23% acumulado a 36 meses; 3,40% en los últimos 12 meses), datos al 23-09-2026.",
    fuente: "Rankia, «Fondos mutuos Banco Falabella» (datos al 23-09-2026). No verificado contra Principal AGF ni la CMF",
  },
  {
    id: "progresion_deuda_lp", nombre: "Progresión Deuda Largo Plazo (Principal AGF)",
    riesgo: 3, monto_min: 5_000, plazo_min_meses: 6, rescate_dias: 10,
    penaliza_retiro: false, garantia_estatal: false, exige_fondo_emergencia: false,
    rent_36m_acum: 23.55, rent_12m: 4.68, tasa: promedioAnual(23.55), tasa_origen: "promedio_3a",
    liquidez: "hasta 10 días corridos",
    nota: "Renta fija de más plazo, riesgo medio. Su valor puede bajar si suben las tasas. Horizonte de 6 a 12 meses o más. " +
      "Tasa: promedio anual de 3 años (23,55% acumulado a 36 meses; 4,68% en los últimos 12 meses), datos al 23-09-2026.",
    fuente: "Rankia, «Fondos mutuos Banco Falabella» (datos al 23-09-2026). No verificado contra Principal AGF ni la CMF",
  },
  {
    id: "cartera_equilibrada", nombre: "Cartera Equilibrada (Principal AGF)",
    riesgo: 4, monto_min: 5_000, plazo_min_meses: 36, rescate_dias: 10,
    penaliza_retiro: false, garantia_estatal: false, exige_fondo_emergencia: false,
    rent_36m_acum: 37.79, rent_12m: 10.79, tasa: promedioAnual(37.79), tasa_origen: "promedio_3a",
    liquidez: "hasta 10 días corridos",
    nota: "Mezcla deuda y acciones, riesgo medio-alto. Pasará a llamarse Gestión Activa Moderado. " +
      "Tasa: promedio anual de 3 años (37,79% acumulado a 36 meses; 10,79% en los últimos 12 meses), datos al 23-09-2026. " +
      "Rentabilidad pasada no garantiza la futura: estos años pueden haber sido mejores que los próximos. " +
      "El plazo mínimo de 3 años es un supuesto del equipo.",
    fuente: "Rankia, «Fondos mutuos Banco Falabella» (datos al 23-09-2026). No verificado contra Principal AGF ni la CMF",
  },
  {
    id: "capitales_acciones_chilenas", nombre: "Capitales Acciones Chilenas (Principal AGF)",
    riesgo: 5, monto_min: 5_000, plazo_min_meses: 24, rescate_dias: 10,
    penaliza_retiro: false, garantia_estatal: false, exige_fondo_emergencia: false,
    rent_36m_acum: 59.83, rent_12m: 19.72, tasa: promedioAnual(59.83), tasa_origen: "promedio_3a",
    liquidez: "hasta 10 días corridos",
    nota: "Al menos 90% en acciones chilenas, riesgo alto. La ficha recomienda un horizonte mínimo de 2 años. " +
      "Tasa: promedio anual de 3 años (59,83% acumulado a 36 meses; 19,72% en los últimos 12 meses), datos al 23-09-2026. " +
      "Rentabilidad pasada no garantiza la futura: en renta variable un año puede ser muy distinto, incluso negativo.",
    fuente: "Rankia, «Fondos mutuos Banco Falabella» (datos al 23-09-2026); riesgo y horizonte de la ficha Principal AGF (31-08-2026). No verificado contra la CMF",
  },
  {
    id: "apv_a", nombre: "APV régimen A",
    riesgo: 4, monto_min: 5_000, plazo_min_meses: 60, rescate_dias: 10,
    penaliza_retiro: true, garantia_estatal: false, exige_fondo_emergencia: true, apv: true,
    tasa: 7.0, tasa_origen: "supuesto",
    liquidez: "puedes retirar, pero pierdes el bono (se restituye)",
    nota: "El Estado bonifica 15% de lo que aportes, con tope de 6 UTM por año. Se supone invertido en un fondo " +
      "balanceado. Es ahorro para la pensión: retirar antes devuelve el bono. Monto mínimo y plazo de 5 años son supuestos.",
    fuente: "Superintendencia de Pensiones y Rankia (bono 15%, tope 6 UTM); UTM de noviembre 2026 en calcular.cl. La rentabilidad (7%) no tiene fuente: es supuesto del equipo",
  },
];

/** Bonificación fiscal del régimen A: 15% de lo aportado en el año, con tope de 6 UTM. */
export function bonoApv(aporteAnual: number, utm = UTM): number {
  return Math.min(aporteAnual * BONO_APV_PORCENTAJE, TOPE_BONO_APV_UTM * utm);
}

/** Monto mínimo de cada aporte: solo aplica donde un aporte es un producto nuevo (depósito a plazo). */
export function aporteMinimo(inst: Instrumento): number {
  return inst.deposito_nuevo_por_aporte ? inst.monto_min : 0;
}

export interface Punto {
  mes: number;
  nominal: number;
  real: number;
  aportado: number;
  bono: number;
  sin_interes: number;
  efectivo_real: number;
}

/**
 * Valor mes a mes (del mes 0 al `meses`) con interés compuesto: sin aportes equivale a monto × (1 + tasa)^años.
 * Con apv, al cumplirse cada año se suma el bono del Estado sobre lo aportado ese año (el inicial cuenta en el primero).
 * Con aporteMin > 0 (depósito a plazo) cada aporte abre un depósito nuevo que exige ese mínimo: lo que no lo
 * alcanza se junta sin ganar interés hasta completarlo.
 */
export function trayectoria(inicial: number, aporte: number, meses: number, tasaAnual: number, inflacion: number,
  apv = false, aporteMin = 0): Punto[] {
  const i = (1 + tasaAnual / 100) ** (1 / 12) - 1;
  let saldo = inicial, aportado = inicial, aportesAnio = inicial;
  let pendiente = 0, bonoTotal = 0;
  const puntos: Punto[] = [{ mes: 0, nominal: saldo, real: saldo, aportado, bono: 0, sin_interes: 0, efectivo_real: saldo }];
  for (let mes = 1; mes <= meses; mes++) {
    saldo *= 1 + i;
    pendiente += aporte;
    if (pendiente >= aporteMin) {
      saldo += pendiente;
      pendiente = 0;
    }
    aportado += aporte;
    aportesAnio += aporte;
    if (apv && mes % 12 === 0) {
      const b = bonoApv(aportesAnio);
      saldo += b;
      bonoTotal += b;
      aportesAnio = 0;
    }
    const deflactor = (1 + inflacion / 100) ** (mes / 12);
    const nominal = saldo + pendiente;
    puntos.push({ mes, nominal, real: nominal / deflactor, aportado, bono: bonoTotal, sin_interes: pendiente,
      efectivo_real: aportado / deflactor });
  }
  return puntos;
}

export interface Simulacion { final: number; aportado: number; ganancia: number; real: number; bono: number; sin_interes: number }

export function simular(inicial: number, aporte: number, meses: number, tasaAnual: number, inflacion: number,
  apv = false, aporteMin = 0): Simulacion {
  const ult = trayectoria(inicial, aporte, meses, tasaAnual, inflacion, apv, aporteMin).at(-1)!;
  return { final: ult.nominal, aportado: ult.aportado, ganancia: ult.nominal - ult.aportado, real: ult.real,
    bono: ult.bono, sin_interes: ult.sin_interes };
}

export interface SinInvertir {
  final: number; real: number; perdida: number; pct_perdida: number;
  final_fmt: string; real_fmt: string; perdida_fmt: string; pct_perdida_txt: string; canasta_fmt: string;
  meses: number; inflacion: number; inflacion_txt: string; pct_real: string;
}

/** Qué pasa si la plata queda guardada (efectivo o cuenta sin intereses): el monto no cambia, pero compra menos. */
export function sinInvertir(inicial: number, aporte: number, meses: number, inflacion: number): SinInvertir {
  const ult = trayectoria(inicial, aporte, meses, 0, inflacion).at(-1)!;
  const anios = meses / 12;
  const encarece = 10_000 * (1 + inflacion / 100) ** anios;
  const perdida = ult.aportado - ult.real;
  const pct = ult.aportado ? perdida / ult.aportado * 100 : 0;
  return {
    final: ult.aportado, real: ult.real, perdida, pct_perdida: pct,
    final_fmt: clp(ult.aportado), real_fmt: clp(ult.real), perdida_fmt: clp(perdida), pct_perdida_txt: pctTxt(pct),
    canasta_fmt: clp(encarece), meses, inflacion, inflacion_txt: pctTxt(inflacion),
    pct_real: fijo(ult.aportado ? ult.real / ult.aportado * 100 : 100, 1),
  };
}

export interface Fila extends Instrumento, Simulacion {
  tasa_txt: string; riesgo_txt: string; origen_txt: string; monto_min_fmt: string;
  pct_aportado: string; pct_ganancia: string; pct_real: string;
  final_fmt: string; aportado_fmt: string; ganancia_fmt: string; real_fmt: string; bono_fmt: string; sin_interes_fmt: string;
}

export function comparar(inicial: number, aporte: number, meses: number, inflacion: number): Fila[] {
  const filas = INSTRUMENTOS.map((inst) => {
    const sim = simular(inicial, aporte, meses, inst.tasa, inflacion, inst.apv ?? false, aporteMinimo(inst));
    return { ...inst, ...sim, tasa_txt: pctTxt(inst.tasa), riesgo_txt: RIESGO_TXT[inst.riesgo],
      origen_txt: ORIGEN_TXT[inst.tasa_origen] } as Fila;
  });
  const maximo = Math.max(...filas.map((f) => f.final)) || 1;
  for (const f of filas) { // porcentajes como texto con punto, listos para usar en CSS
    f.monto_min_fmt = clp(f.monto_min);
    f.pct_aportado = fijo(f.aportado / maximo * 100, 1);
    f.pct_ganancia = fijo(f.ganancia / maximo * 100, 1);
    f.pct_real = fijo(Math.min(f.real / maximo * 100, 100), 1);
    f.final_fmt = clp(f.final); f.aportado_fmt = clp(f.aportado); f.ganancia_fmt = clp(f.ganancia);
    f.real_fmt = clp(f.real); f.bono_fmt = clp(f.bono); f.sin_interes_fmt = clp(f.sin_interes);
  }
  return filas;
}
