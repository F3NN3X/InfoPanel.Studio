import { Component, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/** The message a failed zone shows (first line only, kept short). */
export function zoneErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const line = raw.split("\n")[0].trim() || "Unknown error";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

/**
 * Run a widget's render function; a throw becomes the zone's error tile
 * instead of taking down the whole grid. (Errors thrown while React
 * renders the returned elements are caught by `ZoneErrorBoundary`.)
 */
export function safeRender(title: string, render: () => ReactNode): ReactNode {
  try {
    return render();
  } catch (error) {
    return <ZoneError title={title} message={zoneErrorMessage(error)} />;
  }
}

export function ZoneError({ title, message }: { title: string; message: string }) {
  return (
    <div
      role="alert"
      className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed border-[color:var(--alert-critical)]/50 bg-card/40 p-3 text-center"
    >
      <TriangleAlert className="h-4 w-4 shrink-0 text-[color:var(--alert-critical)]" aria-hidden />
      <div className="truncate text-xs font-medium text-foreground">{title} failed to render</div>
      <div className="line-clamp-2 text-[10px] text-muted-foreground">{message}</div>
    </div>
  );
}

interface ZoneErrorBoundaryProps {
  title: string;
  /** Any change (new settings, new widget type) clears a caught error. */
  resetKey: unknown;
  children: ReactNode;
}

interface ZoneErrorBoundaryState {
  error: unknown;
  resetKey: unknown;
}

/** Keeps one failing zone from blanking the kiosk or the studio canvas. */
export class ZoneErrorBoundary extends Component<ZoneErrorBoundaryProps, ZoneErrorBoundaryState> {
  state: ZoneErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<ZoneErrorBoundaryState> {
    return { error: error ?? new Error("Unknown error") };
  }

  static getDerivedStateFromProps(
    props: ZoneErrorBoundaryProps,
    state: ZoneErrorBoundaryState
  ): Partial<ZoneErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  render() {
    if (this.state.error)
      return <ZoneError title={this.props.title} message={zoneErrorMessage(this.state.error)} />;
    return this.props.children;
  }
}
