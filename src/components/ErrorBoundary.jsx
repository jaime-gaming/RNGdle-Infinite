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
      console.error(
        "[RNGdle] Render error caught by boundary:",
        error,
        errorInfo,
      );
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
            fontFamily: "Inter, system-ui, -apple-system, sans-serif",
            color: "var(--text, #1a1a1a)",
            background: "var(--bg, #fff)",
          }}
        >
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            Something went wrong
          </h2>
          <p style={{ maxWidth: 520, opacity: 0.8, lineHeight: 1.5 }}>
            The page encountered an error and could not be displayed. Your progress and
            profile are saved in this browser and won't be lost upon reloading.
            Try reloading or going back to the home page.
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
              Technical details
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
              {this.state.error?.stack
                ? `\n\n${this.state.error.stack.slice(0, 2000)}`
                : ""}
            </pre>
          </details>
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button
              className="primary-button"
              onClick={this.handleReload}
              style={{ minWidth: 140 }}
            >
              Reload page
            </button>
            <button
              className="secondary-button"
              onClick={this.handleReset}
              style={{ minWidth: 140 }}
            >
              Try again
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
              Go to home
            </button>
          </div>
          <small style={{ opacity: 0.6 }}>
            If this keeps happening, try clearing your cache or opening in another
            tab. The backup can be found in Settings.
          </small>
        </div>
      );
    }
    return this.props.children;
  }
}
