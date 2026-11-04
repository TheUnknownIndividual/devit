// The few Workers runtime types this Worker uses, so it typechecks without @cloudflare/workers-types.
// `npx wrangler types` generates the full set if the Worker grows.
interface ExecutionContext { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void }
interface ExportedHandler<E> { fetch?(req: Request, env: E, ctx: ExecutionContext): Response | Promise<Response> }
interface CacheStorage { readonly default: Cache }
