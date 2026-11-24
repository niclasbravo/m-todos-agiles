/** Armazón: barra superior con el tema, tres pestañas (Simulador, Quiz, Mi plan) y el estado compartido. */
import { useEffect, useRef, useState } from "react";
import { guardarPerfil, guardarTema, leerPerfil, temaElegido, temaInicial, type PerfilGuardado, type Tema } from "../almacen";
import { SIM_DEFECTO, type Entrada } from "../logica/formularios";
import type { Respuestas } from "../logica/recomendador";
import { alVolver, barraDeEstado, vibrar } from "../nativo";
import { IcoPlan, IcoQuiz, IcoSimulador } from "./iconos";
import { Quiz } from "./Quiz";
import { Resultado } from "./Resultado";
import { Simulador } from "./Simulador";

type Pestana = "simulador" | "quiz" | "plan";
const ORDEN: Pestana[] = ["simulador", "quiz", "plan"];

export function App() {
  const [tema, setTema] = useState<Tema>(temaInicial);
  const [pestana, setPestana] = useState<Pestana>("simulador");
  const [simEntrada, setSimEntrada] = useState<Entrada>({ ...SIM_DEFECTO });
  const [destacar, setDestacar] = useState<string[]>([]);
  const [perfil, setPerfil] = useState<PerfilGuardado | null>(leerPerfil);
  const [resp, setResp] = useState<Respuestas | null>(() => leerPerfil());
  const [ver, setVer] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<Entrada>({});
  const [estadoPerfil, setEstadoPerfil] = useState("");
  const [quizKey, setQuizKey] = useState(0);
  const raices = { simulador: useRef<HTMLElement>(null), quiz: useRef<HTMLElement>(null), plan: useRef<HTMLElement>(null) };

  // Tema: sigue al sistema hasta que la persona elige uno.
  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    barraDeEstado(tema === "dark");
  }, [tema]);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const cambio = () => { if (!temaElegido()) setTema(mq.matches ? "dark" : "light"); };
    mq.addEventListener("change", cambio);
    return () => mq.removeEventListener("change", cambio);
  }, []);

  const ir = (p: Pestana, arriba = false) => {
    if (p !== pestana) vibrar();
    setPestana(p);
    if (arriba) requestAnimationFrame(() => raices[p].current?.scrollTo({ top: 0 }));
  };
  // Botón atrás: desde Quiz o Mi plan vuelve al simulador (las hojas y el quiz responden antes).
  useEffect(() => alVolver(() => { if (pestana !== "simulador") { ir("simulador"); return true; } return false; }));

  function verResultado(r: Respuestas) {
    setEstadoPerfil(guardarPerfil(r));
    setPerfil(leerPerfil());
    setResp(r); setVer(null); setAjuste({});
    ir("plan", true);
  }

  const lado = (p: Pestana) => {
    const a = ORDEN.indexOf(pestana), b = ORDEN.indexOf(p);
    return a === b ? undefined : b < a ? "izq" : "der";
  };

  const pestanas: [Pestana, string, () => React.JSX.Element][] = [["simulador", "Simulador", IcoSimulador], ["quiz", "Quiz", IcoQuiz], ["plan", "Mi plan", IcoPlan]];

  return (
    <div className="app">
      <header className="barra-sup">
        <span className="wordmark"><span className="moneda" aria-hidden="true">$</span>¿Dónde ahorro?</span>
        <button type="button" className="tema" aria-label={tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          onClick={() => { vibrar(); const n = tema === "dark" ? "light" : "dark"; guardarTema(n); setTema(n); }}>
          <span className="luna" aria-hidden="true" /><span className="sol" aria-hidden="true" />
        </button>
      </header>

      <div className="pantallas">
        <main className="pantalla" ref={raices.simulador} data-lado={lado("simulador")} aria-hidden={pestana !== "simulador"}>
          <Simulador entrada={simEntrada} onEntrada={setSimEntrada} destacar={destacar} perfil={perfil} raiz={raices.simulador}
            irQuiz={() => ir("quiz", true)}
            verPerfil={() => { const p = leerPerfil(); if (p) { setResp(p); setVer(null); setAjuste({}); setEstadoPerfil(guardarPerfil(p)); } ir("plan", true); }} />
        </main>
        <main className="pantalla" ref={raices.quiz} data-lado={lado("quiz")} aria-hidden={pestana !== "quiz"}>
          <Quiz key={quizKey} perfil={perfil} activo={pestana === "quiz"} raiz={raices.quiz} onResultado={verResultado}
            onBorrarPerfil={() => { setPerfil(null); setResp(null); setEstadoPerfil(""); }} />
        </main>
        <main className="pantalla" ref={raices.plan} data-lado={lado("plan")} aria-hidden={pestana !== "plan"}>
          <Resultado resp={resp} ver={ver} ajuste={ajuste} estadoPerfil={estadoPerfil} raiz={raices.plan}
            onVer={setVer} onAjuste={setAjuste}
            irSimulador={(e, d) => { setSimEntrada({ ...SIM_DEFECTO, ...e }); setDestacar(d); ir("simulador", true); }}
            irQuiz={() => { setQuizKey((k) => k + 1); ir("quiz", true); }} />
        </main>
      </div>

      <nav className="tabbar" aria-label="Secciones">
        {pestanas.map(([p, t, I]) => (
          <button key={p} type="button" className={pestana === p ? "on" : ""} aria-current={pestana === p ? "page" : undefined} onClick={() => ir(p, pestana === p)}>
            <I />{t}
          </button>
        ))}
      </nav>
    </div>
  );
}
