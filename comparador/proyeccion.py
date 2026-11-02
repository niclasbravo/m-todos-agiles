"""Proyección de un instrumento elegido: trayectoria mensual, textos de resumen y datos del gráfico."""
from .graficos import construir_grafico
from math import ceil

from .instruments import aporte_minimo, clp, pct_txt, sin_invertir, trayectoria
from .recomendador import meses_txt


def _anios_txt(meses):
    return f"{meses / 12:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def armar_proyeccion(inst, monto, meses, inflacion, aporte=0):
    apv = inst.get("apv", False)
    minimo = aporte_minimo(inst)
    puntos = trayectoria(monto, aporte, meses, inst["tasa"], inflacion, apv=apv, aporte_min=minimo)
    ult = puntos[-1]
    g = construir_grafico(puntos)

    ganancia_real = ult["real"] - ult["aportado"]
    inicio = f"Con {clp(monto)}" + (f" y aportes de {clp(aporte)} al mes" if aporte else "")
    resumen = (f"{inicio} en {meses_txt(meses)}, esta opción llegaría a unos {clp(ult['nominal'])}. "
               f"Con una inflación de {pct_txt(inflacion)}% anual, eso equivale a {clp(ult['real'])} en pesos de hoy.")
    if ganancia_real >= 0:
        poder = f"En poder de compra ganarías unos {clp(ganancia_real)}."
    else:
        poder = f"En poder de compra perderías unos {clp(-ganancia_real)}: la inflación le gana a esta opción."

    if aporte:
        formula = (f"cada mes el saldo gana {inst['tasa']:.2f}% anual (equivalente mensual compuesto) y se suma el aporte de "
                   f"{clp(aporte)} al final del mes; el resultado es {clp(ult['nominal'] - ult['bono'])}")
    else:
        formula = f"{clp(monto)} × (1 + {inst['tasa']:.2f}%)^{_anios_txt(meses)} años = {clp(ult['nominal'] - ult['bono'])}"
    aporte_txt = ""
    if aporte and minimo:
        aporte_txt = ("En un depósito a plazo no se puede agregar dinero a uno que ya está abierto. Por eso cada aporte se "
                      f"modela como un depósito nuevo, a la misma tasa, que exige al menos {clp(minimo)}.")
        if aporte < minimo:
            aporte_txt += (f" Tu aporte es menor: se junta sin ganar interés (cada {ceil(minimo / aporte)} meses "
                           f"reúne el mínimo y recién ahí se deposita). Al final quedan {clp(ult['sin_interes'])} esperando.")
        aporte_txt += " Si al vencer la tasa cambia, el resultado también cambiaría."
    bono_txt = ""
    if apv:
        bono_txt = (f"Cada salto anual incluye el bono del Estado (15% de lo aportado, con tope de 6 UTM). "
                    f"En total suma {clp(ult['bono'])}." if meses >= 12 else
                    "El bono del APV se suma al cumplir un año completo, así que en este plazo todavía no aparece.")
    tabla = [{"periodo": "Hoy" if m == 0 else meses_txt(m), "aportado": clp(puntos[m]["aportado"]), "efectivo": clp(puntos[m]["efectivo_real"]),
              "nominal": clp(puntos[m]["nominal"]), "real": clp(puntos[m]["real"])} for m in g["meses_tabla"]]
    return {"inst": inst, "grafico": g, "tabla": tabla, "resumen": resumen, "poder_compra": poder,
            "formula": formula, "bono_txt": bono_txt, "aporte": aporte, "aporte_txt": aporte_txt,
            "sin_invertir": sin_invertir(monto, aporte, meses, inflacion), "meses": meses, "inflacion": inflacion,
            "nominal": ult["nominal"], "real": ult["real"]}
