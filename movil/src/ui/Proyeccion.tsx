/** Proyección de la opción elegida: gráfico de 4 líneas (se recorre con el dedo), ajuste, fórmula y tabla. */
import { useEffect, useState } from "react";
import { clp } from "../logica/formatos";
import type { Entrada, Errores as TErrores } from "../logica/formularios";
import type { Proyeccion as Datos } from "../logica/proyeccion";
import { mesesTxt } from "../logica/recomendador";
import { vibrar } from "../nativo";
import { Errores } from "./comunes";

function Grafico({ proy }: { proy: Datos }) {
  const g = proy.grafico;
  const [i, setI] = useState<number | null>(null);
  useEffect(() => setI(null), [proy]);
  const mover = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * g.ancho;
    const izq = parseFloat(g.izq), der = parseFloat(g.der);
    if (x < izq - 20 || x > der + 20) return;
    const meses = g.recorrido.length - 1;
    const k = Math.max(0, Math.min(meses, Math.round(((x - izq) / (der - izq)) * meses)));
    if (k !== i) { setI(k); if (k % 12 === 0) vibrar(); }
  };
  const p = i != null ? g.recorrido[i] : null;
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${g.ancho} ${g.alto}`} role="img" aria-label={`Proyección de ${proy.inst.nombre}. ${proy.resumen}`}
        onPointerDown={(e) => { mover(e); }} onPointerMove={(e) => { if (e.buttons || e.pointerType === "mouse") mover(e); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setI(null); }}>
        {g.y_marcas.map((t) => <g key={t.y}>
          <line className="grid" x1={g.izq} x2={g.der} y1={t.y} y2={t.y} />
          <text className="eje" x={g.y_etiqueta_x} y={t.y} dy={4} textAnchor="end">{t.texto}</text>
        </g>)}
        {g.x_marcas.map((t) => <text key={t.x} className="eje" x={t.x} y={g.abajo} dy={16} textAnchor="middle">{t.texto}</text>)}
        <text className="eje" x={g.x_titulo_x} y={g.x_titulo_y} textAnchor="middle">{g.x_titulo}</text>
        <polyline className="l l-efec" points={g.efectivo} />
        <polyline className="l l-apor" points={g.aportado} />
        <polyline className="l l-real" points={g.real} />
        <polyline className="l l-nom" points={g.nominal} />
        {g.etiquetas.map((e) => <text key={e.clase} className={`et et-${e.clase}`} x={e.x} y={e.y} dy={4}>{e.texto}</text>)}
        {p && <g>
          <line className="cruz" x1={p.x} x2={p.x} y1={12} y2={g.abajo} />
          {(["efectivo_real", "aportado", "real", "nominal"] as const).map((s) =>
            <circle key={s} className={"pt " + { nominal: "nom", real: "real", aportado: "apor", efectivo_real: "efec" }[s]} cx={p.x} cy={p.y[s]} r={4.5} />)}
        </g>}
      </svg>
      {p ? <div className="globo" style={{ left: `${Math.min(78, Math.max(22, (p.x / g.ancho) * 100))}%` }}>
        <b>{p.mes === 0 ? "Hoy" : mesesTxt(p.mes)}</b>
        <span>Con la rentabilidad <em>{clp(p.v.nominal)}</em></span>
        <span>Descontando inflación <em>{clp(p.v.real)}</em></span>
        <span>Lo que pones tú <em>{clp(p.v.aportado)}</em></span>
        <span>Guardado sin invertir <em>{clp(p.v.efectivo_real)}</em></span>
      </div> : null}
    </div>
  );
}

interface Props {
  proy: Datos | null;
  ajuste: Entrada;
  errores: TErrores;
  onAjuste: (e: Entrada) => void;
}

export function Proyeccion({ proy, ajuste, errores, onAjuste }: Props) {
  const [b, setB] = useState<Entrada>(ajuste);
  useEffect(() => setB(ajuste), [ajuste]);
  if (!proy) return (
    <section id="proyeccion" className="tarjeta proy" aria-labelledby="proy-titulo">
      <h2 id="proy-titulo">Proyección</h2>
      <p className="meta">Elige «Ver proyección de esta opción» en una de las recomendaciones para ver cómo podría crecer tu dinero, con la inflación descontada.</p>
    </section>
  );
  return (
    <section id="proyeccion" className="tarjeta proy" aria-labelledby="proy-titulo">
      <h2 id="proy-titulo">Proyección preliminar: {proy.inst.nombre}</h2>
      <p className="lead" style={{ marginBottom: 6, fontSize: 14 }}>{proy.resumen} {proy.poder_compra}</p>
      <p className="leyenda-lineas">
        <span><i className="ln nom" />Con la rentabilidad de esta opción</span>
        <span><i className="ln real" />Descontando la inflación (pesos de hoy)</span>
        <span><i className="ln apor" />Lo que pones tú</span>
        <span><i className="ln efec" />Si lo dejas guardado sin invertir (pesos de hoy)</span>
      </p>
      <Grafico proy={proy} />
      <p className="meta" style={{ textAlign: "center" }}>Toca o desliza el dedo sobre el gráfico para ver cada mes.</p>
      {proy.aporte_txt && <p className="meta"><strong>Aportes mensuales y depósitos a plazo.</strong> {proy.aporte_txt}</p>}
      {proy.bono_txt && <p className="meta">{proy.bono_txt}</p>}
      <p className="meta">Cómo se calcula: {proy.formula}. Es interés compuesto: cada mes se gana sobre lo ya ganado.</p>

      <form className="ajuste" onSubmit={(e) => { e.preventDefault(); vibrar(); onAjuste(b); }} noValidate>
        <div className="campo"><label htmlFor="a-infl">Inflación anual esperada (%)</label>
          <input id="a-infl" type="text" inputMode="decimal" value={String(b.inflacion ?? "")} onChange={(e) => setB({ ...b, inflacion: e.target.value })} />
          <Errores lista={errores.inflacion} /></div>
        <div className="campo"><label htmlFor="a-meses">Horizonte (meses)</label>
          <input id="a-meses" type="number" inputMode="numeric" value={String(b.meses ?? "")} onChange={(e) => setB({ ...b, meses: e.target.value })} />
          <Errores lista={errores.meses} /></div>
        <div className="campo completo"><label htmlFor="a-aporte">Aporte mensual (CLP)</label>
          <input id="a-aporte" type="number" inputMode="numeric" value={String(b.aporte ?? "")} onChange={(e) => setB({ ...b, aporte: e.target.value })} />
          <Errores lista={errores.aporte} /></div>
        <button type="submit" className="btn completo">Actualizar gráfico</button>
      </form>
      <details className="desplegable">
        <summary>Ver los datos del gráfico</summary>
        <div className="tabla-scroll"><table className="tabla">
          <thead><tr><th scope="col">Plazo</th><th scope="col">Lo que pones tú</th><th scope="col">Con la rentabilidad</th><th scope="col">Descontando inflación</th><th scope="col">Guardado sin invertir</th></tr></thead>
          <tbody>{proy.tabla.map((f) => <tr key={f.mes}><th scope="row">{f.periodo}</th><td>{f.aportado}</td><td>{f.nominal}</td><td>{f.real}</td><td>{f.efectivo}</td></tr>)}</tbody>
        </table></div>
      </details>
      <p className="meta">Proyección preliminar con el monto que indicaste{proy.aporte ? " y los aportes mensuales que agregaste, que se suponen al final de cada mes" : ". Puedes sumar un aporte mensual en el formulario de arriba"}. La rentabilidad se mantiene constante, algo que en la realidad no ocurre, sobre todo en fondos.</p>
    </section>
  );
}
