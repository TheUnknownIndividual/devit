import { indexNowKey } from "@/lib/seo";

// The IndexNow key file, the same on every host, so Bing and friends accept our "these URLs changed" pings.
export function GET() {
  return new Response(indexNowKey(), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
