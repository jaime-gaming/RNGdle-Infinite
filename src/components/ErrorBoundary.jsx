import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log for debugging – never blank page silently
    try {
      console.error("[RNGdle] Render error caught by boundary:", error, errorInfo);
    } catch {}
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Try to recover by reloading – keep save safe (save is in localStorage, not cleared)
    try {
      if (this.props.onReset) this.props.onReset();
    } catch {}
  };

  handleReload = () => {
    try {
      window.location.reload();
    } catch {
      window.location.href = window.location.href;
    }
  };

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || "Unknown error";
      return (
        <div
          style={{
            minHeight: "60vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
            gap: "16px",
            fontFamily:
              "Inter, system-ui, -apple-system, sans-serif",
            color: "var(--text, #1a1a1a)",
            background: "var(--bg, #fff)",
          }}
        >
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            Algo salió mal
          </h2>
          <p style={{ maxWidth: 520, opacity: 0.8, lineHeight: 1.5 }}>
            La página encontró un error y no pudo mostrarse. Tu progreso y perfil están
            guardados en este navegador y no se borran al recargar. Prueba recargar o volver al inicio.
          </p>
          <details
            style={{
              maxWidth: 600,
              width: "100%",
              textAlign: "left",
              background: "var(--surface, #f5f5f5)",
              border: "1px solid var(--border, #e5e5e5)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              Detalles técnicos
            </summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
                marginTop: 8,
                opacity: 0.9,
              }}
            >
              {String(message)}
              {this.state.error?.stack ? `\n\n${this.state.error.stack.slice(0, 2000)}` : ""}
            </pre>
          </details>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              className="primary-button"
              onClick={this.handleReload}
              style={{ minWidth: 140 }}
            >
              Recargar página
            </button>
            <button
              className="secondary-button"
              onClick={this.handleReset}
              style={{ minWidth: 140 }}
            >
              Intentar de nuevo
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                try {
                  window.location.href = "/";
                } catch {}
              }}
              style={{ minWidth: 140 }}
            >
              Ir al inicio
            </button>
          </div>
          <small style={{ opacity: 0.6 }}>
            Si esto sigue ocurriendo, prueba borrar caché o abrir en otra pestaña. El backup está en Ajustes.
          </small>
        </div>
      );
    }
    return this.props.children;
  }
}
