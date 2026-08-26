import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || "Unknown error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#060A14] flex items-center justify-center p-6">
          <div className="bg-[#0E1524] border border-red-900/50 rounded-2xl p-8 max-w-md w-full text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-white text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-gray-400 text-sm mb-6">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-[#3B6FFF] hover:bg-[#2558e8] text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
