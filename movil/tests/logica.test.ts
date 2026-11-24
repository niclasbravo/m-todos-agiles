/** Port de comparador/tests.py: las mismas reglas de negocio, probadas sobre la lógica TypeScript de la app móvil. */
import { describe, expect, it } from "vitest";
import { fijo, redondear } from "../src/logica/formatos";
import { ejesY, etiquetasEje } from "../src/logica/graficos";
import {
  INSTRUMENTOS, TOPE_BONO_APV_UTM, TPM, UTM, anualDesdeMensual, anualDesdeNominal, aporteMinimo, bonoApv, comparar,
  simular, sinInvertir, trayectoria,
} from "../src/logica/instrumentos";
import { armarProyeccion } from "../src/logica/proyeccion";
import { MAX_RECOMENDACIONES, PLAZOS, PREGUNTAS, recomendar, type Respuestas } from "../src/logica/recomendador";
import { validarAjuste, validarQuiz, validarSimulador } from "../src/logica/formularios";
import { barrio } from "../src/logica/escena";

const CONSERVADOR: Respuestas = { monto: 1_000_000, ingresos: "bajos", plazo: "6_12m", caida: "vender", colchon: "si" };
const AGRESIVO: Respuestas = { monto: 5_000_000, ingresos: "altos", plazo: "mas_5a", caida: "aportar", colchon: "si" };
const nombres = (l: { instrumento: { nombre: string } }[]) => l.map((x) => x.instrumento.nombre);
const descartes = (r: ReturnType<typeof recomendar>) => Object.fromEntries(r.descartados.map((x) => [x.instrumento.id, x.motivos.join(" ")]));
const inst = (id: string) => INSTRUMENTOS.find((i) => i.id === id)!;

describe("criterios de aceptación", () => {
  it("CA1 perfil conservador", () => {
    const r = recomendar(CONSERVADOR);
    expect(r.perfil.nombre).toBe("Conservador");
    expect(r.recomendaciones.length).toBeGreaterThan(0);
    r.recomendaciones.forEach((x) => expect(x.instrumento.riesgo).toBeLessThanOrEqual(2));
    expect(nombres(r.recomendaciones)).not.toContain("Capitales Acciones Chilenas (Principal AGF)");
  });
  it("CA2 perfil agresivo", () => {
    const r = recomendar(AGRESIVO);
    expect(r.perfil.nombre).toBe("Agresivo");
    expect(r.recomendaciones[0].instrumento.id).toBe("capitales_acciones_chilenas");
    expect(r.recomendaciones.some((x) => x.instrumento.riesgo >= 4)).toBe(true);
  });
  it("CA3 sin fondo de emergencia descarta el APV", () => {
    const r = recomendar({ ...AGRESIVO, colchon: "no" });
    expect(descartes(r).apv_a).toContain("fondo de emergencia");
    expect(nombres(r.recomendaciones)).not.toContain("APV régimen A");
    expect(r.notas.length).toBeGreaterThan(0);
    expect(descartes(recomendar(AGRESIVO)).apv_a).toBeUndefined();
  });
  it("CA4 monto bajo descarta por monto mínimo", () => {
    const r = recomendar({ ...CONSERVADOR, monto: 3_000 });
    const d = descartes(r);
    expect(d.dap_ripley_30).toContain("monto mínimo");
    expect(d.vision_money_market).toContain("monto mínimo");
    expect(nombres(r.recomendaciones)).toEqual(["Cuenta Vista Más (Banco Consorcio)"]);
  });
  it("CA5 cada descarte muestra su motivo", () => {
    const r = recomendar({ ...CONSERVADOR, plazo: "menos_6m", monto: 4_000, colchon: "no" });
    const d = descartes(r);
    expect(d.progresion_deuda_lp).toContain("al menos 6 meses");
    expect(d.progresion_deuda_lp).toContain("necesitar el dinero en menos de 6 meses");
    expect(descartes(recomendar({ ...CONSERVADOR, plazo: "1_3a" })).apv_a).toContain("necesitar el dinero entre 1 y 3 años");
    expect(d.capitales_acciones_chilenas).toContain("riesgo");
    expect(d.capitales_acciones_chilenas).toContain("al menos 2 años");
    expect(r.recomendaciones.length + r.descartados.length + r.otras_viables.length).toBe(INSTRUMENTOS.length);
  });
  it("CA6 máximo 3 recomendaciones con al menos 3 razones, en todas las combinaciones", () => {
    for (const ingresos of ["bajos", "medios", "altos"] as const)
      for (const [plazo] of PLAZOS)
        for (const caida of ["vender", "esperar", "aportar"] as const)
          for (const colchon of ["no", "parcial", "si"] as const)
            for (const monto of [3_000, 50_000, 5_000_000, 100_000_000]) {
              const recs = recomendar({ monto, ingresos, plazo, caida, colchon }).recomendaciones;
              expect(recs.length).toBeGreaterThanOrEqual(1);
              expect(recs.length).toBeLessThanOrEqual(MAX_RECOMENDACIONES);
              const p = recs.map((r) => r.puntaje);
              expect(p).toEqual([...p].sort((a, b) => b - a));
              recs.forEach((r) => expect(r.razones.length).toBeGreaterThanOrEqual(3));
            }
  });
  it("CA7 cálculo del bono APV", () => {
    expect(bonoApv(1_000_000)).toBe(150_000);
    expect(bonoApv(0)).toBe(0);
    expect(simular(1_000_000, 0, 12, 0, 0, true).bono).toBe(150_000);
    expect(simular(1_000_000, 0, 12, 0, 0, false).bono).toBe(0);
  });
  it("CA8 tope del bono APV en 6 UTM", () => {
    const tope = TOPE_BONO_APV_UTM * UTM;
    expect(tope).toBe(434_640);
    expect(bonoApv(10_000_000)).toBe(tope);
    expect(bonoApv(tope / 0.15)).toBeCloseTo(tope, 6);
    expect(bonoApv(tope / 0.15 - 1_000)).toBeLessThan(tope);
    expect(simular(10_000_000, 0, 12, 0, 0, true).bono).toBe(tope);
  });
});

