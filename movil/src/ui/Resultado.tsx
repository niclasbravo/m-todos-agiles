/** Pestaña «Mi plan»: perfil, hasta 3 recomendaciones, proyección, sin invertir, descartes y acciones. */
import { useMemo, useRef } from "react";
import { INFLACION_DEFECTO, sinInvertir } from "../logica/instrumentos";
import { validarAjuste, type Entrada } from "../logica/formularios";
import { MOVIL } from "../logica/graficos";
import { armarProyeccion } from "../logica/proyeccion";
import { recomendar, type Respuestas } from "../logica/recomendador";
import { compartir, vibrar } from "../nativo";
import { IcoCompartir, IcoPlan } from "./iconos";
import { Proyeccion } from "./Proyeccion";
import { SinInvertir } from "./SinInvertir";
import { useState } from "react";

interface Props {
  resp: Respuestas | null;
  ver: string | null;
  ajuste: Entrada;
  estadoPerfil: string;
  onVer: (id: string) => void;
  onAjuste: (e: Entrada) => void;
  irSimulador: (e: Entrada, destacar: string[]) => void;
  irQuiz: () => void;
  raiz: React.RefObject<HTMLElement | null>;
}

export function Resultado({ resp, ver, ajuste, estadoPerfil, onVer, onAjuste, irSimulador, irQuiz, raiz }: Props) {
  const res = useMemo(() => (resp ? recomendar(resp) : null), [resp]);
  const proyRef = useRef<HTMLDivElement>(null);
  const [aviso, setAviso] = useState("");

  const calc = useMemo(() => {
    if (!res || !resp) return null;
    const elegido = res.recomendaciones.find((r) => r.instrumento.id === ver) ?? null; // solo se proyectan las recomendadas
    const ref = res.perfil.meses_ref;
    let errores = {}, proy = null;
    if (elegido) {
      const v = validarAjuste({ inflacion: INFLACION_DEFECTO, meses: ref, aporte: 0, ...ajuste });
      const [infl, meses, aporte] = v.ok ? [v.datos.inflacion, v.datos.meses, v.datos.aporte] : [INFLACION_DEFECTO, ref, 0];
      if (!v.ok) errores = v.errores;
      proy = armarProyeccion(elegido.instrumento, resp.monto, meses, infl, aporte, MOVIL);
    }
    const nada = proy ? proy.sin_invertir : sinInvertir(resp.monto, 0, ref, INFLACION_DEFECTO);
    return { proy, errores, nada };
  }, [res, resp, ver, ajuste]);

  if (!res || !resp || !calc) return (
    <div className="vacio">
      <div className="ilus"><IcoPlan /></div>
      <h1>Tu plan aparece aquí</h1>
      <p className="lead">Responde el quiz de perfil y te mostramos hasta 3 opciones para empezar, con sus razones, una proyección y lo que descartamos.</p>
      <button type="button" className="btn" onClick={irQuiz}>Responder el quiz</button>
    </div>
  );

  const { perfil } = res;
  const verProyeccion = (id: string) => {
    vibrar();
    onVer(id);
    setTimeout(() => proyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  async function compartirPlan() {
    vibrar();
    const texto = [`Mi perfil de ahorro es ${perfil.nombre.toLowerCase()}. Con ${perfil.monto_fmt} y un plazo de ${perfil.plazo_txt.toLowerCase()}, estas opciones calzan mejor:`,
      ...res!.recomendaciones.map((r, k) => `${k + 1}. ${r.instrumento.nombre} — puntaje ${r.puntaje} de 100, ~${r.tasa_txt}% anual`),
      "", "Calculado con ¿Dónde ahorro? (orientación educativa, no asesoría financiera)."].join("\n");
    const r = await compartir("Mi plan de ahorro", texto);
    setAviso(r === "copiado" ? "Copiamos tu plan al portapapeles." : r === "no" ? "No pudimos compartir desde este dispositivo." : "");
  }

  return (
    <>
      <h1>¿Con qué opción conviene partir?</h1>
      <section className="reco">
        <p className="lead">Tu perfil es <strong style={{ color: "var(--text)" }}>{perfil.nombre.toLowerCase()}</strong>. Con {perfil.monto_fmt} y un plazo de {perfil.plazo_txt.toLowerCase()}, estas son las opciones que mejor calzan, ordenadas por puntaje:</p>
        {res.recomendaciones.map((r, k) => {
          const sel = r.instrumento.id === ver;
          return (
            <article key={r.instrumento.id} className={"tarjeta rec" + (sel ? " sel" : "")}>
              <header>
                <h2><span className={`medalla m${k + 1}`} aria-hidden="true">{k + 1}</span><span className="sr">{k + 1}. </span>{r.instrumento.nombre}</h2>
                <span className="tag puntaje">Puntaje {r.puntaje} de 100<i className="barra-puntaje" style={{ "--p": `${r.puntaje}%` } as React.CSSProperties} aria-hidden="true" /></span>
              </header>
              <ul className="razones">{r.razones.map((t) => <li key={t}>{t}</li>)}</ul>
              <details className="desplegable">
                <summary>Puntaje por partes y fuente</summary>
                <p className="meta">Puntaje por partes: rentabilidad {r.desglose.rentabilidad}, calce de riesgo con tu plazo {r.desglose.calce}, liquidez {r.desglose.liquidez}. Fuente: {r.instrumento.fuente}.</p>
              </details>
              <p style={{ margin: "10px 0 0" }}>
                <button type="button" className="btn sec ancho" aria-current={sel ? "true" : undefined} onClick={() => verProyeccion(r.instrumento.id)}>
                  {sel ? "Viendo la proyección" : "Ver proyección de esta opción"}
                </button>
              </p>
            </article>
          );
        })}

        <div className="seccion"><SinInvertir n={calc.nada} raiz={raiz} /></div>
        <div ref={proyRef} style={{ scrollMarginTop: 12 }}>
          <Proyeccion proy={calc.proy} ajuste={{ inflacion: INFLACION_DEFECTO, meses: perfil.meses_ref, aporte: 0, ...ajuste }} errores={calc.errores} onAjuste={onAjuste} />
        </div>
        {res.notas.map((n) => <p key={n} className="aviso">{n}</p>)}

        {res.descartados.length > 0 && <div className="seccion">
          <h2>Opciones que descartamos y por qué</h2>
          {res.descartados.map((x) => (
            <div key={x.instrumento.id} className="descartada">
              <h3>{x.instrumento.nombre}</h3>
              <ul className="desc">{x.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          ))}
        </div>}
        {res.otras_viables.length > 0 && <p className="meta">También cumplían tus condiciones, pero quedaron fuera del top 3: {res.otras_viables.join(", ")}.</p>}

        <div className="acciones">
          <button type="button" className="btn ancho" onClick={() => { vibrar(); irSimulador({ inicial: resp.monto, plazo: perfil.meses_ref, unidad: "meses" }, res.recomendaciones.map((r) => r.instrumento.nombre)); }}>Ver cuánto podría crecer</button>
          <button type="button" className="btn sec ancho" onClick={compartirPlan}><IcoCompartirInline />Compartir mi plan</button>
          <button type="button" className="link" onClick={irQuiz}>Actualizar mis respuestas</button>
        </div>
        {aviso && <p className="aviso ok" role="status">{aviso}</p>}
        {estadoPerfil && <p className="aviso ok" role="status">{estadoPerfil}</p>}
        <details className="desplegable">
          <summary>Cómo calculamos el puntaje</summary>
          <p>Primero descartamos lo que no corresponde: monto menor al mínimo, plazo más corto que el recomendado, riesgo mayor al que toleras, y APV si no tienes fondo de emergencia. Luego puntuamos de 0 a 100 la rentabilidad, el calce entre el riesgo y tu plazo, y la liquidez. Normalmente pesan 35%, 40% y 25%; si no tienes fondo de emergencia, la liquidez sube a 45%.</p>
        </details>
        <p className="meta">Es una orientación educativa basada en reglas simples, no asesoría financiera. Las tasas son referenciales y no están garantizadas.</p>
      </section>
    </>
  );
}

function IcoCompartirInline() {
  return <span style={{ display: "inline-flex", width: 18, height: 18 }} className="ico-btn"><IcoCompartir /></span>;
}
