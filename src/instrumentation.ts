// Runs once when the server starts, before any request: turns on log redaction for the server's secrets.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installRedactor } = await import("./lib/env-guard");
  installRedactor();
}