describe("simulador", () => {
  it("el quiz ofrece 5 opciones de plazo", () => expect(PREGUNTAS.find((p) => p.id === "plazo")!.opciones).toHaveLength(5));
  it("interés compuesto de un año", () => expect(simular(1_000_000, 0, 12, 12, 0).final).toBeCloseTo(1_120_000, 0));
  it("aportes sin interés", () => { const r = simular(0, 100_000, 10, 0, 0); expect([r.final, r.ganancia]).toEqual([1_000_000, 0]); });
  it("catálogo con 7 instrumentos y bono visible", () => {
    const f = comparar(1_000_000, 0, 12, 3);
    expect(f).toHaveLength(7);
    expect(f.find((x) => x.id === "apv_a")!.bono).toBe(150_000);
  });
  it("la escena 3D termina en los mismos montos que las barras", () => {
    const filas = comparar(1_000_000, 100_000, 60, 3);
    const e = barrio(filas, { inicial: 1_000_000, aporte: 100_000, meses: 60, inflacion: 3 });
    expect([e.meses[0], e.meses.at(-1)]).toEqual([0, 60]);
    e.inst.forEach((x, i) => { expect(x.puntos.at(-1)![1]).toBe(redondear(filas[i].final)); expect(x.puntos.at(-1)![2]).toBe(redondear(filas[i].real)); });
  });
  it("fórmula monto × (1 + tasa)^n", () => {
    for (const [tasa, anios] of [[5, 2], [7.4, 3], [0, 5], [12.5, 7]])
      expect(simular(1_000_000, 0, anios * 12, tasa, 0).final).toBeCloseTo(1_000_000 * (1 + tasa / 100) ** anios, 4);
  });
  it("cuentas y depósitos usan la tasa actual; fondos el promedio de 3 años", () => {
    expect(inst("cuenta_vista_mas").tasa).toBeCloseTo(anualDesdeNominal(TPM + 0.5));
    expect(inst("dap_ripley_30").tasa).toBeCloseTo(anualDesdeMensual(0.41));
    for (const id of ["vision_money_market", "progresion_deuda_lp"]) {
      const f = inst(id);
      expect((1 + f.tasa / 100) ** 3).toBeCloseTo(1 + f.rent_36m_acum! / 100, 9);
    }
  });
  it("la trayectoria parte en el monto y el valor real descuenta la inflación", () => {
    const t = trayectoria(1_000_000, 0, 36, 5, 3);
    expect(t).toHaveLength(37);
    expect(t.at(-1)!.real).toBeCloseTo(t.at(-1)!.nominal / 1.03 ** 3, 4);
    expect(t.every((p) => p.real <= p.nominal)).toBe(true);
  });
  it("inflación mayor que la tasa hace perder poder de compra", () => {
    const p = armarProyeccion(inst("cuenta_vista_mas"), 1_000_000, 24, 10);
    expect(p.real).toBeLessThan(1_000_000);
    expect(p.poder_compra).toContain("perderías");
  });
});

