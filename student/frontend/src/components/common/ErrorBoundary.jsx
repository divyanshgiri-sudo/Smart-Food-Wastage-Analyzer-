import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled render error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#f8fafc' }}>
          <div className="card" style={{ maxWidth: 480, width: '100%', padding: '28px 24px', textAlign: 'center', background: '#ffffff', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
            <span style={{ fontSize: 36, display: 'block', marginBottom: 12 }} aria-hidden="true">⚠️</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>
              Something unexpected happened
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: 20 }}>
              The student dashboard encountered a display issue. Your preferences and records are safe.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={this.handleReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Reload dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
