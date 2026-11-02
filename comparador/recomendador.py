"""Perfil de usuario, matching con instrumentos y ranking de recomendaciones.

Flujo: perfil -> descartes (con motivo) -> puntaje -> hasta 3 recomendaciones con al menos 3 razones.
Es una orientación educativa basada en reglas simples y visibles. No es asesoría financiera.
"""
from .instruments import (INSTRUMENTOS, RIESGO_TXT, ORIGEN_TXT, TOPE_BONO_APV_UTM, UTM, bono_apv, clp,
                          pct_txt, simular)

# Plazo: (id, texto, meses_max, meses_ref).
#  - meses_max: lo máximo que podría mantener el dinero. Descarta productos cuyo plazo mínimo no cabe.
#  - meses_ref: plazo de referencia para proyectar el resultado.
PLAZOS = [
    ("menos_6m", "Menos de 6 meses", 6, 3),
    ("6_12m", "Entre 6 meses y 1 año", 12, 9),
    ("1_3a", "Entre 1 y 3 años", 36, 24),
    ("3_5a", "Entre 3 y 5 años", 60, 48),
    ("mas_5a", "Más de 5 años", 10 ** 6, 84),
]

PREGUNTAS = [
    {"id": "ingresos", "texto": "¿Cómo son tus ingresos hoy?", "opciones": [
        ("bajos", "Bajos o variables (mesada, beca, trabajo part-time)"),
        ("medios", "Medios y bastante estables"),
        ("altos", "Holgados y estables")]},
    {"id": "plazo", "texto": "¿En cuánto tiempo podrías necesitar este dinero?",
     "opciones": [(pid, texto) for pid, texto, _, _ in PLAZOS]},
    {"id": "caida", "texto": "Si tu inversión cayera 10% en un mes, ¿qué harías?", "opciones": [
        ("vender", "Retiraría todo: no soporto perder plata"),
        ("esperar", "Esperaría a que se recupere"),
        ("aportar", "Aportaría más, porque está más barato")]},
    {"id": "colchon", "texto": "¿Tienes ahorrado el equivalente a 3 meses de gastos para emergencias?", "opciones": [
        ("no", "No"),
        ("parcial", "Tengo una parte"),
        ("si", "Sí")]},
]

# Cómo se dice en una frase ("podrías necesitar el dinero ...").
PLAZO_FRASE = {"menos_6m": "en menos de 6 meses", "6_12m": "entre 6 meses y 1 año", "1_3a": "entre 1 y 3 años",
               "3_5a": "entre 3 y 5 años", "mas_5a": "en más de 5 años"}

# Riesgo máximo que tolera (1 a 5): el menor entre lo que dice que soporta y lo que le permiten sus ingresos.
TOLERANCIA_CAIDA = {"vender": 2, "esperar": 4, "aportar": 5}
CAPACIDAD_INGRESOS = {"bajos": 3, "medios": 4, "altos": 5}
# Riesgo ideal según el plazo: a más plazo, más riesgo es razonable.
RIESGO_IDEAL_PLAZO = {"menos_6m": 1, "6_12m": 2, "1_3a": 3, "3_5a": 4, "mas_5a": 5}

# Pesos del puntaje: (rentabilidad, calce de riesgo con el plazo, liquidez).
PESOS = {"normal": (0.35, 0.40, 0.25), "sin_colchon": (0.25, 0.30, 0.45)}
MAX_RECOMENDACIONES = 3


def meses_txt(m):
    if m < 12 or m % 12:
        return f"{m} mes" if m == 1 else f"{m} meses"
    return f"{m // 12} año" if m == 12 else f"{m // 12} años"


def armar_perfil(resp):
    riesgo_max = min(TOLERANCIA_CAIDA[resp["caida"]], CAPACIDAD_INGRESOS[resp["ingresos"]])
    nombre = "Conservador" if riesgo_max <= 2 else "Agresivo" if riesgo_max >= 5 else "Moderado"
    _, plazo_txt, meses_max, meses_ref = next(p for p in PLAZOS if p[0] == resp["plazo"])
    return {"nombre": nombre, "riesgo_max": riesgo_max, "plazo_id": resp["plazo"], "plazo_txt": plazo_txt,
            "meses_max": meses_max, "meses_ref": meses_ref, "monto": resp["monto"], "monto_fmt": clp(resp["monto"]),
            "colchon": resp["colchon"]}


def motivos_descarte(inst, perfil):
    """Lista de motivos (en lenguaje simple) por los que un instrumento no corresponde. Vacía si es viable."""
    m = []
    if perfil["monto"] < inst["monto_min"]:
        m.append(f"Pide un monto mínimo de {clp(inst['monto_min'])} y tú indicaste {clp(perfil['monto'])}.")
    if perfil["meses_max"] <= inst["plazo_min_meses"]:
        m.append(f"Está pensado para mantenerlo al menos {meses_txt(inst['plazo_min_meses'])} y tú podrías "
                 f"necesitar el dinero {PLAZO_FRASE[perfil['plazo_id']]}.")
    if inst["riesgo"] > perfil["riesgo_max"]:
        m.append(f"Su riesgo es {RIESGO_TXT[inst['riesgo']]} y tu perfil tolera hasta riesgo {RIESGO_TXT[perfil['riesgo_max']]}.")
    if inst.get("exige_fondo_emergencia") and perfil["colchon"] == "no":
        m.append("Es ahorro de largo plazo y retirar antes te hace perder el bono. Primero junta un fondo de "
                 "emergencia de unos 3 meses de gastos y luego vuelve a evaluarlo.")
    return m


