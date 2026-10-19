import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { App } from "./App";
import "./styles.css";
import "./components.css";
import "./tasks.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1 },
  },
});

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Utilitaire frontend render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="render-error-screen">
          <div className="render-error-card">
            <span className="eyebrow">Erreur d’affichage</span>
            <h1>Une vue n’a pas pu être affichée.</h1>
            <p>{this.state.error.message}</p>
            <button className="primary-button" onClick={() => window.location.reload()}>
              Recharger l’application
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Utilitaire service worker registration failed", error);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
