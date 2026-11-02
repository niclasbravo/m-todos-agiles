from itertools import product

from django.test import SimpleTestCase

from .graficos import etiquetas_eje, ejes_y
from .instruments import INSTRUMENTOS, aporte_minimo, sin_invertir, TOPE_BONO_APV_UTM, UTM, bono_apv, comparar, simular, trayectoria
from .proyeccion import armar_proyeccion
from .recomendador import MAX_RECOMENDACIONES, PLAZOS, PREGUNTAS, recomendar

CONSERVADOR = {"monto": 1_000_000, "ingresos": "bajos", "plazo": "6_12m", "caida": "vender", "colchon": "si"}
AGRESIVO = {"monto": 5_000_000, "ingresos": "altos", "plazo": "mas_5a", "caida": "aportar", "colchon": "si"}


def nombres(lista, clave="instrumento"):
    return [x[clave]["nombre"] for x in lista]


def ids_descartados(res):
    return {x["instrumento"]["id"]: x["motivos"] for x in res["descartados"]}


class CriteriosDeAceptacion(SimpleTestCase):
    """CA1 a CA8 del ranking de recomendaciones."""

    def test_ca1_perfil_conservador(self):
        res = recomendar(CONSERVADOR)
        self.assertEqual(res["perfil"]["nombre"], "Conservador")
        self.assertTrue(res["recomendaciones"])
        for r in res["recomendaciones"]:
            self.assertLessEqual(r["instrumento"]["riesgo"], 2)
        self.assertNotIn("Capitales Acciones Chilenas (Principal AGF)", nombres(res["recomendaciones"]))

    def test_ca2_perfil_agresivo(self):
        res = recomendar(AGRESIVO)
        self.assertEqual(res["perfil"]["nombre"], "Agresivo")
        self.assertEqual(res["recomendaciones"][0]["instrumento"]["id"], "capitales_acciones_chilenas")
        self.assertTrue(any(r["instrumento"]["riesgo"] >= 4 for r in res["recomendaciones"]))

    def test_ca3_sin_fondo_de_emergencia_descarta_apv(self):
        res = recomendar({**AGRESIVO, "colchon": "no"})
        self.assertIn("apv_a", ids_descartados(res))
        self.assertIn("fondo de emergencia", " ".join(ids_descartados(res)["apv_a"]))
        self.assertNotIn("APV régimen A", nombres(res["recomendaciones"]))
        self.assertTrue(res["notas"])
        # Con fondo de emergencia el mismo perfil sí puede recibir el APV.
        self.assertNotIn("apv_a", ids_descartados(recomendar(AGRESIVO)))

    def test_ca4_monto_bajo_descarta_por_monto_minimo(self):
        res = recomendar({**CONSERVADOR, "monto": 3_000})
        d = ids_descartados(res)
        self.assertIn("dap_ripley_30", d)
        self.assertIn("vision_money_market", d)
        self.assertTrue(all("monto mínimo" in " ".join(d[i]) for i in ("dap_ripley_30", "vision_money_market")))
        self.assertEqual(nombres(res["recomendaciones"]), ["Cuenta Vista Más (Banco Consorcio)"])

    def test_ca5_cada_descarte_muestra_su_motivo(self):
        res = recomendar({**CONSERVADOR, "plazo": "menos_6m", "monto": 4_000, "colchon": "no"})
        d = ids_descartados(res)
        self.assertTrue(d)
        for motivos in d.values():
            self.assertTrue(motivos and all(m.strip() for m in motivos))
        self.assertIn("al menos 6 meses", " ".join(d["progresion_deuda_lp"]))
        self.assertIn("necesitar el dinero en menos de 6 meses", " ".join(d["progresion_deuda_lp"]))
        d13 = ids_descartados(recomendar({**CONSERVADOR, "plazo": "1_3a"}))
        self.assertIn("necesitar el dinero entre 1 y 3 años", " ".join(d13["apv_a"]))  # sin "en entre"
        self.assertIn("riesgo", " ".join(d["capitales_acciones_chilenas"]))
        self.assertIn("monto mínimo", " ".join(d["dap_ripley_30"]))
        self.assertIn("al menos 2 años", " ".join(d["capitales_acciones_chilenas"]))
        # Todo instrumento queda como recomendado, descartado u otra opción viable.
        total = len(res["recomendaciones"]) + len(res["descartados"]) + len(res["otras_viables"])
        self.assertEqual(total, len(INSTRUMENTOS))

    def test_ca6_maximo_3_recomendaciones_con_al_menos_3_razones(self):
        combos = product(("bajos", "medios", "altos"), [p[0] for p in PLAZOS], ("vender", "esperar", "aportar"),
                         ("no", "parcial", "si"), (3_000, 50_000, 5_000_000, 100_000_000))
        for ingresos, plazo, caida, colchon, monto in combos:
            res = recomendar({"monto": monto, "ingresos": ingresos, "plazo": plazo, "caida": caida, "colchon": colchon})
            recs = res["recomendaciones"]
            self.assertTrue(1 <= len(recs) <= MAX_RECOMENDACIONES, (ingresos, plazo, caida, colchon, monto))
            self.assertEqual([r["puntaje"] for r in recs], sorted((r["puntaje"] for r in recs), reverse=True))
            for r in recs:
                self.assertGreaterEqual(len(r["razones"]), 3)
                self.assertTrue(all(t.strip() for t in r["razones"]))

    def test_ca7_calculo_del_bono_apv(self):
        self.assertEqual(bono_apv(1_000_000), 150_000)
        self.assertEqual(bono_apv(0), 0)
        # El bono se suma al saldo del APV al cumplir el año y no existe en otros instrumentos.
        con = simular(1_000_000, 0, 12, 0, 0, apv=True)
        sin = simular(1_000_000, 0, 12, 0, 0, apv=False)
        self.assertEqual(con["bono"], 150_000)
        self.assertEqual(con["final"] - sin["final"], 150_000)
        self.assertEqual(sin["bono"], 0)

    def test_ca8_tope_del_bono_apv_en_6_utm(self):
        tope = TOPE_BONO_APV_UTM * UTM
        self.assertEqual(tope, 434_640)
        self.assertEqual(bono_apv(10_000_000), tope)
        self.assertEqual(bono_apv(tope / 0.15), tope)          # justo en el límite (~40 UTM aportadas)
        self.assertLess(bono_apv(tope / 0.15 - 1_000), tope)   # bajo el límite sigue siendo 15%
        con = simular(10_000_000, 0, 12, 0, 0, apv=True)
        self.assertEqual(con["bono"], tope)


