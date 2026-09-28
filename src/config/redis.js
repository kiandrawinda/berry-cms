import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

/**
 * Berry CMS - Dual Mode Redis Client
 * ------------------------------------------------------------
 * - Jika UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN tersedia
 *   (mode Vercel Serverless), gunakan @upstash/redis (REST based,
 *   cocok untuk environment tanpa persistent TCP connection).
 * - Jika tidak, gunakan ioredis untuk koneksi TCP ke Redis
 *   Container / localhost (mode Self-Hosted / Docker).
 * ------------------------------------------------------------
 * Semua pemanggil di aplikasi cukup import `db` dari file ini,
 * tanpa perlu tahu implementasi driver di baliknya.
 */

const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '').trim();

let upstashUrl = clean(process.env.UPSTASH_REDIS_REST_URL);
const upstashToken = clean(process.env.UPSTASH_REDIS_REST_TOKEN);

if (/^rediss?:\/\//i.test(upstashUrl)) {
  throw new Error(
    'UPSTASH_REDIS_REST_URL harus berupa URL REST (https://xxxx.upstash.io), bukan URL TCP redis://. ' +
      'Ambil dari Upstash Console > database > bagian REST API.'
  );
}
if (upstashUrl && !/^https?:\/\//i.test(upstashUrl)) {
  upstashUrl = `https://${upstashUrl}`;
}

const useUpstash = Boolean(upstashUrl && upstashToken);

let raw;

if (useUpstash) {
  raw = new UpstashRedis({
    url: upstashUrl,
    token: upstashToken,
    automaticDeserialization: false,
  });
} else {
  raw = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    lazyConnect: false,
  });
  raw.on('error', (err) => {
    console.error('[Berry CMS] Redis connection error:', err.message);
  });
  raw.on('connect', () => {
    console.log('[Berry CMS] Connected to self-hosted Redis via ioredis.');
  });
}

export const redisMode = useUpstash ? 'upstash-serverless' : 'ioredis-selfhosted';

async function get(key) {
  const val = await raw.get(key);
  return val ?? null;
}

async function set(key, value, ttlSeconds) {
  if (useUpstash) {
    return ttlSeconds ? raw.set(key, value, { ex: ttlSeconds }) : raw.set(key, value);
  }
  return ttlSeconds ? raw.set(key, value, 'EX', ttlSeconds) : raw.set(key, value);
}

async function del(key) {
  return raw.del(key);
}

async function incr(key) {
  return raw.incr(key);
}

async function keys(pattern) {
  const result = await raw.keys(pattern);
  return Array.isArray(result) ? result : [];
}

async function hGetAll(key) {
  const data = await raw.hgetall(key);
  return data && typeof data === 'object' ? data : {};
}

async function hSet(key, field, value) {
  if (useUpstash) return raw.hset(key, { [field]: value });
  return raw.hset(key, field, value);
}

async function hGet(key, field) {
  const val = await raw.hget(key, field);
  return val ?? null;
}

async function hDel(key, field) {
  return raw.hdel(key, field);
}

export const db = { get, set, del, incr, keys, hGetAll, hSet, hGet, hDel };
