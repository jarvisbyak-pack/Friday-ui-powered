import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";

const MAX_RESPONSE_BYTES = 2_000_000;
const ALLOWED_PORTS = new Set(["", "80", "443"]);

type ResolvedAddress = { address: string; family: number };

function ipv4Number(address: string): number {
  return address.split(".").reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
}

function inIpv4Range(address: string, network: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(network) & mask);
}

function ipv6Number(address: string): bigint | undefined {
  let value = address.toLowerCase().split("%")[0]!;
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = value.slice(lastColon + 1);
    if (isIP(ipv4) !== 4) return undefined;
    const octets = ipv4.split(".").map(Number);
    const high = ((octets[0]! << 8) | octets[1]!).toString(16);
    const low = ((octets[2]! << 8) | octets[3]!).toString(16);
    value = `${value.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0]!.split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1]!.split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return undefined;

  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return undefined;

  return groups.reduce((result, group) => (result << 16n) | BigInt(parseInt(group, 16)), 0n);
}

function inIpv6Range(address: bigint, network: string, prefix: number): boolean {
  const networkValue = ipv6Number(network);
  if (networkValue === undefined) return false;
  const shift = BigInt(128 - prefix);
  const mask = ((1n << BigInt(prefix)) - 1n) << shift;
  return (address & mask) === (networkValue & mask);
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const blocked = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
    ] as const;
    return !blocked.some(([network, prefix]) => inIpv4Range(address, network, prefix));
  }

  if (family === 6) {
    const value = ipv6Number(address);
    if (value === undefined) return false;

    // IPv4-mapped IPv6 addresses inherit the IPv4 address classification.
    if (value >> 32n === 0xffffn) {
      const ipv4 = Number(value & 0xffffffffn);
      const mapped = [
        (ipv4 >>> 24) & 255,
        (ipv4 >>> 16) & 255,
        (ipv4 >>> 8) & 255,
        ipv4 & 255
      ].join(".");
      return isPublicAddress(mapped);
    }

    // Accept only global-unicast 2000::/3 and reject special-purpose,
    // transition, and documentation ranges inside that allocation.
    if (value >> 125n !== 1n) return false;
    const blocked = [
      ["2001::", 23],    // IETF protocol assignments, including Teredo
      ["2002::", 16],    // 6to4 transition addresses
      ["3fff::", 20]     // IPv6 documentation range
    ] as const;
    return !blocked.some(([network, prefix]) => inIpv6Range(value, network, prefix));
  }

  return false;
}

async function resolvePublicAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const normalized = hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(normalized);
  const addresses = literalFamily
    ? [{ address: normalized, family: literalFamily }]
    : await lookup(normalized, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
    throw new Error("Private, reserved, or non-public network addresses are not allowed.");
  }
  return addresses;
}

function validateUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS URLs are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not allowed.");
  if (!ALLOWED_PORTS.has(url.port)) throw new Error("Only standard HTTP and HTTPS ports are supported.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) {
    throw new Error("Local network hosts are not allowed.");
  }
  return url;
}

function requestPinned(url: URL, addresses: ResolvedAddress[], timeoutMs: number): Promise<{ response: IncomingMessage; chunks: Buffer[]; size: number }> {
  const transport = url.protocol === "https:" ? https : http;
  const request = transport.request(url, {
    method: "GET",
    headers: { "User-Agent": "Friday-Agent/0.1", Accept: "text/html,text/plain,application/json,*/*" },
    servername: isIP(url.hostname.replace(/^\[|\]$/g, "")) ? undefined : url.hostname,
    lookup: (_hostname, options, callback) => {
      const selected = addresses[0]!;
      if (options && typeof options === "object" && "all" in options && options.all) {
        (callback as (error: NodeJS.ErrnoException | null, addresses: ResolvedAddress[]) => void)(null, addresses);
      } else {
        (callback as (error: NodeJS.ErrnoException | null, address: string, family: number) => void)(null, selected.address, selected.family);
      }
    }
  });

  return new Promise((resolve, reject) => {
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Web request timed out.")));
    request.on("error", reject);
    request.on("response", response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error("Web response exceeds the 2 MB limit."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => resolve({ response, chunks, size }));
      response.on("error", reject);
    });
    request.end();
  });
}

export class WebFetchService {
  async fetchText(input: string, timeoutMs = 15000): Promise<{
    url: string;
    status: number;
    contentType: string;
    text: string;
  }> {
    const url = validateUrl(input);
    const addresses = await resolvePublicAddresses(url.hostname);
    const boundedTimeout = Number.isFinite(timeoutMs) ? Math.min(Math.max(timeoutMs, 1000), 30000) : 15000;
    const result = await requestPinned(url, addresses, boundedTimeout);
    if (result.response.statusCode && result.response.statusCode >= 300 && result.response.statusCode < 400) {
      throw new Error("Redirect responses are not allowed by the web fetch tool.");
    }
    return {
      url: url.toString(),
      status: result.response.statusCode ?? 0,
      contentType: result.response.headers["content-type"] ?? "application/octet-stream",
      text: Buffer.concat(result.chunks, result.size).toString("utf8")
    };
  }
}

export const webFetchSecurity = { isPublicAddress, validateUrl };
