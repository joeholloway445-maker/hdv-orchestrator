/**
 * observability/index.ts — public surface of the HDV orchestrator observability layer.
 *
 * Ported from HDV_Foundation/observability/index.ts and adapted for the DAG executor.
 * All observability is strictly out-of-band: it meters completed node executions and
 * never influences scheduling, routing, or security decisions.
 *
 * Usage:
 *   import { ExecutionMetrics, ExecutionTracer, combineObservers } from './hdv/observability';
 *
 *   const metrics = new ExecutionMetrics();
 *   const tracer  = new ExecutionTracer({ capacity: 512 });
 *   const observe = combineObservers(metrics.observer(), tracer.observer());
 *   // pass `observe` to the DAG executor's observer hook
 */
import type { ExecutionObserver } from './metrics.js';

export { ExecutionMetrics, LATENCY_BUCKETS_MS, DEFAULT_ACTIVE_WINDOW_MS } from './metrics.js';
export type {
  ExecutionEvent,
  ExecutionObserver,
  ExecutionStatus,
  MetricsSnapshot,
  HistogramSnapshot,
  MetricsCollectorOptions,
} from './metrics.js';

export { ExecutionTracer, DEFAULT_TRACE_CAPACITY } from './trace.js';
export type { TraceSpan, ExecutionTracerOptions } from './trace.js';

/**
 * Fan a single execution event out to several observers. Handy when both metrics and tracing
 * must observe the same executor, which accepts only one observer hook. Each observer is
 * isolated: one throwing never starves the others.
 */
export function combineObservers(...observers: (ExecutionObserver | undefined)[]): ExecutionObserver {
  const active = observers.filter((o): o is ExecutionObserver => typeof o === 'function');
  return (event) => {
    for (const observe of active) {
      try {
        observe(event);
      } catch {
        // Best-effort metering: never let one sink break another.
      }
    }
  };
}