class Plazos(SimpleTestCase):
    def test_el_quiz_ofrece_5_opciones_de_plazo(self):
        plazo = next(p for p in PREGUNTAS if p["id"] == "plazo")
        self.assertEqual(len(plazo["opciones"]), 5)


class Simulador(SimpleTestCase):
    def test_interes_compuesto_un_anio(self):
        self.assertAlmostEqual(simular(1_000_000, 0, 12, 12.0, 0)["final"], 1_120_000, places=0)

    def test_aportes_sin_interes(self):
        r = simular(0, 100_000, 10, 0, 0)
        self.assertEqual((r["final"], r["ganancia"]), (1_000_000, 0))

    def test_catalogo_incluye_los_7_instrumentos(self):
        self.assertEqual(len(comparar(1_000_000, 0, 12, 3)), 7)

    def test_apv_muestra_el_bono_en_la_comparacion(self):
        apv = next(f for f in comparar(1_000_000, 0, 12, 3) if f["id"] == "apv_a")
        self.assertEqual(apv["bono"], 150_000)

    def test_pagina_carga_con_valores_por_defecto(self):
        self.assertContains(self.client.get("/"), "Cuenta Vista Más")

    def test_sin_montos_muestra_error(self):
        r = self.client.get("/", {"inicial": 0, "aporte": 0, "plazo": 5, "unidad": "anios", "inflacion": 3})
        self.assertContains(r, "Ingresa un monto inicial")

    def test_simulador_destaca_varias_opciones_recomendadas(self):
        r = self.client.get("/?destacar=APV%20r%C3%A9gimen%20A&destacar=Cuenta%20Vista%20M%C3%A1s%20(Banco%20Consorcio)")
        self.assertContains(r, "Recomendada para ti", count=2)


