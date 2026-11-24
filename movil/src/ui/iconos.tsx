/** Íconos de trazo, en el mismo estilo que los de la web (zonas y pictogramas del ranking). */
const svg = (d: React.ReactNode, vb = "0 0 24 24") => <svg viewBox={vb} aria-hidden="true">{d}</svg>;

export const IcoSimulador = () => svg(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /><circle cx="16" cy="9" r="2" /></>);
export const IcoQuiz = () => svg(<><path d="M9 4h6M8 4h8a2 2 0 0 1 2 2v14H6V6a2 2 0 0 1 2-2z" /><path d="M9.5 11l1.8 1.8L15 9.2M9.5 16.5h5" /></>);
export const IcoPlan = () => svg(<><path d="M12 3l2.6 5.5 6 .8-4.4 4.1 1.1 6L12 16.6 6.7 19.4l1.1-6L3.4 9.3l6-.8z" /></>);

export const IcoZona = {
  todo: () => svg(<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />),
  bancos: () => svg(<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />),
  fondos: () => svg(<path d="M4 18l5-6 4 3 7-9M15 6h5v5" />),
  pension: () => svg(<path d="M12 3a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8zM12 11v7a2 2 0 0 0 4 0" />),
  casa: () => svg(<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />),
};

export function Picto({ id }: { id: string }) {
  if (id === "apv_a") return <span className="picto" title="Pensión">{svg(<><path d="M5 15l11-9 11 9M8 13v13h16V13" /><path d="M14 26v-6h4v6" /></>, "0 0 32 32")}</span>;
  if (id === "cuenta_vista_mas" || id === "dap_ripley_30")
    return <span className="picto" title="Banco">{svg(<><path d="M5 13h22M7 13v12M25 13v12M4 25h24M6 13l10-7 10 7" /><path d="M12 25v-6h8v6" /><path d="M11 16h2M19 16h2" /></>, "0 0 32 32")}</span>;
  return <span className="picto" title="Fondo mutuo">{svg(<><path d="M11 28V5h10v23M8 28h16" /><path d="M14 9h4M14 13h4M14 17h4M14 21h4" /><path d="M16 5V2" /></>, "0 0 32 32")}</span>;
}

export const IcoCompartir = () => svg(<><path d="M12 15V3M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></>);