describe("gráfico", () => {
  it("ejes con números redondos y etiquetas únicas", () => {
    const [lo, hi, m] = ejesY(5_000_000, 9_140_196);
    expect(lo).toBeLessThanOrEqual(5_000_000);
    expect(hi).toBeGreaterThanOrEqual(9_140_196);
    expect(new Set(etiquetasEje(m)).size).toBe(m.length);
    const [a, b] = ejesY(1_000_000, 1_000_000);
    expect(a).toBeLessThan(b);
  });
  it("cada línea tiene un punto por mes", () => {
    const g = armarProyeccion(inst("cuenta_vista_mas"), 2_000_000, 24, 3).grafico;
    for (const k of ["nominal", "real", "aportado"] as const) expect(g[k].split(" ")).toHaveLength(25);
  });
});

describe("sin invertir y aportes", () => {
  it("el monto no cambia pero compra menos", () => {
    const n = sinInvertir(1_000_000, 0, 24, 5);
    expect(n.final).toBe(1_000_000);
    expect(n.real).toBeCloseTo(1_000_000 / 1.05 ** 2, 2);
    expect(sinInvertir(500_000, 10_000, 12, 0).perdida).toBe(0);
  });
  it("solo el DAP exige mínimo por aporte y lo que no alcanza espera sin interés", () => {
    expect(aporteMinimo(inst("dap_ripley_30"))).toBe(10_000);
    expect(aporteMinimo(inst("cuenta_vista_mas"))).toBe(0);
    expect(trayectoria(0, 5_000, 4, 10, 3, false, 10_000).map((x) => x.sin_interes)).toEqual([0, 5_000, 0, 5_000, 0]);
    const py = armarProyeccion(inst("dap_ripley_30"), 100_000, 24, 3, 5_000);
    expect(py.aporte_txt).toContain("no se puede agregar dinero");
    expect(py.aporte_txt).toContain("Tu aporte es menor");
  });
});

describe("formularios (mensajes de Django es-CL)", () => {
  it("simulador", () => {
    expect(validarSimulador({ inicial: 0, aporte: 0, plazo: 5, unidad: "anios", inflacion: 3 })).toEqual({ ok: false, errores: { __all__: ["Ingresa un monto inicial o un aporte mensual."] } });
    expect(validarSimulador({ inicial: 1, aporte: 0, plazo: 41, unidad: "anios", inflacion: 3 })).toEqual({ ok: false, errores: { __all__: ["El plazo máximo es de 40 años."] } });
    const r = validarSimulador({ inicial: "-1", aporte: "x", plazo: "0", unidad: "z", inflacion: "31" });
    expect(r.ok ? null : r.errores).toEqual({
      inicial: ["Asegúrese de que este valor es mayor o igual a 0."], aporte: ["Introduzca un número entero."],
      plazo: ["Asegúrese de que este valor es mayor o igual a 1."], unidad: ["Escoja una opción válida. z no es una de las opciones disponibles."],
      inflacion: ["Asegúrese de que este valor es menor o igual a 30."],
    });
    const ok = validarSimulador({ inicial: "1.0", aporte: " 5 ", plazo: "5.00", unidad: "anios", inflacion: "3,5" });
    expect(ok.ok && ok.datos).toEqual({ inicial: 1, aporte: 5, plazo: 5, unidad: "anios", inflacion: 3.5, meses: 60 });
  });
  it("quiz y ajuste", () => {
    const q = validarQuiz({ monto: "abc" });
    expect(q.ok ? null : q.errores.monto).toEqual(["Ingresa solo números."]);
    expect(q.ok ? null : q.errores.plazo).toEqual(["Elige una opción."]);
    const a = validarAjuste({ inflacion: "abc", meses: "1.5", aporte: "" });
    expect(a.ok ? null : a.errores).toEqual({ inflacion: ["Ingresa un número."], meses: ["Ingresa meses completos."], aporte: ["Ingresa un aporte (puede ser 0)."] });
  });
  it("redondeo mitad al par como Python", () => {
    expect(fijo(2.25, 1)).toBe("2.2");
    expect(fijo(2.35, 1)).toBe("2.4"); // 2.35 en binario es 2.35000000000000008882
    expect(redondear(0.5)).toBe(0);
    expect(redondear(1.5)).toBe(2);
    expect(redondear(2.5)).toBe(2);
  });
});
