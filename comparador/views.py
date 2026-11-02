from urllib.parse import urlencode

from django.shortcuts import render

from .forms import AjusteProyeccionForm, QuizForm, SimuladorForm
from .instruments import INFLACION_DEFECTO, aporte_minimo, comparar, sin_invertir, trayectoria
from .proyeccion import armar_proyeccion
from .recomendador import recomendar


def barrio(filas, d, cortes=12):
    """Evolución de cada instrumento en ~12 momentos, para la escena 3D del simulador.

    Usa la misma trayectoria que el cálculo principal, así el último corte coincide con las barras.
    """
    meses = d["meses"]
    marcas = sorted({round(meses * k / cortes) for k in range(cortes + 1)})
    inst = []
    for f in filas:
        t = trayectoria(d["inicial"], d["aporte"], meses, f["tasa"], d["inflacion"],
                        apv=f.get("apv", False), aporte_min=aporte_minimo(f))
        inst.append({"nombre": f["nombre"], "riesgo": f["riesgo_txt"],
                     "puntos": [[round(t[m]["aportado"]), round(t[m]["nominal"]), round(t[m]["real"])] for m in marcas]})
    return {"meses": marcas, "inst": inst}


def simulador(request):
    # Valores por defecto para lo que no venga en la URL: así siempre se muestra algo útil.
    por_defecto = {n: f.initial for n, f in SimuladorForm.base_fields.items()}
    form = SimuladorForm({**por_defecto, **request.GET.dict()}, label_suffix="")
    filas = d = nada = escena = None
    if form.is_valid():
        d = form.cleaned_data
        filas = comparar(d["inicial"], d["aporte"], d["meses"], d["inflacion"])
        nada = sin_invertir(d["inicial"], d["aporte"], d["meses"], d["inflacion"])
        escena = barrio(filas, d)
    return render(request, "comparador/simulador.html", {
        "form": form, "filas": filas, "d": d, "nada": nada, "escena": escena,
        "destacar": request.GET.getlist("destacar")})


def quiz(request):
    """Calcula la recomendación y la proyección en el servidor sin guardar nada.
    El perfil se guarda solo en el navegador (JS, localStorage)."""
    form = QuizForm(request.GET or None)
    res = respuestas = sim_qs = proy = ajuste = ocultos = nada = None
    if form.is_valid():
        respuestas = form.cleaned_data
        res = recomendar(respuestas)
        base_qs = urlencode(respuestas)
        ver = request.GET.get("ver", "")
        for r in res["recomendaciones"]:
            r["url_ver"] = f"?{base_qs}&ver={r['instrumento']['id']}#proyeccion"
            r["seleccionada"] = r["instrumento"]["id"] == ver
        elegido = next((r for r in res["recomendaciones"] if r["seleccionada"]), None)
        if elegido:  # solo se proyectan las opciones recomendadas
            ref = res["perfil"]["meses_ref"]
            datos = {"inflacion": INFLACION_DEFECTO, "meses": ref, "aporte": 0,
                     **{k: v for k, v in request.GET.items() if k in ("inflacion", "meses", "aporte")}}
            ajuste = AjusteProyeccionForm(datos, label_suffix="")
            infl, meses, aporte = ((ajuste.cleaned_data["inflacion"], ajuste.cleaned_data["meses"],
                                    ajuste.cleaned_data["aporte"]) if ajuste.is_valid() else (INFLACION_DEFECTO, ref, 0))
            proy = armar_proyeccion(elegido["instrumento"], respuestas["monto"], meses, infl, aporte)
            ocultos = {**respuestas, "ver": ver}
        params = [("inicial", respuestas["monto"]), ("plazo", res["perfil"]["meses_ref"]), ("unidad", "meses")]
        params += [("destacar", r["instrumento"]["nombre"]) for r in res["recomendaciones"]]
        sim_qs = urlencode(params)
        nada = sin_invertir(respuestas["monto"], 0, res["perfil"]["meses_ref"], INFLACION_DEFECTO)
    return render(request, "comparador/quiz.html", {
        "form": form, "res": res, "respuestas": respuestas, "sim_qs": sim_qs,
        "proy": proy, "ajuste": ajuste, "ocultos": ocultos, "nada": nada})
