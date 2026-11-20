interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

/**
 * In-memory sliding window. On Vercel this is per isolate, so it slows
 * bursts against one instance rather than enforcing a global quota. It is
 * still enough to blunt an unauthenticated loop against the assistant.
 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.timestamps[0] + windowMs - now) / 1000));
    buckets.set(key, bucket);
    return { ok: false, retryAfterSec };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 5000) {
    for (const [entryKey, entry] of buckets) {
      if (entry.timestamps.every((t) => now - t >= windowMs)) buckets.delete(entryKey);
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 80);
  }
  return req.headers.get("x-real-ip")?.slice(0, 80) ?? "unknown";
}
