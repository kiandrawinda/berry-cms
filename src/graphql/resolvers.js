import { db, redisMode } from '../config/redis.js';

const ARTICLES_KEY = 'berrycms:articles'; // hash: id -> JSON(article)   [primary store]
const SLUG_INDEX_KEY = 'berrycms:slug_index'; // hash: slug -> id
const HITS_KEY = 'berrycms:stats:hits';
const MISSES_KEY = 'berrycms:stats:misses';
const CACHE_TTL = 60; // detik

function cacheKeyFor(slug) {
  return `berrycms:cache:article:${slug}`;
}

async function seedIfEmpty() {
  try {
    const existing = await db.hGetAll(ARTICLES_KEY);
    if (existing && Object.keys(existing).length > 0) return;

    const now = Date.now();
    const seedArticles = [
      {
        id: 'seed-1',
        title: 'Selamat Datang di Berry CMS',
        slug: 'selamat-datang-di-berry-cms',
        content:
          'Berry CMS adalah headless CMS ringan yang bisa Anda hosting sendiri tanpa vendor lock-in. Gunakan GraphQL API untuk mengambil konten dari platform apa pun: web, mobile, atau IoT.',
        category: 'Pengumuman',
        author: 'Tim Berry',
        createdAt: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(),
      },
      {
        id: 'seed-2',
        title: 'Cara Kerja Redis Cache Layer',
        slug: 'cara-kerja-redis-cache-layer',
        content:
          'Setiap query article(slug) pertama-tama memeriksa Redis. Jika data tersedia (HIT), respons dikirim dalam hitungan milidetik. Jika tidak (MISS), Berry CMS mengambil dari primary store dan menyimpannya ke cache selama 60 detik.',
        category: 'Teknis',
        author: 'Dev Team',
        createdAt: new Date(now - 1000 * 60 * 60 * 24 * 2).toISOString(),
      },
      {
        id: 'seed-3',
        title: 'Deploy ke Vercel dalam 5 Menit',
        slug: 'deploy-ke-vercel-dalam-5-menit',
        content:
          'Berry CMS mendukung dua mode deployment: self-hosted via Docker Compose, dan cloud demo serverless via Vercel + Upstash Redis. Cukup hubungkan repository, atur environment variable, lalu deploy.',
        category: 'Panduan',
        author: 'Tim Berry',
        createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
      },
    ];

    for (const article of seedArticles) {
      await db.hSet(ARTICLES_KEY, article.id, JSON.stringify(article));
      await db.hSet(SLUG_INDEX_KEY, article.slug, article.id);
    }
    console.log('[Berry CMS] Seed data berhasil dibuat.');
  } catch (err) {
    console.error('[Berry CMS] Gagal melakukan seeding:', err.message);
  }
}

// Dijalankan sekali saat module ini pertama kali di-load (cold start / server start).
await seedIfEmpty();

async function getAllArticlesRaw() {
  const map = await db.hGetAll(ARTICLES_KEY);
  const parsed = [];

  for (const [id, raw] of Object.entries(map)) {
    try {
      parsed.push(JSON.parse(raw));
    } catch (err) {
      // Jangan biarkan satu record korup (mis. diedit manual di Upstash Console)
      // membuat SELURUH query `articles` gagal. Skip & log saja.
      console.error(`[Berry CMS] Melewati artikel korup (id=${id}):`, err.message);
    }
  }

  return parsed.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export const resolvers = {
  Query: {
    articles: async () => {
      const articles = await getAllArticlesRaw();
      // Cek status cache untuk setiap artikel tanpa mengubah counter hit/miss (peek only).
      // Kalau pengecekan cache untuk 1 artikel gagal (mis. rate-limit Upstash),
      // jangan sampai menggagalkan seluruh list — fallback ke MISS.
      const withStatus = await Promise.all(
        articles.map(async (article) => {
          try {
            const cached = await db.get(cacheKeyFor(article.slug));
            return { ...article, cacheStatus: cached ? 'HIT' : 'MISS' };
          } catch (err) {
            console.error(`[Berry CMS] Gagal cek cache untuk slug "${article.slug}":`, err.message);
            return { ...article, cacheStatus: 'MISS' };
          }
        })
      );
      return withStatus;
    },

    article: async (_parent, { slug }) => {
      const key = cacheKeyFor(slug);
      const cached = await db.get(key);

      if (cached) {
        await db.incr(HITS_KEY);
        return { ...JSON.parse(cached), cacheStatus: 'HIT' };
      }

      await db.incr(MISSES_KEY);
      const id = await db.hGet(SLUG_INDEX_KEY, slug);
      if (!id) return null;

      const rawArticle = await db.hGet(ARTICLES_KEY, id);
      if (!rawArticle) return null;

      const article = JSON.parse(rawArticle);
      await db.set(key, JSON.stringify(article), CACHE_TTL);
      return { ...article, cacheStatus: 'MISS' };
    },

    analytics: async () => {
      const start = Date.now();
      const [articlesMap, hits, misses, activeKeys] = await Promise.all([
        db.hGetAll(ARTICLES_KEY),
        db.get(HITS_KEY),
        db.get(MISSES_KEY),
        db.keys('berrycms:*'),
      ]);
      const latencyMs = Date.now() - start;

      const totalHits = parseInt(hits, 10) || 0;
      const totalMisses = parseInt(misses, 10) || 0;
      const totalOps = totalHits + totalMisses;
      const cacheHitRate =
        totalOps > 0 ? Math.round((totalHits / totalOps) * 1000) / 10 : 0;

      return {
        totalArticles: Object.keys(articlesMap).length,
        cacheHits: totalHits,
        cacheMisses: totalMisses,
        cacheHitRate,
        latencyMs: Math.max(latencyMs, 1),
        activeKeys: activeKeys.length,
        redisMode,
      };
    },
  },

  Mutation: {
    createArticle: async (_parent, { title, slug, content, category, author }) => {
      const existingId = await db.hGet(SLUG_INDEX_KEY, slug);
      if (existingId) {
        throw new Error(`Slug "${slug}" sudah digunakan. Silakan gunakan slug lain.`);
      }

      const id = `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const article = {
        id,
        title,
        slug,
        content,
        category,
        author,
        createdAt: new Date().toISOString(),
      };

      await db.hSet(ARTICLES_KEY, id, JSON.stringify(article));
      await db.hSet(SLUG_INDEX_KEY, slug, id);
      await db.del(cacheKeyFor(slug)); // pastikan cache bersih untuk slug baru

      return { ...article, cacheStatus: null };
    },

    updateArticle: async (_parent, { id, title, content, category, author }) => {
      const rawArticle = await db.hGet(ARTICLES_KEY, id);
      if (!rawArticle) {
        throw new Error(`Artikel dengan id "${id}" tidak ditemukan.`);
      }

      const existing = JSON.parse(rawArticle);
      const updated = {
        ...existing,
        title: title ?? existing.title,
        content: content ?? existing.content,
        category: category ?? existing.category,
        author: author ?? existing.author,
      };

      await db.hSet(ARTICLES_KEY, id, JSON.stringify(updated));
      await db.del(cacheKeyFor(updated.slug)); // invalidate cache lama

      return { ...updated, cacheStatus: null };
    },

    deleteArticle: async (_parent, { id }) => {
      const rawArticle = await db.hGet(ARTICLES_KEY, id);
      if (!rawArticle) return false;

      const article = JSON.parse(rawArticle);
      await db.hDel(ARTICLES_KEY, id);
      await db.hDel(SLUG_INDEX_KEY, article.slug);
      await db.del(cacheKeyFor(article.slug)); // purge cache

      return true;
    },
  },
};
