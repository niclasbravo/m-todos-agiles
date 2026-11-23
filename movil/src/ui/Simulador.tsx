/** Pestaña Simulador: portada, maqueta 3D, sliders en hoja inferior, formulario completo, sin invertir y ranking. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { PerfilGuardado } from "../almacen";
import { barrio, type DatosEscena } from "../logica/escena";
import { comparar, sinInvertir } from "../logica/instrumentos";
import { validarSimulador, type DatosSim, type Entrada } from "../logica/formularios";
import { clpJs } from "../logica/formatos";
import { vibrar } from "../nativo";
import { Contador, Errores, Hoja, Marca3D } from "./comunes";
import { Picto } from "./iconos";
import { Mapa, type MapaApi } from "./Mapa";
import { SinInvertir } from "./SinInvertir";

interface Props {
  entrada: Entrada;
  onEntrada: (e: Entrada) => void;
  destacar: string[];
  perfil: PerfilGuardado | null;
  irQuiz: () => void;
  verPerfil: () => void;
  raiz: React.RefObject<HTMLElement | null>;
}

const SUPUESTOS = "Es una estimación referencial, no asesoría financiera. Las tasas son referenciales, de sitios comparadores a septiembre y octubre de 2026 (TPM 4,5%; IPC 4,1% a 12 meses), y están pendientes de confirmar en los sitios oficiales. Los depósitos tienen tasa conocida; en los fondos se usa el promedio anual de los últimos 3 años, que no garantiza el futuro, y el resultado real puede ser distinto e incluso negativo. El APV usa una rentabilidad supuesta del 7%. No se descuentan impuestos ni comisiones por separado. Los aportes se suponen al final de cada mes. En el APV régimen A se suma el bono del Estado (15% de lo aportado en el año, con tope de 6 UTM) al cumplir cada año completo.";

export function Simulador({ entrada, onEntrada, destacar, perfil, irQuiz, verPerfil, raiz }: Props) {
  const v = useMemo(() => validarSimulador(entrada), [entrada]);
  const ultimoOk = useRef<DatosSim | null>(null);
  if (v.ok) ultimoOk.current = v.datos;
  const d = v.ok ? v.datos : ultimoOk.current;

  const filas = useMemo(() => (v.ok ? comparar(v.datos.inicial, v.datos.aporte, v.datos.meses, v.datos.inflacion) : null), [v]);
  const nada = useMemo(() => (v.ok ? sinInvertir(v.datos.inicial, v.datos.aporte, v.datos.meses, v.datos.inflacion) : null), [v]);
  const escenaRef = useRef<DatosEscena | null>(null);
  const escena = useMemo(() => {
    if (filas && v.ok) escenaRef.current = barrio(filas, v.datos);
    return escenaRef.current;
  }, [filas, v]);

  // Borrador del formulario completo (se aplica con «Simular», como en la web).
  const [borrador, setBorrador] = useState<Entrada>(entrada);
  useEffect(() => setBorrador(entrada), [entrada]);
  const errores = v.ok ? {} : v.errores;

  // Hoja «Simula con tus números»: sliders que recalculan en vivo.
  const [hoja, setHoja] = useState(false);
  const [sl, setSl] = useState({ inicial: 1_000_000, aporte: 0, plazo: 5 });
  const espera = useRef(0);
  function abrirHoja() {
    vibrar();
    setSl({
      inicial: Math.min(10_000_000, Math.max(0, Math.round(Number(d?.inicial ?? 1_000_000) / 50_000) * 50_000)),
      aporte: Math.min(1_000_000, Math.max(0, Math.round(Number(d?.aporte ?? 0) / 10_000) * 10_000)),
      plazo: Math.min(10, Math.max(1, Math.round((d?.meses ?? 60) / 12))),
    });
    setHoja(true);
    // Que se vea la maqueta (y sus KPIs) mientras se mueven los controles.
    const mapa = raiz.current?.querySelector<HTMLElement>(".mapa");
    raiz.current?.scrollTo({ top: Math.max(0, (mapa?.offsetTop ?? 0) - 8), behavior: "smooth" });
  }
  function moverSlider(k: keyof typeof sl, val: number) {
    const nuevo = { ...sl, [k]: val };
    setSl(nuevo);
    clearTimeout(espera.current);
    espera.current = window.setTimeout(() => onEntrada({ ...entrada, inicial: nuevo.inicial, aporte: nuevo.aporte, plazo: nuevo.plazo, unidad: "anios" }), 140);
  }
  const vSl = validarSimulador({ ...entrada, inicial: sl.inicial, aporte: sl.aporte, plazo: sl.plazo, unidad: "anios" });

  const mapaApi = useRef<MapaApi>(null);
  const rankingRef = useRef<HTMLHeadingElement>(null);
  function verEnMapa(nombre: string) {
    vibrar();
    const mapa = raiz.current?.querySelector<HTMLElement>(".mapa");
    raiz.current?.scrollTo({ top: Math.max(0, (mapa?.offsetTop ?? 0) - 8), behavior: "smooth" });
    setTimeout(() => mapaApi.current?.enfocarNombre(nombre), 450);
  }

  const ordenadas = filas ? [...filas].sort((a, b) => b.final - a.final) : [];

  return (
    <>
      <header className="portada">
        <Marca3D />
        <h1>¿Dónde conviene partir a ahorrar?</h1>
        <p className="lead">Compara cuánto tendrías con cada opción disponible en Chile. Ingresa cuánto tienes, cuánto puedes aportar al mes y por cuánto tiempo.</p>
      </header>

      {escena && d && <Mapa ref={mapaApi} datos={escena} aporte={d.aporte} />}

      <div className="cta">
        <button type="button" className="btn" onClick={abrirHoja}>Simular con mis números</button>
        <button type="button" className="btn sec" onClick={irQuiz}>Responde el quiz</button>
      </div>

      {perfil && <p className="aviso ok">Tienes un perfil guardado en este teléfono: <button type="button" className="link" onClick={verPerfil}>ver mi recomendación guardada</button>.</p>}

      <form className="tarjeta form-sim seccion" id="simular" onSubmit={(e) => { e.preventDefault(); vibrar(); onEntrada(borrador); }} noValidate>
        <h2>Tus números</h2>
        <Errores lista={errores.__all__} />
        <div className="campo"><label htmlFor="f-inicial">Monto inicial (CLP)</label>
          <input id="f-inicial" type="number" inputMode="numeric" value={String(borrador.inicial ?? "")} onChange={(e) => setBorrador({ ...borrador, inicial: e.target.value })} />
          <Errores lista={errores.inicial} /></div>
        <div className="campo"><label htmlFor="f-aporte">Aporte mensual (CLP)</label>
          <input id="f-aporte" type="number" inputMode="numeric" value={String(borrador.aporte ?? "")} onChange={(e) => setBorrador({ ...borrador, aporte: e.target.value })} />
          <Errores lista={errores.aporte} /></div>
        <div className="fila2">
          <div className="campo"><label htmlFor="f-plazo">Plazo</label>
            <input id="f-plazo" type="number" inputMode="numeric" value={String(borrador.plazo ?? "")} onChange={(e) => setBorrador({ ...borrador, plazo: e.target.value })} /></div>
          <div className="campo"><label htmlFor="f-unidad">Unidad</label>
            <select id="f-unidad" value={String(borrador.unidad ?? "anios")} onChange={(e) => setBorrador({ ...borrador, unidad: e.target.value })}>
              <option value="anios">años</option><option value="meses">meses</option>
            </select></div>
        </div>
        <Errores lista={[...(errores.plazo ?? []), ...(errores.unidad ?? [])]} />
        <div className="campo"><label htmlFor="f-inflacion">Inflación anual esperada (%)</label>
          <input id="f-inflacion" type="text" inputMode="decimal" value={String(borrador.inflacion ?? "")} onChange={(e) => setBorrador({ ...borrador, inflacion: e.target.value })} />
          <Errores lista={errores.inflacion} /></div>
        <button type="submit" className="btn ancho">Simular</button>
      </form>

      <div className="seccion">
        {filas && nada && d ? <>
          <SinInvertir n={nada} raiz={raiz} />
          <h2 ref={rankingRef}>Aportando {filas[0].aportado_fmt} en {d.meses} meses, podrías tener:</h2>
          <p className="leyenda">
            <span><i className="sw" style={{ background: "var(--serie-pones)" }} />Lo que pones tú</span>
            <span><i className="sw" style={{ background: "var(--serie-gana)" }} />Ganancia</span>
            <span><i className="sw tick" style={{ background: "var(--real)" }} />Valor real, en pesos de hoy</span>
          </p>
          <ol className="ranking" key={`${d.inicial}-${d.aporte}-${d.meses}-${d.inflacion}`}>
            {ordenadas.map((f, k) => {
              const dest = destacar.includes(f.nombre);
              return (
                <li key={f.id} className={"puesto" + (dest ? " destacada" : "")} style={{ "--retraso": `${k * 80}ms` } as React.CSSProperties}>
                  <span className="pos" aria-hidden="true">{k + 1}</span>
                  <Picto id={f.id} />
                  <div className="cuerpo">
                    <div className="linea1">
                      <h3>{f.nombre}</h3>
                      {dest && <span className="insignia">Recomendada para ti</span>}
                      <Contador valor={f.final} retraso={k * 80 + 150} />
                    </div>
                    <div className="barra" role="img" aria-label={`${f.nombre}: ${f.final_fmt}, valor real ${f.real_fmt}`}>
                      <span className="a" style={{ width: `${f.pct_aportado}%` }} /><span className="g" style={{ width: `${f.pct_ganancia}%` }} /><i style={{ left: `${f.pct_real}%` }} />
                    </div>
                    <p className="datos">Rinde {f.tasa_txt}% al año con riesgo {f.riesgo_txt}. Ganas {f.ganancia_fmt}; en pesos de hoy equivale a {f.real_fmt}.</p>
                    <div className="pie">
                      <details className="detalle desplegable">
                        <summary>Ver detalle</summary>
                        <p className="meta">Rentabilidad referencial: {f.tasa_txt}% anual ({f.origen_txt}). Retiro: {f.liquidez}. {f.nota}{f.bono ? ` Incluye ${f.bono_fmt} de bono del Estado.` : ""}{f.sin_interes ? ` Con tu aporte mensual, ${f.sin_interes_fmt} quedan esperando sin ganar interés hasta juntar el mínimo de ${f.monto_min_fmt} por depósito.` : ""}</p>
                        <p className="meta">Fuente: {f.fuente}.</p>
                      </details>
                      <button type="button" className="ver-mapa" onClick={() => verEnMapa(f.nombre)}>Ver en el mapa</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </> : <>
          <h2>Revisa los datos del formulario</h2>
          <p className="lead">Corrige los campos marcados para ver la comparación.</p>
        </>}
        <details className="desplegable">
          <summary>Supuestos y límites de esta simulación</summary>
          <p>{SUPUESTOS}</p>
        </details>
      </div>

      <Hoja abierta={hoja} onCerrar={() => setHoja(false)} titulo="Simula con tus números">
        <div className="deslizador">
          <label htmlFor="s-inicial">Monto inicial <output>{clpJs(sl.inicial)}</output></label>
          <input type="range" id="s-inicial" min={0} max={10_000_000} step={50_000} value={sl.inicial} onChange={(e) => moverSlider("inicial", +e.target.value)} />
          <label htmlFor="s-aporte">Aporte mensual <output>{clpJs(sl.aporte)}</output></label>
          <input type="range" id="s-aporte" min={0} max={1_000_000} step={10_000} value={sl.aporte} onChange={(e) => moverSlider("aporte", +e.target.value)} />
          <label htmlFor="s-plazo">Plazo <output>{sl.plazo} {sl.plazo === 1 ? "año" : "años"}</output></label>
          <input type="range" id="s-plazo" min={1} max={10} step={1} value={sl.plazo} onChange={(e) => moverSlider("plazo", +e.target.value)} />
        </div>
        <p className={"sim-estado" + (vSl.ok ? "" : " error")} aria-live="polite">
          {vSl.ok ? "El mapa se actualiza mientras mueves los controles." : Object.values(vSl.errores).flat()[0]}
        </p>
        <button type="button" className="btn ancho" onClick={() => {
          setHoja(false);
          setTimeout(() => rankingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
        }}>Ver el detalle completo</button>
      </Hoja>
    </>
  );
}