class Quiz(SimpleTestCase):
    RESP = {"monto": 3000000, "ingresos": "bajos", "plazo": "1_3a", "caida": "vender", "colchon": "no"}

    def test_el_formulario_muestra_las_5_opciones_de_plazo(self):
        r = self.client.get("/recomendador/")
        for texto in ("Menos de 6 meses", "Entre 6 meses y 1 año", "Entre 1 y 3 años", "Entre 3 y 5 años", "Más de 5 años"):
            self.assertContains(r, texto)

    def test_resultado_muestra_razones_y_descartes_con_motivo(self):
        r = self.client.get("/recomendador/", self.RESP)
        self.assertContains(r, "Opciones que descartamos y por qué")
        self.assertContains(r, "fondo de emergencia")
        self.assertContains(r, 'id="respuestas"')  # datos para guardar el perfil en el navegador
        self.assertContains(r, "$3.000.000")

    def test_quiz_incompleto_pide_responder(self):
        self.assertContains(self.client.get("/recomendador/", {"monto": 1000}), "Elige una opción.")

    def test_monto_invalido(self):
        r = self.client.get("/recomendador/", {**self.RESP, "monto": "abc"})
        self.assertContains(r, "Ingresa solo números.")

    def test_el_servidor_no_guarda_el_perfil(self):
        r = self.client.get("/recomendador/", self.RESP)
        self.assertFalse(r.cookies)  # sin cookies ni sesión: el perfil solo vive en el navegador


class CalculoDeProyeccion(SimpleTestCase):
    """SCRUM-23: interés compuesto, tasas por tipo de instrumento y bono APV."""

    def test_formula_del_ticket_monto_por_1_mas_tasa_a_la_n(self):
        for tasa, anios in ((5.0, 2), (7.4, 3), (0.0, 5), (12.5, 7)):
            r = simular(1_000_000, 0, anios * 12, tasa, 0)
            self.assertAlmostEqual(r["final"], 1_000_000 * (1 + tasa / 100) ** anios, places=4)

    def test_cuentas_y_depositos_usan_la_tasa_actual(self):
        from .instruments import TPM, anual_desde_mensual, anual_desde_nominal
        cat = {i["id"]: i for i in INSTRUMENTOS}
        self.assertAlmostEqual(cat["cuenta_vista_mas"]["tasa"], anual_desde_nominal(TPM + 0.5))
        self.assertAlmostEqual(cat["dap_ripley_30"]["tasa"], anual_desde_mensual(0.42))
        self.assertEqual(cat["cuenta_vista_mas"]["tasa_origen"], "contratada")
        self.assertEqual(cat["dap_ripley_30"]["tasa_origen"], "contratada")

    def test_fondos_con_ficha_usan_el_promedio_anual_de_3_anios(self):
        cat = {i["id"]: i for i in INSTRUMENTOS}
        for id_ in ("vision_money_market", "progresion_deuda_lp"):
            f = cat[id_]
            self.assertEqual(f["tasa_origen"], "promedio_3a")
            self.assertAlmostEqual((1 + f["tasa"] / 100) ** 3, 1 + f["rent_36m_acum"] / 100, places=9)

    def test_trayectoria_parte_en_el_monto_y_termina_donde_simular(self):
        t = trayectoria(1_000_000, 0, 24, 6.0, 3.0)
        self.assertEqual(len(t), 25)
        self.assertEqual((t[0]["nominal"], t[0]["real"], t[0]["aportado"]), (1_000_000, 1_000_000, 1_000_000))
        s = simular(1_000_000, 0, 24, 6.0, 3.0)
        self.assertAlmostEqual(t[-1]["nominal"], s["final"])
        self.assertAlmostEqual(t[-1]["real"], s["real"])

    def test_el_valor_real_descuenta_la_inflacion(self):
        t = trayectoria(1_000_000, 0, 36, 5.0, 3.0)
        self.assertAlmostEqual(t[-1]["real"], t[-1]["nominal"] / 1.03 ** 3, places=4)
        self.assertTrue(all(p["real"] <= p["nominal"] for p in t))
        sin = trayectoria(1_000_000, 0, 36, 5.0, 0.0)
        self.assertTrue(all(abs(p["real"] - p["nominal"]) < 1e-6 for p in sin))
        mas = trayectoria(1_000_000, 0, 36, 5.0, 8.0)
        self.assertLess(mas[-1]["real"], t[-1]["real"])

    def test_la_inflacion_mayor_que_la_tasa_hace_perder_poder_de_compra(self):
        cuenta = next(i for i in INSTRUMENTOS if i["id"] == "cuenta_vista_mas")
        p = armar_proyeccion(cuenta, 1_000_000, 24, 10.0)
        self.assertLess(p["real"], 1_000_000)
        self.assertIn("perderías", p["poder_compra"])


