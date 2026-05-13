import { Component, ErrorInfo, ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Wave] Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <div className="error-boundary__icon">⚠️</div>
            <h1 className="error-boundary__title">Wave encountered a crash</h1>
            <p className="error-boundary__message">
              Something went wrong. Don't worry, your conversations are safe.
            </p>
            {this.state.error && (
              <pre className="error-boundary__debug">
                {this.state.error.message}
              </pre>
            )}
            <button className="error-boundary__button" onClick={this.handleReload}>
              Reload Wave
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
