import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { PlannerError } from "../planner/store";

const blocked = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]] as const) blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("3fff::", 20, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, "ipv4")
    : family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

export function endpointUrl(endpoint: string): URL {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")) {
    throw new PlannerError(400, "Use a public HTTPS endpoint on port 443 without credentials or a fragment.");
  }
  return url;
}

export async function resolveEndpoint(endpoint: string) {
  const url = endpointUrl(endpoint);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(hostname, { all: true }),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Endpoint lookup timed out")), 5000); }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
    throw new PlannerError(400, "The outgoing endpoint must resolve only to public internet addresses.");
  }
  return { url, address: addresses[0]! };
}

export async function postOutgoing(endpoint: string, payload: string, eventId: string): Promise<number> {
  const { url, address } = await resolveEndpoint(endpoint);
  // Pin the checked address while preserving TLS hostname verification. Never follow redirects.
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const req = request(url, {
      method: "POST", signal: controller.signal, agent: false,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload),
        "idempotency-key": eventId, "user-agent": "ProofFlow/1" },
    }, response => {
      const status = response.statusCode ?? 502;
      response.destroy();
      clearTimeout(timer);
      resolve(status);
    });
    req.on("error", error => { clearTimeout(timer); reject(error); });
    req.end(payload);
  });
}
