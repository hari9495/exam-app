import { BlockList, isIP } from 'node:net';

// A range is either a bare IP ("203.0.113.4") or CIDR ("203.0.113.0/24").
function parseRange(range: string): { addr: string; prefix: number; family: 'ipv4' | 'ipv6' } | null {
  const trimmed = range.trim();
  const slash = trimmed.indexOf('/');
  const addr = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const family = isIP(addr);
  if (family === 0) {
    return null;
  }
  const maxPrefix = family === 4 ? 32 : 128;
  let prefix = maxPrefix; // bare IP == /32 or /128
  if (slash !== -1) {
    const prefixPart = trimmed.slice(slash + 1);
    if (!/^\d+$/.test(prefixPart)) {
      return null;
    }
    prefix = Number(prefixPart);
    if (prefix < 0 || prefix > maxPrefix) {
      return null;
    }
  }
  return { addr, prefix, family: family === 4 ? 'ipv4' : 'ipv6' };
}

function normalizeIp(ip: string): { addr: string; family: 'ipv4' | 'ipv6' } | null {
  let candidate = ip.trim();
  // IPv4-mapped IPv6 (::ffff:203.0.113.4) -> plain IPv4 so it can match IPv4 ranges.
  if (candidate.toLowerCase().startsWith('::ffff:') && isIP(candidate.slice(7)) === 4) {
    candidate = candidate.slice(7);
  }
  const family = isIP(candidate);
  if (family === 0) {
    return null;
  }
  return { addr: candidate, family: family === 4 ? 'ipv4' : 'ipv6' };
}

export function isValidIpRange(range: string): boolean {
  return parseRange(range) !== null;
}

// ponytail: fail closed — any parse failure (range OR ip) means "not allowed".
export function isIpAllowed(ip: string, range: string): boolean {
  const parsedRange = parseRange(range);
  const parsedIp = normalizeIp(ip);
  if (!parsedRange || !parsedIp || parsedRange.family !== parsedIp.family) {
    return false;
  }
  const blockList = new BlockList();
  blockList.addSubnet(parsedRange.addr, parsedRange.prefix, parsedRange.family);
  return blockList.check(parsedIp.addr, parsedIp.family);
}
