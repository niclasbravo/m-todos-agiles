"""Geometría del gráfico de proyección (SVG). Se calcula en Python para poder probarla.

Todas las coordenadas salen como texto con punto decimal: la configuración regional es-CL usaría coma
al renderizar números en la plantilla y rompería los atributos del SVG.
"""
from math import ceil, floor, log10

from .instruments import clp

W, H = 600, 340
ML, MR, MT, MB = 62, 138, 14, 46   # márgenes: izquierda, derecha (etiquetas finales), arriba, abajo
PASOS_X = (1, 2, 3, 6, 12, 24, 36, 60, 120)


def _n(v):
    return f"{v:.1f}"


def _paso_bonito(rango, n):
    crudo = rango / n
    mag = 10 ** floor(log10(crudo))
    return next(m * mag for m in (1, 2, 2.5, 5, 10) if crudo <= m * mag * 1.0000001)


def ejes_y(vmin, vmax, n=4):
    """Devuelve (mínimo, máximo, marcas) con números redondos que cubren el rango."""
    if vmax - vmin < 1e-9 * max(1.0, vmax):
        vmin, vmax = (vmin * 0.9, vmax * 1.1) if vmax > 0 else (0.0, 1.0)
    paso = _paso_bonito(vmax - vmin, n)
    lo = max(0.0, floor(vmin / paso) * paso)
    hi = ceil(vmax / paso) * paso
    marcas = [lo + k * paso for k in range(int(round((hi - lo) / paso)) + 1)]
    return lo, hi, marcas


def etiquetas_eje(marcas):
    """Etiquetas cortas ($5,25 M, $800 mil) con los decimales justos para que no se repitan."""
    tope = max(marcas)
    base, suf = (1_000_000, " M") if tope >= 1_000_000 else (1_000, " mil") if tope >= 1_000 else (1, "")
    paso = (marcas[1] - marcas[0]) / base if len(marcas) > 1 else 1
    dec = 0
    while dec < 3 and abs(round(paso, dec) - paso) > 1e-9:
        dec += 1
    return ["$0" if m == 0 else f"${m / base:.{dec}f}".replace(".", ",") + suf for m in marcas]


def abrev_clp(n):
    if abs(n) >= 1_000_000:
        return f"${n / 1_000_000:.2f}".replace(".", ",") + " M"
    if abs(n) >= 1_000:
        return f"${n / 1_000:.0f} mil"
    return f"${n:.0f}"


def _separar(ys, hueco=16, tope=H - MB):
    """Evita que las etiquetas finales se encimen: las empuja hacia abajo y, si se pasan, sube el grupo."""
    orden = sorted(range(len(ys)), key=lambda i: ys[i])
    res = list(ys)
    for a, b in zip(orden, orden[1:]):
        if res[b] - res[a] < hueco:
            res[b] = res[a] + hueco
    exceso = res[orden[-1]] - tope
    if exceso > 0:
        res = [y - exceso for y in res]
    return res


def marcas_x(meses):
    paso = next((p for p in PASOS_X if meses / p <= 7), PASOS_X[-1])
    ms = list(range(0, meses + 1, paso))
    en_anios = paso % 12 == 0
    return ms, en_anios


def construir_grafico(puntos):
    """puntos: salida de `trayectoria`. Devuelve todo lo necesario para dibujar el SVG en la plantilla."""
    meses = puntos[-1]["mes"]
    valores = [p[k] for p in puntos for k in ("nominal", "real", "aportado", "efectivo_real")]
    lo, hi, marcas = ejes_y(min(valores), max(valores))
    izq, der, arr, aba = ML, W - MR, MT, H - MB

    def X(m):
        return izq + (der - izq) * m / meses

    def Y(v):
        return aba - (aba - arr) * (v - lo) / (hi - lo)

    linea = lambda k: " ".join(f"{_n(X(p['mes']))},{_n(Y(p[k]))}" for p in puntos)  # noqa: E731
    ult = puntos[-1]
    series = (("nominal", "nom", ""), ("real", "real", " real"), ("aportado", "apor", " tú"),
              ("efectivo_real", "efec", " guardado"))
    ys = _separar([Y(ult[k]) for k, _, _ in series])
    etiquetas = [{"x": _n(der + 8), "y": _n(y), "clase": c, "texto": abrev_clp(ult[k]) + suf}
                 for (k, c, suf), y in zip(series, ys)]

    ms, en_anios = marcas_x(meses)
    nombres = {"nominal": "Con la rentabilidad", "real": "Descontando inflación", "aportado": "Lo que pones tú",
               "efectivo_real": "Guardado sin invertir (pesos de hoy)"}
    hover = [{"x": _n(X(m)), "y": _n(Y(puntos[m][k])), "clase": c,
              "texto": f"{nombres[k]}, {'mes ' + str(m)}: {clp(puntos[m][k])}"}
             for m in ms[1:] for k, c, _ in series]
    return {
        "ancho": W, "alto": H, "izq": _n(izq), "der": _n(der), "abajo": _n(aba), "x_titulo_y": _n(H - 10),
        "x_titulo_x": _n((izq + der) / 2), "y_etiqueta_x": _n(izq - 8),
        "y_marcas": [{"y": _n(Y(v)), "texto": t} for v, t in zip(marcas, etiquetas_eje(marcas))],
        "x_marcas": [{"x": _n(X(m)), "texto": str(m // 12 if en_anios else m)} for m in ms],
        "x_titulo": "Años" if en_anios else "Meses",
        "nominal": linea("nominal"), "real": linea("real"), "aportado": linea("aportado"), "efectivo": linea("efectivo_real"),
        "etiquetas": etiquetas, "hover": hover, "meses_tabla": sorted(set(ms + [meses])),
    }
