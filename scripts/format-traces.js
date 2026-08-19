#!/usr/bin/env node
/**
 * Pretty-prints the GizmoSQL ADBC driver's `console` trace exporter
 * output (one raw OTel span JSON object per line) into a compact
 * human-readable line. Any input that isn't span JSON — i.e. normal
 * dev-server output — passes through unchanged.
 *
 * Usage:
 *   GIZMOSQL_OTEL_TRACES_EXPORTER=console pnpm dev | node scripts/format-traces.js
 */
const readline = require('node:readline');

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const span = tryParseSpan(line);
  process.stdout.write((span ? formatSpan(span) : line) + '\n');
});

function tryParseSpan(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{"Name":')) return null;
  try {
    const obj = JSON.parse(trimmed);
    return obj.SpanContext && obj.StartTime && obj.EndTime ? obj : null;
  } catch {
    return null;
  }
}

function formatSpan(span) {
  const start = new Date(span.StartTime);
  const end = new Date(span.EndTime);
  const durationMs = end - start;
  const duration =
    durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)}s` : `${durationMs}ms`;
  const time = start.toLocaleTimeString('en-US', { hour12: false });
  const code = span.Status?.Code ?? 'Unknown';
  const status =
    code === 'Ok' ? 'OK' : `${code}${span.Status?.Description ? `: ${span.Status.Description}` : ''}`;
  const traceId = (span.SpanContext?.TraceID ?? '').slice(0, 8);

  return `[${time}] ${span.Name.padEnd(32)} ${duration.padStart(8)}  ${status}  (${traceId})`;
}
