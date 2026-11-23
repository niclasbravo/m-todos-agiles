import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "cl.dondeahorro.app",
  appName: "¿Dónde ahorro?",
  webDir: "dist",
  backgroundColor: "#f2f4f7",
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, launchAutoHide: false, backgroundColor: "#c4e0ee", showSpinner: false },
    // Capacitor 8 dibuja de borde a borde y entrega los márgenes seguros como --safe-area-inset-* (los usa estilos.css).
    SystemBars: { insetsHandling: "css" },
  },
};

export default config;
