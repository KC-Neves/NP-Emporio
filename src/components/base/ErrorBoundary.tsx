import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] caught error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-np-wood-50 p-4">
          <div className="bg-white rounded-2xl border border-np-wood-200 p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-error-warning-line text-3xl text-red-600"></i>
            </div>
            <h2 className="font-display text-xl text-np-purple-900 mb-2">
              Algo deu errado
            </h2>
            <p className="text-sm text-np-purple-600 mb-4">
              Ocorreu um erro inesperado. Não se preocupe, seus dados estão
              seguros.
            </p>
            {this.state.error && (
              <div className="bg-np-wood-50 rounded-lg p-3 mb-4 text-left">
                <p className="text-xs text-np-purple-500 font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={this.handleReload}
                className="flex-1 bg-np-purple-700 hover:bg-np-purple-800 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                <i className="ri-refresh-line mr-1"></i>
                Recarregar
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex-1 border border-np-wood-300 text-np-purple-700 hover:bg-np-wood-50 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm whitespace-nowrap"
              >
                <i className="ri-home-line mr-1"></i>
                Início
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}