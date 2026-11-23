"""Genera tests/paridad.json con salidas de la app web (Python) para comprobar que la app móvil calcula lo mismo.

Uso (desde movil/):  python3 scripts/generar_paridad.py ..
El argumento es la raíz del repositorio (donde está la carpeta comparador/). No necesita Django instalado.
"""
import json
import os
import sys
import types
from itertools import product

raiz = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "..")
sys.path.insert(0, raiz)
# views.py importa Django; aquí solo se necesita la lógica pura, así que se cargan los módulos directamente.
paquete = types.ModuleType("comparador"); paquete.__path__ = [os.path.join(raiz, "comparador")]
sys.modules["comparador"] = paquete

from comparador.instruments import INSTRUMENTOS, aporte_minimo, comparar, sin_invertir, trayectoria  # noqa: E402
from comparador.proyeccion import armar_proyeccion  # noqa: E402
from comparador.recomendador import PLAZOS, recomendar  # noqa: E402


def barrio(filas, d, cortes=12):  # copia literal de views.barrio (views.py importa Django)
    meses = d["meses"]
    marcas = sorted({round(meses * k / cortes) for k in range(cortes + 1)})
    inst = []
    for f in filas:
        t = trayectoria(d["inicial"], d["aporte"], meses, f["tasa"], d["inflacion"],
                        apv=f.get("apv", False), aporte_min=aporte_minimo(f))
        inst.append({"nombre": f["nombre"], "riesgo": f["riesgo_txt"],
                     "puntos": [[round(t[m]["aportado"]), round(t[m]["nominal"]), round(t[m]["real"])] for m in marcas]})
    return {"meses": marcas, "inst": inst}


def sin_inst(x):
    """Quita los diccionarios de instrumento repetidos: se comparan por id."""
    if isinstance(x, dict):
        if "id" in x and "fuente" in x:
            return {"id": x["id"]}
        return {k: sin_inst(v) for k, v in x.items()}
    if isinstance(x, list):
        return [sin_inst(v) for v in x]
    if isinstance(x, float) and x != x:
        return None
    return x


casos_sim = []
for inicial, aporte, meses, infl in product((0, 3_000, 1_000_000, 12_345_678), (0, 4_000, 9_999, 100_000),
                                            (1, 7, 12, 13, 60, 84, 480), (0, 2.25, 3, 7.5)):
    if inicial == 0 and aporte == 0:
        continue
    filas = comparar(inicial, aporte, meses, infl)
    d = {"inicial": inicial, "aporte": aporte, "meses": meses, "inflacion": infl}
    casos_sim.append({"entrada": d, "filas": [{k: v for k, v in f.items() if k.endswith(("_fmt", "_txt")) or k.startswith("pct_")
                                              or k in ("id", "final", "aportado", "ganancia", "real", "bono", "sin_interes")}
                                             for f in filas],
                      "sin_invertir": sin_invertir(inicial, aporte, meses, infl),
                      "escena": barrio(filas, d) if meses <= 120 else None})

casos_quiz = []
for ingresos, plazo, caida, colchon, monto in product(("bajos", "medios", "altos"), [p[0] for p in PLAZOS],
                                                      ("vender", "esperar", "aportar"), ("no", "parcial", "si"),
                                                      (1, 3_000, 7_500, 50_000, 2_000_000, 100_000_000)):
    resp = {"monto": monto, "ingresos": ingresos, "plazo": plazo, "caida": caida, "colchon": colchon}
    casos_quiz.append({"entrada": resp, "salida": sin_inst(recomendar(resp))})

casos_proy = []
for inst, monto, meses, infl, aporte in product(INSTRUMENTOS, (1, 5_000, 1_000_000, 37_000_000), (1, 3, 9, 11, 12, 24, 48, 84, 480),
                                                (0, 3, 2.25, 15), (0, 5_000, 50_000)):
    p = armar_proyeccion(inst, monto, meses, infl, aporte)
    casos_proy.append({"entrada": {"id": inst["id"], "monto": monto, "meses": meses, "inflacion": infl, "aporte": aporte},
                       "salida": sin_inst({k: v for k, v in p.items() if k != "inst"})})

salida = os.path.join(os.path.dirname(__file__), "..", "tests", "paridad.json")
with open(salida, "w", encoding="utf-8") as f:
    json.dump({"simulador": casos_sim, "quiz": casos_quiz, "proyeccion": casos_proy}, f, ensure_ascii=False)
print(f"{len(casos_sim)} simulaciones, {len(casos_quiz)} quizzes, {len(casos_proy)} proyecciones → {os.path.normpath(salida)}")
