"""Catálogo de instrumentos y cálculo del simulador.

Todas las cifras son REFERENCIALES y se editan aquí. Cada instrumento indica su fuente y el
origen de su tasa (`tasa_origen`):
  - contratada: tasa publicada por la institución (DAP, cuenta vista).
  - promedio_3a: promedio anual (geométrico) de los últimos 3 años, a partir de la rentabilidad acumulada a 36 meses de la ficha.
  - ficha_12m: rentabilidad nominal de los últimos 12 meses según la ficha del fondo. No garantizada.
  - supuesto: supuesto de largo plazo del equipo, sin dato verificado. No garantizado.
"""

TPM = 4.5          # % anual. Banco Central, reunión del 27-oct-2026.
UTM = 72_440       # CLP. Valor de noviembre de 2026.
INFLACION_DEFECTO = 3.0

BONO_APV_PORCENTAJE = 0.15   # APV régimen A: el Estado bonifica 15% de lo aportado en el año...
TOPE_BONO_APV_UTM = 6        # ...con un tope de 6 UTM de bonificación por año (aportes de ~40 UTM).

RIESGO_TXT = {1: "muy bajo", 2: "bajo", 3: "medio", 4: "medio-alto", 5: "alto"}
ORIGEN_TXT = {
    "contratada": "tasa publicada por la institución",
    "promedio_3a": "promedio anual de los últimos 3 años, no garantizado",
    "ficha_12m": "rentabilidad de los últimos 12 meses, no garantizada",
    "supuesto": "supuesto de largo plazo, no garantizado",
}


def anual_desde_mensual(m):
    """Tasa efectiva anual (%) de una tasa mensual (%) que se reinvierte cada mes."""
    return ((1 + m / 100) ** 12 - 1) * 100


def anual_desde_nominal(n):
    """Tasa efectiva anual (%) de una tasa nominal anual (%) que se paga cada mes."""
    return ((1 + n / 100 / 12) ** 12 - 1) * 100


def promedio_anual(acumulada_pct, anios=3):
    """Promedio anual (%) a partir de una rentabilidad acumulada (%) en `anios` años."""
    return ((1 + acumulada_pct / 100) ** (1 / anios) - 1) * 100


