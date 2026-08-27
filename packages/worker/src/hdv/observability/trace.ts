/**
 * observability/trace.ts — ExecutionTracer for the HDV DAG executor.
 *
 * Ported from HDV_Foundation/observability/trace.ts and adapted for the orchestrator:
 * - DispatchEvent (APEX router) → ExecutionEvent (DAG node execution)
 * - TraceSpan fields adapted: source/dest pair → nodeId/nodeType
 *
 * A lightweight, fixed-size in-memory ring buffer of node execution trace spans. Plugs into
 * the executor's read-only ExecutionObserver seam. Each span is a compact projection of the
 * event (no payload content is retained — only execution metadata). The buffer is bounded
 * so tracing is safe to leave on indefinitely without unbounded memory growth.
 */
import type { ExecutionEvent, ExecutionObserver, ExecutionStatus } from './metrics.js';

export interface TraceSpan {
  executionId: string;
  nodeId: string;
  nodeType: string;
  /** Node execution duration in milliseconds. */
  durationMs: number;
  status: ExecutionStatus;
  /** Wall-clock timestamp when the span was recorded (ms since epoch). */
  at: number;
}

export const DEFAULT_TRACE_CAPACITY = 256;

export interface ExecutionTracerOptions {
  /** Max spans retained before the oldest are overwritten. Default 256. */
  capacity?: number;
  /** Injectable clock (ms). Defaults to `Date.now`. */
  now?: () => number;
}

export class ExecutionTracer {
  readonly capacity: number;
  private readonly now: () => number;
  private readonly buffer: TraceSpan[] = [];
  /** Next write index within the ring. */
  private cursor = 0;
  private filled = 0;

  constructor(options: ExecutionTracerOptions = {}) {
    const cap = options.capacity ?? DEFAULT_TRACE_CAPACITY;
    this.capacity = cap > 0 ? Math.floor(cap) : DEFAULT_TRACE_CAPACITY;
    this.now = options.now ?? Date.now;
  }

  /** Bind this tracer as an ExecutionObserver. */
  observer(): ExecutionObserver {
    return (event: ExecutionEvent) => this.record(event);
  }

  /** Append a span derived from an execution event (overwriting the oldest when full). */
  record(event: ExecutionEvent): void {
    const span: TraceSpan = {
      executionId: event.executionId,
      nodeId: event.nodeId,
      nodeType: event.nodeType,
      durationMs: event.durationMs,
      status: event.status,
      at: this.now(),
    };
    this.buffer[this.cursor] = span;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled += 1;
  }

  /** Number of spans currently retained. */
  get size(): number {
    return this.filled;
  }

  /** All retained spans in chronological order (oldest first). */
  spans(): TraceSpan[] {
    if (this.filled < this.capacity) {
      // Not yet wrapped: entries [0, cursor) are already in order.
      return this.buffer.slice(0, this.filled);
    }
    // Wrapped: oldest sits at `cursor`, newest at `cursor - 1`.
    return [...this.buffer.slice(this.cursor), ...this.buffer.slice(0, this.cursor)];
  }

  /** The most recent `n` spans (newest last), capped to what's retained. */
  recent(n: number): TraceSpan[] {
    const all = this.spans();
    if (!Number.isFinite(n) || n <= 0) return all;
    return all.slice(-Math.floor(n));
  }

  /** All spans for a specific workflow execution run. */
  forExecution(executionId: string): TraceSpan[] {
    return this.spans().filter((s) => s.executionId === executionId);
  }

  clear(): void {
    this.buffer.length = 0;
    this.cursor = 0;
    this.filled = 0;
  }
}
