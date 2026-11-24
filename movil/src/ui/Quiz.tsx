/** Pestaña Quiz: una pregunta por pantalla, progreso, avance automático, mini isla 3D y resumen en vivo. */
import { useEffect, useRef, useState } from "react";
import { borrarPerfil, fechaLarga, type PerfilGuardado } from "../almacen";
import { IslaQuiz } from "../escenas3d/isla";
import { INSTRUMENTOS } from "../logica/instrumentos";
import { validarQuiz, type Errores as TErrores } from "../logica/formularios";
import { CAPACIDAD_INGRESOS, PLAZOS, PREGUNTAS, TOLERANCIA_CAIDA, type Respuestas } from "../logica/recomendador";
import { alVolver, vibrar } from "../nativo";
import { Errores } from "./comunes";

type Borrador = Partial<Record<"ingresos" | "plazo" | "caida" | "colchon", string>> & { monto?: string };
const CORTOS = ["Ingresos", "Plazo", "Si cae 10%", "Fondo de emergencia", "Monto"];
const PLAZO_MAX = Object.fromEntries(PLAZOS.map(([id, , max]) => [id, max])) as Record<string, number>;
const RAPIDOS = [100_000, 500_000, 1_000_000, 5_000_000];

/** Mismas reglas que motivos_descarte: una respuesta que falta no descarta nada todavía. */
function estado(b: Borrador) {
  const monto = parseInt(b.monto ?? "", 10);
  const tope = [b.caida && TOLERANCIA_CAIDA[b.caida as keyof typeof TOLERANCIA_CAIDA], b.ingresos && CAPACIDAD_INGRESOS[b.ingresos as keyof typeof CAPACIDAD_INGRESOS]].filter(Boolean) as number[];
  const riesgoMax = tope.length ? Math.min(...tope) : 5;
  const mesesMax = b.plazo ? PLAZO_MAX[b.plazo] : Infinity;
  const vivos = INSTRUMENTOS.map((d) => !((monto >= 0 && monto < d.monto_min) || mesesMax <= d.plazo_min_meses || d.riesgo > riesgoMax ||
    (d.exige_fondo_emergencia && b.colchon === "no")));
  const respondidas = (["ingresos", "plazo", "caida", "colchon"] as const).filter((k) => b[k]).length + (monto >= 0 ? 1 : 0);
  const perfil = tope.length === 2 ? (riesgoMax <= 2 ? "Conservador" : riesgoMax >= 5 ? "Agresivo" : "Moderado") : null;
  return { vivos, respondidas, perfil };
}

interface Props {
  perfil: PerfilGuardado | null;
  onResultado: (r: Respuestas) => void;
  onBorrarPerfil: () => void;
  activo: boolean;
  raiz: React.RefObject<HTMLElement | null>;
}