INSTRUMENTOS = [
    {"id": "cuenta_vista_mas", "nombre": "Cuenta Vista Más (Banco Consorcio)",
     "riesgo": 1, "monto_min": 0, "plazo_min_meses": 0, "rescate_dias": 0,
     "penaliza_retiro": False, "garantia_estatal": True, "exige_fondo_emergencia": False,
     "tasa": anual_desde_nominal(TPM + 0.5), "tasa_origen": "contratada",
     "liquidez": "inmediata",
     "nota": "Paga TPM + 0,5% anual, con intereses mensuales. Requiere ser mayor de 18 años y tener presencia crediticia; "
             "puede tener costo de mantención (UF 0,075 + IVA).",
     "fuente": "chocale.cl, marzo de 2025 (verificar condiciones actuales con el banco)"},
    {"id": "dap_ripley_30", "nombre": "DAP 30 días (Banco Ripley)",
     "riesgo": 1, "monto_min": 10_000, "plazo_min_meses": 1, "rescate_dias": 30,
     "penaliza_retiro": False, "garantia_estatal": True, "exige_fondo_emergencia": False,
     "deposito_nuevo_por_aporte": True,
     "tasa": anual_desde_mensual(0.42), "tasa_origen": "contratada",
     "liquidez": "al vencimiento (30 días)",
     "nota": "Tasa de 0,42% mensual, fija durante los 30 días. Se supone que se renueva a la misma tasa. "
             "A un depósito ya abierto no se le puede sumar dinero: con aportes mensuales, cada aporte sería un depósito nuevo.",
     "fuente": "Dato del equipo (Jira). Rankia (feb-2026) informa monto mínimo $10.000 y garantía estatal"},
    {"id": "vision_money_market", "nombre": "Visión Money Market (Principal AGF)",
     "riesgo": 2, "monto_min": 5_000, "plazo_min_meses": 1, "rescate_dias": 1,
     "penaliza_retiro": False, "garantia_estatal": False, "exige_fondo_emergencia": False,
     "rent_36m_acum": 14.96, "tasa": promedio_anual(14.96), "tasa_origen": "promedio_3a",
     "liquidez": "1 día (máximo 10 días corridos)",
     "nota": "Deuda bancaria de corto plazo, riesgo bajo. Tasa: promedio anual de 3 años (14,96% acumulado a 36 meses, serie Inversionista, ficha al 31-08-2026). "
             "La fila de la serie se infirió porque la tabla no está etiquetada.",
     "fuente": "Ficha Principal AGF (31-08-2026); monto mínimo serie Global según Rankia"},
    {"id": "progresion_deuda_lp", "nombre": "Progresión Deuda Largo Plazo (Principal AGF)",
     "riesgo": 3, "monto_min": 5_000, "plazo_min_meses": 6, "rescate_dias": 10,
     "penaliza_retiro": False, "garantia_estatal": False, "exige_fondo_emergencia": False,
     "rent_36m_acum": 23.97, "tasa": promedio_anual(23.97), "tasa_origen": "promedio_3a",
     "liquidez": "hasta 10 días corridos",
     "nota": "Renta fija de más plazo, riesgo medio. Su valor puede bajar si suben las tasas. Horizonte de 6 a 12 meses o más. "
             "Tasa: promedio anual de 3 años (23,97% acumulado a 36 meses, ficha al 31-08-2026).",
     "fuente": "Ficha Principal AGF (31-08-2026); monto mínimo serie Global según Rankia"},
    {"id": "cartera_equilibrada", "nombre": "Cartera Equilibrada (Principal AGF)",
     "riesgo": 4, "monto_min": 5_000, "plazo_min_meses": 36, "rescate_dias": 10,
     "penaliza_retiro": False, "garantia_estatal": False, "exige_fondo_emergencia": False,
     "tasa": 7.0, "tasa_origen": "supuesto",
     "liquidez": "hasta 10 días corridos",
     "nota": "Mezcla deuda y acciones, riesgo medio-alto. Pasará a llamarse Gestión Activa Moderado. "
             "El plazo mínimo de 3 años y la tasa son supuestos del equipo.",
     "fuente": "Rankia (monto mínimo y rescate) y carta de Principal sobre el reglamento; sin ficha de rentabilidad verificada"},
    {"id": "capitales_acciones_chilenas", "nombre": "Capitales Acciones Chilenas (Principal AGF)",
     "riesgo": 5, "monto_min": 5_000, "plazo_min_meses": 24, "rescate_dias": 10,
     "penaliza_retiro": False, "garantia_estatal": False, "exige_fondo_emergencia": False,
     # Sin dato confiable a 3 años: dos lecturas de la misma ficha dieron 12 meses de 3,47%-5,65% y de 24,11%.
     "tasa": 9.0, "tasa_origen": "supuesto",
     "liquidez": "hasta 10 días corridos",
     "nota": "Al menos 90% en acciones chilenas, riesgo alto. La ficha recomienda un horizonte mínimo de 2 años. "
             "La tasa es un supuesto de largo plazo: un año puede ser muy distinto.",
     "fuente": "Ficha Principal AGF (31-08-2026) para riesgo y horizonte; la tasa es supuesto del equipo"},
    {"id": "apv_a", "nombre": "APV régimen A",
     "riesgo": 4, "monto_min": 5_000, "plazo_min_meses": 60, "rescate_dias": 10,
     "penaliza_retiro": True, "garantia_estatal": False, "exige_fondo_emergencia": True, "apv": True,
     "tasa": 7.0, "tasa_origen": "supuesto",
     "liquidez": "puedes retirar, pero pierdes el bono (se restituye)",
     "nota": "El Estado bonifica 15% de lo que aportes, con tope de 6 UTM por año. Se supone invertido en un fondo "
             "balanceado. Es ahorro para la pensión: retirar antes devuelve el bono. Monto mínimo y plazo de 5 años son supuestos.",
     "fuente": "Guía de APV de Monedario (bono 15%, tope 6 UTM); UTM de noviembre 2026 en calcular.cl"},
]


def bono_apv(aporte_anual, utm=UTM):
    """Bonificación fiscal del régimen A: 15% de lo aportado en el año, con tope de 6 UTM."""
    return min(aporte_anual * BONO_APV_PORCENTAJE, TOPE_BONO_APV_UTM * utm)


def aporte_minimo(inst):
    """Monto mínimo de cada aporte: solo aplica donde un aporte es un producto nuevo (depósito a plazo)."""
    return inst["monto_min"] if inst.get("deposito_nuevo_por_aporte") else 0


