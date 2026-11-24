import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-700.css";
import "@fontsource/bricolage-grotesque/latin-800.css";
import "./estilos.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { iniciarNativo } from "./nativo";
import { App } from "./ui/App";

iniciarNativo();
createRoot(document.getElementById("app")!).render(<StrictMode><App /></StrictMode>);
