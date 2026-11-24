/** Maqueta 3D con su interfaz: leyenda, línea de tiempo, barra de zonas, tarjeta de zona y KPIs. */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { MapaIsla, ZONAS, tipoInst, type Ahora, type Zona } from "../escenas3d/mapa";
import type { DatosEscena } from "../logica/escena";
import { clp, clpJs, corto } from "../logica/formatos";
import { vibrar } from "../nativo";
import { IcoZona } from "./iconos";

export interface MapaApi { enfocarNombre(nombre: string): void }
interface Props { datos: DatosEscena; aporte: number }

export const Mapa = forwardRef<MapaApi, Props>(function Mapa({ datos, aporte }, ref) {
  const escenaRef = useRef<HTMLDivElement>(null), capaRef = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaIsla | null>(null);
  const [sinWebgl, setSinWebgl] = useState(false);
  const [momento, setMomento] = useState(0);
  const [mes, setMes] = useState(0);
  const [ahora, setAhora] = useState<Ahora[]>([]);
  const [enfocado, setEnfocado] = useState(false);
  const [zona, setZona] = useState<Zona>("todo");
  const zonaRef = useRef<Zona>("todo");
  const primera = useRef(true);

  const marcarZona = (z: Zona) => { zonaRef.current = z; setZona(z); };

  useEffect(() => {
    const m = new MapaIsla(escenaRef.current!, capaRef.current!, datos, {
      onMomento: (f, me, a) => { setMomento(f); setMes(me); setAhora(a.map((x) => ({ ...x }))); },
      onEnfoque: (e) => { setEnfocado(e); if (!e) marcarZona("todo"); },
      onZona: (z) => irZona(z),
    });
    if (!m.ok) { setSinWebgl(true); m.destruir(); return; }
    mapa.current = m;
    return () => { m.destruir(); mapa.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    mapa.current?.cargar(datos);
  }, [datos]);

  function irZona(z: Zona) {
    vibrar();
    marcarZona(z);
    mapa.current?.irZona(z);
  }

  useImperativeHandle(ref, () => ({
    enfocarNombre(nombre: string) {
      const t = tipoInst(nombre);
      marcarZona((Object.keys(ZONAS) as Zona[]).find((z) => z !== "todo" && ZONAS[z as Exclude<Zona, "todo">].tipo === t) ?? "todo");
      mapa.current?.enfocarNombre(nombre);
    },
  }));

  // Si no hay WebGL los KPIs se calculan igual desde los datos (último corte).
  const cortes = datos.meses.length;
  const vals = ahora.length === datos.inst.length ? ahora
    : datos.inst.map((d) => { const p = d.puntos[sinWebgl ? cortes - 1 : 0]; return { aportado: p[0], nominal: p[1], real: p[2], capas: 0 }; });
  const mesVisto = sinWebgl ? datos.meses[cortes - 1] : mes;
  let mejor = 0;
  vals.forEach((v, i) => { if (v.nominal > vals[mejor].nominal) mejor = i; });
  const a = vals[0]?.aportado ?? 0;
  const kpis: [string, string, string][] = vals.length ? [
    ["Lo que pones", clpJs(a), mesVisto === 0 ? "Monto inicial" : `En ${mesVisto} meses`],
    ["Mejor opción", clpJs(vals[mejor].nominal), datos.inst[mejor].nombre.split(" (")[0]],
    ["Ganancia de la mejor", clpJs(vals[mejor].nominal - a), `${((vals[mejor].nominal / a - 1) * 100).toFixed(1).replace(".", ",")}% sobre lo puesto`],
    ["Valor real de la mejor", clpJs(vals[mejor].real), "En pesos de hoy"],
  ] : [];

  const total = datos.meses[cortes - 1];
  const marcas = total >= 24 ? Array.from({ length: Math.floor(total / 12) + 1 }, (_, k) => k * 12) : [0, total];
  if (marcas[marcas.length - 1] !== total) marcas.push(total);

  const Z = zona !== "todo" ? ZONAS[zona] : null;
  const zonasLista: [Zona, string][] = [["todo", "Todo"], ["bancos", "Bancos"], ["fondos", "Fondos"], ["pension", "Pensión"], ["casa", "Tu casa"]];

  return (
    <>
      <section className={"mapa" + (enfocado ? " enfocado" : "")} aria-label="Maqueta de tu ahorro">
        <div className="escena" ref={escenaRef} aria-hidden="true" style={sinWebgl ? { display: "none" } : undefined}>
          <div className="tarjetas" ref={capaRef} />
        </div>
        {sinWebgl ? <p className="sin-webgl">Este teléfono no puede dibujar la maqueta 3D. Los números de abajo siguen disponibles.</p> : <>
          <p className="mapa-ley">
            <span><i className="sw" style={{ background: "#c5d0de", outline: "1px solid #9aa7b8" }} />Pallets que pones tú</span>
            <span><i className="sw" style={{ background: "#f2b937" }} />Pallets que gana tu plata</span>
          </p>
          {enfocado && <button type="button" className="ver-todo" onClick={() => { vibrar(); mapa.current?.soltar(); }}>Ver todo el mapa</button>}
          <div className="tiempo">
            <button type="button" className="btn play" aria-label="Reproducir el ahorro desde hoy" onClick={() => { vibrar(true); mapa.current?.reproducir(); }}>▶</button>
            <div className="linea">
              <input type="range" min={0} max={cortes - 1} step={1} value={Math.round(momento)} aria-label="Momento del ahorro"
                onChange={(e) => mapa.current?.setMomento(+e.target.value)} />
              <div className={"hitos" + (marcas.length > 6 ? " muchos" : "")}>
                {marcas.map((m) => <span key={m} className={m <= mes ? "on" : ""}>{m === 0 ? "Hoy" : m % 12 === 0 ? `Año ${m / 12}` : `${m} meses`}</span>)}
              </div>
            </div>
          </div>
        </>}
      </section>

      {!sinWebgl && <nav className="zonas" aria-label="Zonas del mapa">
        {zonasLista.map(([z, t]) => {
          const I = IcoZona[z];
          return <button key={z} type="button" className={zona === z ? "on" : ""} aria-pressed={zona === z} onClick={() => irZona(z)}><I /><span>{t}</span></button>;
        })}
      </nav>}

      {Z && <div className="tarjeta zona-card" aria-live="polite" key={zona}>
        <span className="zc-et">{Z.et}</span>
        <h2>{Z.titulo}</h2>
        <p>{Z.tipo ? Z.texto : `Cada mes sale de aquí tu aporte de ${clp(aporte)}. Toca la casa en el mapa para mandar los camiones a todas las sucursales.`}</p>
        {Z.tipo && <ul>
          {datos.inst.map((d, i) => ({ d, i })).filter(({ d }) => tipoInst(d.nombre) === Z.tipo).map(({ d, i }) => (
            <li key={d.nombre}><button type="button" onClick={() => { vibrar(); mapa.current?.enfocar(i); mapa.current?.enviar(i); }}>
              <span>{d.nombre.split(" (")[0]}</span><b>{corto(vals[i]?.nominal ?? 0)}</b>
            </button></li>
          ))}
        </ul>}
      </div>}

      <div className="tarjeta kpis">
        {kpis.map(([t, v, s]) => <div className="kpi" key={t}><span>{t}</span><strong>{v}</strong><small>{s}</small></div>)}
      </div>
    </>
  );
});