def trayectoria(inicial, aporte, meses, tasa_anual, inflacion, apv=False, aporte_min=0):
    """Valor mes a mes (del mes 0 al `meses`) con interés compuesto: sin aportes equivale a monto x (1 + tasa)^años.

    Cada punto trae: nominal (con la rentabilidad), real (descontando la inflación, en pesos de hoy),
    aportado (lo que pone la persona), bono (bono APV acumulado), sin_interes (plata esperando
    a llegar al mínimo) y efectivo_real (lo mismo aportado, pero guardado sin invertir, en pesos de hoy).
    Con apv=True, al cumplirse cada año completo se suma el bono del Estado sobre lo aportado ese año
    (el monto inicial cuenta como aporte del primer año).
    Con aporte_min > 0 (depósito a plazo) cada aporte abre un depósito nuevo, que exige ese mínimo:
    lo que no lo alcanza se junta sin ganar interés hasta completarlo.
    """
    i = (1 + tasa_anual / 100) ** (1 / 12) - 1
    saldo = aportado = aportes_anio = float(inicial)
    pendiente = 0.0
    bono_total = 0.0
    puntos = [{"mes": 0, "nominal": saldo, "real": saldo, "aportado": aportado, "bono": 0.0,
               "sin_interes": 0.0, "efectivo_real": saldo}]
    for mes in range(1, meses + 1):
        saldo *= 1 + i
        pendiente += aporte
        if pendiente >= aporte_min:
            saldo += pendiente
            pendiente = 0.0
        aportado += aporte
        aportes_anio += aporte
        if apv and mes % 12 == 0:
            b = bono_apv(aportes_anio)
            saldo += b
            bono_total += b
            aportes_anio = 0.0
        deflactor = (1 + inflacion / 100) ** (mes / 12)
        nominal = saldo + pendiente
        puntos.append({"mes": mes, "nominal": nominal, "real": nominal / deflactor, "aportado": aportado,
                       "bono": bono_total, "sin_interes": pendiente, "efectivo_real": aportado / deflactor})
    return puntos


def simular(inicial, aporte, meses, tasa_anual, inflacion, apv=False, aporte_min=0):
    ult = trayectoria(inicial, aporte, meses, tasa_anual, inflacion, apv, aporte_min)[-1]
    return {"final": ult["nominal"], "aportado": ult["aportado"], "ganancia": ult["nominal"] - ult["aportado"],
            "real": ult["real"], "bono": ult["bono"], "sin_interes": ult["sin_interes"]}


def sin_invertir(inicial, aporte, meses, inflacion):
    """Qué pasa si la plata queda guardada (efectivo o cuenta sin intereses): el monto no cambia, pero compra menos."""
    ult = trayectoria(inicial, aporte, meses, 0, inflacion)[-1]
    anios = meses / 12
    encarece = 10_000 * (1 + inflacion / 100) ** anios
    perdida = ult["aportado"] - ult["real"]
    return {"final": ult["aportado"], "real": ult["real"], "perdida": perdida,
            "pct_perdida": perdida / ult["aportado"] * 100 if ult["aportado"] else 0.0,
            "final_fmt": clp(ult["aportado"]), "real_fmt": clp(ult["real"]), "perdida_fmt": clp(perdida),
            "pct_perdida_txt": pct_txt(perdida / ult["aportado"] * 100 if ult["aportado"] else 0.0),
            "canasta_fmt": clp(encarece), "meses": meses, "inflacion": inflacion, "inflacion_txt": pct_txt(inflacion),
            "pct_real": f"{ult['real'] / ult['aportado'] * 100 if ult['aportado'] else 100:.1f}"}


def clp(n):
    return "$" + f"{n:,.0f}".replace(",", ".")


def pct_txt(n):
    return f"{n:.1f}".replace(".", ",")


def comparar(inicial, aporte, meses, inflacion):
    filas = []
    for inst in INSTRUMENTOS:
        sim = simular(inicial, aporte, meses, inst["tasa"], inflacion, apv=inst.get("apv", False),
                      aporte_min=aporte_minimo(inst))
        filas.append({**inst, **sim, "tasa_txt": pct_txt(inst["tasa"]), "riesgo_txt": RIESGO_TXT[inst["riesgo"]],
                      "origen_txt": ORIGEN_TXT[inst["tasa_origen"]]})
    maximo = max(f["final"] for f in filas) or 1
    for f in filas:  # porcentajes como texto con punto, listos para usar en CSS
        f["monto_min_fmt"] = clp(f["monto_min"])
        f["pct_aportado"] = f"{f['aportado'] / maximo * 100:.1f}"
        f["pct_ganancia"] = f"{f['ganancia'] / maximo * 100:.1f}"
        f["pct_real"] = f"{min(f['real'] / maximo * 100, 100):.1f}"
        for k in ("final", "aportado", "ganancia", "real", "bono", "sin_interes"):
            f[k + "_fmt"] = clp(f[k])
    return filas
