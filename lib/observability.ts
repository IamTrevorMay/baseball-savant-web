/**
 * Lightweight observability primitives.
 *
 * Structured JSON logging + a single error-reporting chokepoint. Today it writes
 * structured lines to stdout/stderr (greppable in Vercel logs); when a real
 * aggregator is wired (Sentry SDK etc.), do it HERE in `reportError` so every
 * call site benefits without changes. Sentry needs a project DSN — see
 * SENTRY_DSN env + the note in PLANNING (Observability).
 */

type Fields = Record<string, unknown>

function emit(stream: 'log' | 'error', payload: Fields) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...payload })
    if (stream === 'error') console.error(line)
    else console.log(line)
  } catch {
    // never let logging throw
  }
}

/** Structured request/operational event (duration, counts, cache hits, …). */
export function logApiEvent(fields: Fields): void {
  emit('log', { kind: 'api', ...fields })
}

/** Single chokepoint for error reporting. Plug Sentry/etc. in here. */
export function reportError(error: unknown, context?: Fields): void {
  const e =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) }
  emit('error', { kind: 'error', ...e, ...context })
  // TODO(observability): if (process.env.SENTRY_DSN) Sentry.captureException(error, { extra: context })
}

/** Wrap an API route handler to log method/path/status/duration + report errors. */
export function withApiLogging(
  route: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const start = Date.now()
    try {
      const res = await handler(req)
      logApiEvent({ route, method: req.method, status: res.status, ms: Date.now() - start })
      return res
    } catch (err) {
      reportError(err, { route, method: req.method, ms: Date.now() - start })
      throw err
    }
  }
}
