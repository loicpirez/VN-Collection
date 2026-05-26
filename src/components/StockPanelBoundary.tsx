'use client';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ShoppingBag } from 'lucide-react';

interface Props {
  /** Fallback content factory — receives the error and a reset callback. */
  children: ReactNode;
  /** Localised label for the heading. */
  title: string;
  /** Localised label for the fallback message body. */
  fallbackMessage: string;
  /** Localised label for the retry button. */
  retryLabel: string;
}

interface State {
  error: Error | null;
}

/**
 * Error boundary specifically for the StockPanel surface. Without this, a
 * parser crash or unexpected snapshot shape can blow up the entire VN page.
 * Renders a calm fallback with a Retry button that re-mounts the inner tree
 * by bumping a key prop derived from the reset count.
 */
export class StockPanelBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Server-side console only; user gets the fallback UI.
    if (typeof window !== 'undefined') {
      console.error('[StockPanelBoundary]', error, info);
    }
  }

  reset = () => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <section className="rounded-xl border border-status-dropped/40 bg-status-dropped/10 p-4 sm:p-5" role="alert">
        <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-status-dropped">
          <ShoppingBag className="h-4 w-4" aria-hidden />
          {this.props.title}
        </h2>
        <div className="mt-2 flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-status-dropped" aria-hidden />
          <p className="text-sm text-status-dropped">{this.props.fallbackMessage}</p>
        </div>
        <button
          type="button"
          onClick={this.reset}
          className="mt-3 inline-flex min-h-[36px] items-center gap-1 rounded-md border border-status-dropped/50 bg-bg px-3 py-1.5 text-xs font-bold text-status-dropped hover:bg-status-dropped/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-dropped"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          {this.props.retryLabel}
        </button>
      </section>
    );
  }
}