class Grafico(SimpleTestCase):
    def test_ejes_cubren_el_rango_con_numeros_redondos(self):
        lo, hi, marcas = ejes_y(5_000_000, 9_140_196)
        self.assertLessEqual(lo, 5_000_000)
        self.assertGreaterEqual(hi, 9_140_196)
        self.assertEqual(marcas[0], lo)
        self.assertEqual(marcas[-1], hi)
        self.assertEqual(len(set(etiquetas_eje(marcas))), len(marcas))  # etiquetas sin repetirse

    def test_ejes_con_valores_iguales_no_se_rompen(self):
        lo, hi, marcas = ejes_y(1_000_000, 1_000_000)
        self.assertLess(lo, hi)

    def test_las_tres_lineas_tienen_un_punto_por_mes(self):
        cuenta = next(i for i in INSTRUMENTOS if i["id"] == "cuenta_vista_mas")
        g = armar_proyeccion(cuenta, 2_000_000, 24, 3.0)["grafico"]
        for k in ("nominal", "real", "aportado"):
            self.assertEqual(len(g[k].split()), 25)
        self.assertNotIn(",", g["nominal"].split()[0].replace(",", "", 1))  # x,y: un solo separador

    def test_las_etiquetas_finales_no_se_encinan(self):
        cuenta = next(i for i in INSTRUMENTOS if i["id"] == "cuenta_vista_mas")
        for infl in (0.0, 3.0, 5.0, 12.0):  # con inflación 0 el real y lo nominal coinciden
            ys = sorted(float(e["y"]) for e in armar_proyeccion(cuenta, 1_000_000, 12, infl)["grafico"]["etiquetas"])
            self.assertTrue(all(b - a >= 15.9 for a, b in zip(ys, ys[1:])), (infl, ys))

    def test_apv_muestra_el_salto_del_bono_en_el_mes_12(self):
        apv = next(i for i in INSTRUMENTOS if i["id"] == "apv_a")
        t = trayectoria(2_000_000, 0, 24, 7.0, 3.0, apv=True)
        self.assertGreater(t[12]["nominal"] - t[11]["nominal"], 300_000)  # 15% de 2.000.000 = 300.000
        p = armar_proyeccion(apv, 2_000_000, 24, 3.0)
        self.assertIn("bono del Estado", p["bono_txt"])
        self.assertIn("todavía no aparece", armar_proyeccion(apv, 2_000_000, 6, 3.0)["bono_txt"])


class VistaProyeccion(SimpleTestCase):
    RESP = {"monto": 3000000, "ingresos": "bajos", "plazo": "1_3a", "caida": "vender", "colchon": "no"}

    def test_cada_recomendacion_ofrece_ver_su_proyeccion(self):
        r = self.client.get("/recomendador/", self.RESP)
        n = len(recomendar(self.RESP)["recomendaciones"])
        self.assertContains(r, 'class="btn sec"', count=n)
        self.assertContains(r, "Elige «Ver proyección de esta opción»")  # aún sin elegir
        self.assertNotContains(r, "<svg")

    def test_elegir_una_opcion_muestra_el_grafico_con_la_linea_roja(self):
        r = self.client.get("/recomendador/", {**self.RESP, "ver": "cuenta_vista_mas"})
        self.assertContains(r, "Proyección preliminar: Cuenta Vista Más")
        self.assertContains(r, 'class="l l-real"')
        self.assertContains(r, 'class="l l-nom"')
        self.assertContains(r, "Descontando la inflación")
        self.assertContains(r, "Viendo la proyección", count=1)
        self.assertContains(r, "Ver los datos del gráfico")

    def test_opcion_no_recomendada_no_se_proyecta(self):
        r = self.client.get("/recomendador/", {**self.RESP, "ver": "capitales_acciones_chilenas"})
        self.assertNotContains(r, "<svg")

    def test_la_inflacion_ajustable_cambia_el_resultado(self):
        base = {**self.RESP, "ver": "cuenta_vista_mas"}
        a = self.client.get("/recomendador/", {**base, "inflacion": 1, "meses": 24}).content.decode()
        b = self.client.get("/recomendador/", {**base, "inflacion": 15, "meses": 24}).content.decode()
        self.assertIn("inflación de 1,0% anual", a)
        self.assertIn("inflación de 15,0% anual", b)
        self.assertIn("perderías", b)

    def test_ajuste_invalido_muestra_error_y_mantiene_el_grafico(self):
        r = self.client.get("/recomendador/", {**self.RESP, "ver": "cuenta_vista_mas", "inflacion": 99, "meses": 24})
        self.assertContains(r, "<svg")
        self.assertContains(r, "errorlist")