export function Quiz({ perfil, onResultado, onBorrarPerfil, activo, raiz }: Props) {
  const [b, setB] = useState<Borrador>(() => (perfil ? {
    ingresos: perfil.ingresos, plazo: perfil.plazo, caida: perfil.caida, colchon: perfil.colchon, monto: String(perfil.monto),
  } : {}));
  const [paso, setPaso] = useState(0);
  const [dir, setDir] = useState(1);
  const [errores, setErrores] = useState<TErrores>({});
  const total = PREGUNTAS.length + 1;
  const e = estado(b);

  // Mini isla 3D.
  const lienzo = useRef<HTMLDivElement>(null), isla = useRef<IslaQuiz | null>(null);
  const [con3d, setCon3d] = useState(true);
  useEffect(() => {
    const i = new IslaQuiz(lienzo.current!, INSTRUMENTOS.map((x) => x.nombre));
    if (!i.ok) { setCon3d(false); return; }
    isla.current = i;
    return () => { i.destruir(); isla.current = null; };
  }, []);
  useEffect(() => { isla.current?.actualizar(e.vivos); }, [e.vivos.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const vivos = e.vivos.filter(Boolean).length;
  const [late, setLate] = useState(false);
  const previo = useRef(vivos);
  useEffect(() => {
    if (previo.current !== vivos) { setLate(false); requestAnimationFrame(() => setLate(true)); }
    previo.current = vivos;
  }, [vivos]);

  const ir = (i: number) => {
    const n = Math.max(0, Math.min(total - 1, i));
    setDir(n >= paso ? 1 : -1); setPaso(n);
  };
  // Botón atrás de Android: retrocede una pregunta.
  useEffect(() => (activo ? alVolver(() => { if (paso > 0) { ir(paso - 1); return true; } return false; }) : undefined)); // eslint-disable-line react-hooks/exhaustive-deps

  const respondido = (i: number) => (i < PREGUNTAS.length ? !!b[PREGUNTAS[i].id] : (b.monto ?? "") !== "");
  const espera = useRef(0);
  function elegir(id: string, valor: string) {
    vibrar();
    setB((x) => ({ ...x, [id]: valor }));
    setErrores((x) => { const y = { ...x }; delete y[id]; return y; });
    clearTimeout(espera.current);
    if (paso < total - 1) espera.current = window.setTimeout(() => ir(paso + 1), 280);
  }
  function enviar() {
    const v = validarQuiz(b);
    if (!v.ok) {
      vibrar(true);
      setErrores(v.errores);
      const conError = [...PREGUNTAS.map((p) => p.id), "monto"].findIndex((k) => v.errores[k]);
      if (conError >= 0) ir(conError);
      return;
    }
    vibrar(true);
    setErrores({});
    onResultado(v.datos);
  }

  // Atajos de teclado (para la demo en computador): 1–5 responde, flechas mueven.
  useEffect(() => {
    if (!activo) return;
    const tecla = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "radio") {
        if (ev.key === "ArrowLeft" && !(t as HTMLInputElement).value) ir(paso - 1);
        if (ev.key === "Enter") { ev.preventDefault(); enviar(); }
        return;
      }
      const n = parseInt(ev.key, 10);
      const p = PREGUNTAS[paso];
      if (p && n >= 1 && n <= p.opciones.length) { ev.preventDefault(); elegir(p.id, p.opciones[n - 1][0]); }
      else if (ev.key === "ArrowRight" || (ev.key === "Enter" && p)) { ev.preventDefault(); if (respondido(paso)) ir(paso + 1); }
      else if (ev.key === "ArrowLeft") { ev.preventDefault(); ir(paso - 1); }
    };
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  });

  const p = PREGUNTAS[paso];
  const textoResp = (i: number) => {
    if (i < PREGUNTAS.length) {
      const q = PREGUNTAS[i], val = b[q.id];
      return val ? q.opciones.find(([v]) => v === val)?.[1] ?? "Sin responder" : "Sin responder";
    }
    return b.monto ? "$" + Number(b.monto).toLocaleString("es-CL") : "Sin responder";
  };

  return (
    <>
      <h1>¿Con qué opción conviene partir?</h1>
      <p className="lead">Responde 4 preguntas e indica tu monto. Te mostramos hasta 3 opciones, con las razones y lo que descartamos. Es una orientación educativa, no asesoría financiera.</p>
      {perfil && <p className="aviso ok">
        Tienes un perfil guardado en este teléfono{perfil.actualizado ? ` (${fechaLarga(perfil.actualizado)})` : ""}. Cargamos tus respuestas: cámbialas si algo cambió y vuelve a enviar.{" "}
        <button type="button" className="link" onClick={() => onResultado(perfil)}>Ver mi recomendación con este perfil</button>{" "}
        <button type="button" className="btn sec chico" style={{ marginTop: 6 }} onClick={() => { borrarPerfil(); onBorrarPerfil(); setB({}); setPaso(0); }}>Borrar mi perfil</button>
      </p>}

      <div className="tarjeta medidor">
        <div className="medidor-3d" ref={lienzo} aria-hidden="true" style={con3d ? undefined : { display: "none" }} />
        <p className={"medidor-perfil" + (late ? " cambia" : "")} aria-live="polite" style={con3d ? undefined : { gridColumn: "1 / -1" }}>
          <span>Opciones que siguen en juego</span><strong>{vivos} de 7</strong>
          <small>{e.respondidas === 0 ? "Se van descartando a medida que respondes" : e.perfil ? `Perfil ${e.perfil.toLowerCase()}` : "Sigue respondiendo"}</small>
        </p>
      </div>

      <form className="tarjeta quiz" onSubmit={(ev) => { ev.preventDefault(); enviar(); }} noValidate>
        <div className="progreso"><span aria-live="polite">Pregunta {paso + 1} de {total}</span><span className="barra-p"><i style={{ width: `${(paso + 1) / total * 100}%` }} /></span></div>
        <div className={"paso" + (dir < 0 ? " atras" : "")} key={paso}>
          {p ? <fieldset>
            <legend>{paso + 1}. {p.texto}</legend>
            {p.opciones.map(([valor, texto], k) => (
              <label key={valor} className={"op" + (b[p.id] === valor ? " marcada" : "")}>
                <input type="radio" name={p.id} value={valor} checked={b[p.id] === valor} onChange={() => elegir(p.id, valor)} />
                <span className="radio" aria-hidden="true" /><span>{texto}</span><span className="tecla" aria-hidden="true">{k + 1}</span>
              </label>
            ))}
            <Errores lista={errores[p.id]} />
          </fieldset> : <fieldset>
            <legend>Tu monto</legend>
            <label htmlFor="q-monto">¿Cuánto quieres ahorrar o invertir? (CLP)</label>
            <input id="q-monto" className="monto-grande" type="number" inputMode="numeric" min={1} value={b.monto ?? ""} autoFocus={activo}
              onChange={(ev) => { setB({ ...b, monto: ev.target.value }); setErrores((x) => { const y = { ...x }; delete y.monto; return y; }); }} />
            <div className="montos-rapidos">{RAPIDOS.map((m) => <button key={m} type="button" onClick={() => { vibrar(); setB({ ...b, monto: String(m) }); }}>{"$" + m.toLocaleString("es-CL")}</button>)}</div>
            <Errores lista={errores.monto} />
          </fieldset>}
        </div>
        <div className="nav-pasos">
          <button type="button" className="btn sec atras" disabled={paso === 0} onClick={() => { vibrar(); ir(paso - 1); }}>Atrás</button>
          {paso < total - 1
            ? <button type="button" className="btn sig" disabled={!respondido(paso)} onClick={() => { vibrar(); ir(paso + 1); }}>Siguiente</button>
            : <button type="submit" className="btn sig">Ver mi recomendación</button>}
        </div>
      </form>

      <section className="tarjeta resumen" aria-label="Tus respuestas">
        <ol>
          {CORTOS.map((c, k) => (
            <li key={c} className={(respondido(k) ? "hecho" : "") + (k === paso ? " ahora" : "")}>
              <span className="ok" aria-hidden="true" />
              <button type="button" onClick={() => { ir(k); raiz.current?.scrollTo({ top: 0, behavior: "smooth" }); }}>{c}<b>{textoResp(k)}</b></button>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
