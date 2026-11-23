/** Bloque «¿Y si no lo pones en ninguna parte?» con el estante 3D que se vacía al avanzar el tiempo. */
import { useEffect, useRef, useState } from "react";
import { Estante } from "../escenas3d/estante";
import type { SinInvertir as Datos } from "../logica/instrumentos";
import { vibrar } from "../nativo";

export function SinInvertir({ n, raiz }: { n: Datos; raiz: React.RefObject<HTMLElement | null> }) {
  const pierde = n.perdida > 0.5;
  const caja = useRef<HTMLDivElement>(null);
  const estante = useRef<Estante | null>(null);
  const reproducir = useRef<() => void>(() => {});
  const [con3d, setCon3d] = useState(false);
  const [reloj, setReloj] = useState({ mes: 0, poder: 1 });

  useEffect(() => {
    if (!pierde || !caja.current) return;
    const e = new Estante(caja.current, n.meses, parseFloat(n.pct_real) / 100, setReloj);
    if (!e.ok) { e.destruir(); return; }
    estante.current = e; setCon3d(true);
    // El scroll de la pantalla es el paso del tiempo: 0 al entrar, el plazo completo al pasar su centro (igual que la web).
    const scroller = raiz.current;
    let animando = false;
    const leer = () => {
      if (animando || !caja.current) return;
      const r = caja.current.getBoundingClientRect(), vh = innerHeight;
      e.setProgreso((vh - r.top) / (vh * 0.75 + r.height * 0.4) - 0.15);
    };
    scroller?.addEventListener("scroll", leer, { passive: true }); leer();
    // En el teléfono además se puede tocar ▶ para ver pasar el plazo completo.
    reproducir.current = () => {
      animando = true; const t0 = performance.now();
      const paso = (t: number) => {
        const u = Math.min(1, (t - t0) / 3200); e.setProgreso(u);
        if (u < 1) requestAnimationFrame(paso); else setTimeout(() => { animando = false; }, 1200);
      };
      requestAnimationFrame(paso);
    };
    return () => { scroller?.removeEventListener("scroll", leer); e.destruir(); estante.current = null; setCon3d(false); };
  }, [pierde, raiz]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { estante.current?.actualizar(n.meses, parseFloat(n.pct_real) / 100); }, [n.meses, n.pct_real]);

  const m = reloj.mes;
  return (
    <section className={"nada" + (con3d ? " con-3d" : "")} aria-labelledby="nada-titulo">
      {pierde && <div className="estante" ref={caja} aria-hidden="true" style={con3d ? undefined : { display: "none" }}>
        <p className="estante-reloj"><b>{m === 0 ? "Hoy" : m % 12 === 0 ? `Año ${m / 12}` : `Mes ${m}`}</b>
          <span>{m === 0 ? "Tu plata alcanza para todo el estante" : `La misma plata alcanza para el ${Math.round(reloj.poder * 100)}% de lo que comprabas`}</span></p>
        <div className="estante-tiempo" style={{ justifyContent: "flex-end" }}>
          <button type="button" aria-label="Ver pasar el tiempo" onClick={() => { vibrar(); reproducir.current(); }}>▶</button>
        </div>
      </div>}
      <h2 id="nada-titulo">¿Y si no lo pones en ninguna parte?</h2>
      {pierde ? <>
        <div className="nada-comp">
          <div className="nada-col">
            <span className="nada-et">Hoy tienes</span>
            <strong>{n.final_fmt}</strong>
            <span className="billete" aria-hidden="true"><i>$</i></span>
          </div>
          <span className="nada-flecha" aria-hidden="true" />
          <div className="nada-col">
            <span className="nada-et">En {n.meses} meses compra lo que hoy</span>
            <strong className="pierde">{n.real_fmt}</strong>
            <span className="billete chico" style={{ "--k": n.pct_real } as React.CSSProperties} role="img" aria-label={`Poder de compra de la plata guardada: ${n.pct_real}% de lo que tenías`}><i>$</i></span>
          </div>
        </div>
        <p className="nada-chips"><span className="chip negativo">−{n.pct_perdida_txt}% de poder de compra</span><span className="chip">Pierdes {n.perdida_fmt} sin gastar nada</span><span className="chip">Inflación {n.inflacion_txt}% anual</span></p>
        <details className="nada-mas desplegable">
          <summary>¿Por qué pasa esto?</summary>
          <p>Si guardas {n.final_fmt} en efectivo o en una cuenta que no paga intereses durante {n.meses} meses, seguirás teniendo {n.final_fmt}. Pero con una inflación de {n.inflacion_txt}% anual, esa plata alcanzaría para comprar lo que hoy cuesta {n.real_fmt}: pierdes {n.perdida_fmt} ({n.pct_perdida_txt}%) de poder de compra aunque no gastes nada.</p>
          <p>Lo que hoy cuesta $10.000 costaría unos {n.canasta_fmt} en {n.meses} meses. Por eso incluso una opción muy segura que rinda cerca de la inflación es mejor que dejar la plata quieta, mientras mantengas aparte lo que necesitas para emergencias.</p>
        </details>
      </> : <p>Con una inflación de {n.inflacion_txt}% la plata guardada mantiene su poder de compra, pero tampoco crece. Una inflación de 0% es poco realista: en Chile los precios suben casi todos los años.</p>}
    </section>
  );
}