def puntaje_liquidez(inst):
    if inst["penaliza_retiro"]:
        return 15
    d = inst["rescate_dias"]
    return 100 if d == 0 else max(20, 100 - 2 * d)


def puntaje_calce(inst, perfil):
    ideal = min(RIESGO_IDEAL_PLAZO[perfil["plazo_id"]], perfil["riesgo_max"])
    return max(0, 100 - 25 * abs(inst["riesgo"] - ideal))


def proyectar(inst, perfil):
    """Resultado con el monto indicado y el plazo de referencia, más la tasa efectiva anualizada."""
    meses = perfil["meses_ref"]
    sim = simular(perfil["monto"], 0, meses, inst["tasa"], 0, apv=inst.get("apv", False))
    efectiva = ((sim["final"] / perfil["monto"]) ** (12 / meses) - 1) * 100
    return sim, efectiva


def _razones(inst, perfil, sim, efectiva, calce):
    r = [f"Rentabilidad referencial de {pct_txt(efectiva)}% anual ({ORIGEN_TXT[inst['tasa_origen']]}): "
         f"con {clp(perfil['monto'])} en {meses_txt(perfil['meses_ref'])} llegarías a unos {clp(sim['final'])}."]
    riesgo = RIESGO_TXT[inst["riesgo"]]
    plazo = perfil["plazo_txt"].lower()
    if calce >= 100:
        r.append(f"Su riesgo ({riesgo}) calza bien con tu plazo ({plazo}) y con lo que toleras.")
    elif calce >= 75:
        r.append(f"Su riesgo ({riesgo}) calza razonablemente con tu plazo ({plazo}) y está dentro de lo que toleras.")
    else:
        r.append(f"Su riesgo ({riesgo}) se aleja de lo ideal para tu plazo ({plazo}), aunque está dentro de lo que toleras.")
    r.append(f"Liquidez: {inst['liquidez']}.")
    r.append("No exige monto mínimo." if inst["monto_min"] == 0 else f"Tu monto cubre el mínimo de {clp(inst['monto_min'])}.")
    if inst.get("apv"):
        r.append(f"El Estado bonifica 15% de lo que aportes, con tope de {clp(TOPE_BONO_APV_UTM * UTM)} al año "
                 f"({TOPE_BONO_APV_UTM} UTM): con tu monto serían {clp(bono_apv(perfil['monto']))} el primer año.")
    elif inst["garantia_estatal"]:
        r.append("Tiene garantía estatal sobre los depósitos.")
    else:
        r.append("No tiene garantía estatal y su valor puede subir o bajar.")
    return r


def recomendar(resp):
    """resp: {'monto', 'ingresos', 'plazo', 'caida', 'colchon'}.

    Devuelve el perfil, hasta 3 recomendaciones ordenadas (cada una con >= 3 razones), los instrumentos
    descartados con sus motivos y notas generales.
    """
    perfil = armar_perfil(resp)
    viables, descartados = [], []
    for inst in INSTRUMENTOS:
        motivos = motivos_descarte(inst, perfil)
        if motivos:
            descartados.append({"instrumento": inst, "motivos": motivos})
        else:
            sim, efectiva = proyectar(inst, perfil)
            viables.append({"instrumento": inst, "sim": sim, "efectiva": efectiva})

    p_rent, p_calce, p_liq = PESOS["sin_colchon" if perfil["colchon"] == "no" else "normal"]
    mejor_tasa = max((v["efectiva"] for v in viables), default=0) or 1
    for v in viables:
        inst = v["instrumento"]
        rent = max(0.0, v["efectiva"]) / mejor_tasa * 100
        calce, liq = puntaje_calce(inst, perfil), puntaje_liquidez(inst)
        v["desglose"] = {"rentabilidad": round(rent), "calce": round(calce), "liquidez": round(liq)}
        v["puntaje"] = round(p_rent * rent + p_calce * calce + p_liq * liq)
        v["_calce"] = calce
    # Desempate: más puntaje, luego menos riesgo.
    viables.sort(key=lambda v: (-v["puntaje"], v["instrumento"]["riesgo"], v["instrumento"]["nombre"]))

    recomendaciones = [{
        "instrumento": v["instrumento"], "puntaje": v["puntaje"], "desglose": v["desglose"],
        "tasa_txt": pct_txt(v["efectiva"]), "final_fmt": clp(v["sim"]["final"]),
        "razones": _razones(v["instrumento"], perfil, v["sim"], v["efectiva"], v["_calce"]),
    } for v in viables[:MAX_RECOMENDACIONES]]

    notas = []
    if perfil["colchon"] == "no":
        notas.append("Sin fondo de emergencia le dimos más peso a la liquidez. Antes de invertir, junta unos 3 meses "
                     "de gastos en algo de retiro rápido, como una cuenta vista o un fondo money market.")
    return {"perfil": perfil, "recomendaciones": recomendaciones, "descartados": descartados,
            "otras_viables": [v["instrumento"]["nombre"] for v in viables[MAX_RECOMENDACIONES:]], "notas": notas}