class SinInvertir(SimpleTestCase):
    def test_el_monto_no_cambia_pero_compra_menos(self):
        n = sin_invertir(1_000_000, 0, 24, 5)
        self.assertEqual(n["final"], 1_000_000)
        self.assertAlmostEqual(n["real"], 1_000_000 / 1.05 ** 2, places=2)
        self.assertGreater(n["perdida"], 0)

    def test_con_inflacion_cero_no_se_pierde_nada(self):
        self.assertEqual(sin_invertir(500_000, 10_000, 12, 0)["perdida"], 0)

    def test_la_linea_efectivo_va_bajo_la_linea_de_lo_que_pones(self):
        for p in trayectoria(1_000_000, 50_000, 36, 5, 4)[1:]:
            self.assertLess(p["efectivo_real"], p["aportado"])

    def test_aparece_en_el_simulador_y_en_el_quiz(self):
        r = self.client.get("/")
        self.assertContains(r, "¿Y si no lo pones en ninguna parte?")
        r = self.client.get("/recomendador/", {"ingresos": "medios", "plazo": "mas_5a", "caida": "esperar",
                                               "colchon": "si", "monto": 1_000_000})
        self.assertContains(r, "¿Y si no lo pones en ninguna parte?")


class AporteMensual(SimpleTestCase):
    DAP = next(i for i in INSTRUMENTOS if i["id"] == "dap_ripley_30")
    CV = next(i for i in INSTRUMENTOS if i["id"] == "cuenta_vista_mas")

    def test_solo_el_deposito_a_plazo_exige_minimo_por_aporte(self):
        self.assertEqual(aporte_minimo(self.DAP), 10_000)
        self.assertEqual(aporte_minimo(self.CV), 0)

    def test_aporte_bajo_el_minimo_espera_sin_ganar_interes(self):
        p = trayectoria(0, 5_000, 4, 10, 3, aporte_min=10_000)
        self.assertEqual([x["sin_interes"] for x in p], [0, 5_000, 0, 5_000, 0])
        self.assertEqual(p[1]["nominal"], 5_000)  # sin interés mientras espera

    def test_con_aporte_sobre_el_minimo_equivale_a_aportar_directo(self):
        a = trayectoria(100_000, 20_000, 24, 6, 3, aporte_min=10_000)[-1]["nominal"]
        b = trayectoria(100_000, 20_000, 24, 6, 3)[-1]["nominal"]
        self.assertAlmostEqual(a, b)

    def test_el_dap_rinde_menos_que_la_cuenta_cuando_el_aporte_no_alcanza(self):
        filas = {f["id"]: f for f in comparar(0, 4_000, 13, 3)}
        self.assertGreater(filas["dap_ripley_30"]["sin_interes"], 0)
        self.assertEqual(filas["cuenta_vista_mas"]["sin_interes"], 0)

    def test_la_proyeccion_explica_la_regla_del_dap(self):
        py = armar_proyeccion(self.DAP, 100_000, 24, 3, aporte=5_000)
        self.assertIn("no se puede agregar dinero", py["aporte_txt"])
        self.assertIn("Tu aporte es menor", py["aporte_txt"])
        self.assertEqual(armar_proyeccion(self.CV, 100_000, 24, 3, aporte=5_000)["aporte_txt"], "")

    def test_el_aporte_sube_el_resultado_y_se_ve_en_la_vista(self):
        resp = {"monto": 3000000, "ingresos": "bajos", "plazo": "1_3a", "caida": "vender", "colchon": "no"}
        self.assertIn("cuenta_vista_mas", [r["instrumento"]["id"] for r in recomendar(resp)["recomendaciones"]])
        a = armar_proyeccion(self.CV, 1_000_000, 24, 3, 0)["nominal"]
        b = armar_proyeccion(self.CV, 1_000_000, 24, 3, 50_000)["nominal"]
        self.assertGreater(b, a)
        r = self.client.get("/recomendador/", {**resp, "ver": "cuenta_vista_mas", "aporte": 50_000, "meses": 24})
        self.assertContains(r, "aportes de $50.000 al mes")
        self.assertContains(r, 'class="l l-efec"')
