# 🍓 Berry CMS

**Headless CMS ringan, mandiri, dan tanpa vendor lock-in** — dilengkapi GraphQL API, Redis caching layer, dan Admin Dashboard bergaya SaaS modern (Dark Mode + Emerald Accent).

Dibuat untuk tim konten yang ingin punya kendali penuh atas infrastruktur CMS mereka: bisa di-*self-host* di server sendiri via Docker, atau dicoba langsung sebagai *cloud demo* serverless di Vercel.

---

## ✨ Fitur Utama

- **GraphQL API** — query & mutation untuk artikel (`articles`, `article`, `createArticle`, `updateArticle`, `deleteArticle`) plus `analytics` real-time.
- **Redis Caching Layer** — setiap `article(slug)` dicek ke Redis dulu (TTL 60 detik). Cache HIT = respons instan, cache MISS = ambil dari primary store lalu diisi ulang ke cache. Mutation otomatis melakukan *cache invalidation/purge*.
- **Dual-Mode Redis Client** — otomatis mendeteksi environment:
  - Ada `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN` → pakai `@upstash/redis` (REST, cocok untuk serverless Vercel).
  - Tidak ada → pakai `ioredis` (koneksi TCP langsung ke Redis container/local).
- **Admin Dashboard** (Dark Mode SaaS + Emerald Accent):
  - Navbar dengan status badge "Live · Connected to Redis Cache", pencarian konten, tombol Quick Create.
  - Metrics Grid: Total Articles, Cache Hit Rate %, API Latency (ms), Active Redis Keys.
  - Content Manager Table: Title, Slug, Category, Author, Cache Status (HIT/MISS badge), Actions (Preview Query / Edit / Delete).
  - GraphQL Playground interaktif langsung dari UI — coba query apa pun tanpa tools eksternal.
- **Anti Vendor Lock-in** — tidak bergantung pada satu provider database/cache tertentu. Ganti Redis provider kapan saja cukup lewat environment variable, tanpa mengubah kode aplikasi.
- **Dua Mode Deployment** dari satu codebase yang sama:
  1. **Self-Hosted** via Docker & Docker Compose (VPS / on-prem).
  2. **Cloud Demo** via Vercel Serverless Functions + Upstash Redis.

---

## 🏗️ Arsitektur

```
                     ┌────────────────────────┐
                     │   Admin Dashboard (UI)  │
                     │  Tailwind + Vanilla JS  │
                     └───────────┬─────────────┘
                                 │ fetch('/graphql')
                                 ▼
                     ┌────────────────────────┐
                     │   Apollo Server (GQL)   │
                     │  typeDefs + resolvers   │
                     └───────────┬─────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
      ┌─────────────────────┐        ┌───────────────────────┐
      │  Primary Store       │        │  Cache Layer (TTL60s) │
      │  Redis Hash          │◄──────►│  Redis Key per-slug   │
      │  (articles + slug ix)│        │  HIT / MISS tracking  │
      └─────────────────────┘        └───────────────────────┘
                 │
     ┌───────────┴────────────┐
     ▼                        ▼
ioredis (self-hosted)   @upstash/redis (Vercel serverless)
```

Express digunakan sebagai *thin wrapper* yang meng-host baik dashboard (static HTML) maupun endpoint `/graphql`. `src/app.js` adalah satu-satunya sumber kebenaran untuk konfigurasi server — dipakai ulang persis sama oleh `src/index.js` (Docker/self-hosted) maupun `api/index.js` (Vercel serverless), sehingga tidak ada duplikasi logika.

---

## 📁 Struktur Folder

```
berry-cms/
├── package.json
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── vercel.json
├── api/
│   └── index.js          # Vercel Serverless Function handler
└── src/
    ├── index.js           # Entry point self-hosted (Express.listen)
    ├── app.js             # Shared Express + Apollo app
    ├── config/
    │   └── redis.js       # Dual-mode Redis client (ioredis / upstash)
    ├── graphql/
    │   ├── typeDefs.js    # GraphQL schema
    │   └── resolvers.js   # Query/Mutation + caching logic
    └── views/
        └── index.html     # Admin Dashboard (Tailwind CDN, single-file)
```

---

## 🚀 Menjalankan Secara Lokal (tanpa Docker)

```bash
cd berry-cms
npm install
cp .env.example .env
# pastikan Redis lokal berjalan di redis://127.0.0.1:6379
npm run dev
```

Buka `http://localhost:4000` untuk Dashboard, dan `http://localhost:4000/graphql` untuk endpoint GraphQL.

---

## 🐳 Self-Hosted via Docker Compose (Rekomendasi Produksi)

Cukup **1 perintah** untuk menjalankan aplikasi + Redis sekaligus:

```bash
docker compose up --build
```

Ini akan menyalakan dua service:
- `berry-cms` — aplikasi Node.js (port `4000`)
- `redis-cache` — Redis 7 Alpine dengan AOF persistence (port `6379`)

Setelah berjalan:
- Dashboard: `http://localhost:4000`
- GraphQL: `http://localhost:4000/graphql`

Untuk menghentikan:

```bash
docker compose down
```

Untuk menghentikan sekaligus menghapus volume data Redis:

```bash
docker compose down -v
```

---

## ☁️ Cloud Demo via Vercel + Upstash Redis

1. **Buat Redis database gratis** di [Upstash](https://upstash.com) → salin `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`.
2. **Import repository** ini ke [Vercel](https://vercel.com/new).
3. Di **Project Settings → Environment Variables**, tambahkan:
   | Key | Value |
   |---|---|
   | `UPSTASH_REDIS_REST_URL` | `https://xxxx.upstash.io` |
   | `UPSTASH_REDIS_REST_TOKEN` | `xxxxxxxxxxxx` |
4. Deploy. `vercel.json` sudah mengatur seluruh route (`/`, `/graphql`, dsb.) untuk diarahkan ke `api/index.js`.
5. Selesai — dashboard & GraphQL API langsung live di domain `*.vercel.app` Anda, tanpa server yang perlu dikelola.

> Karena `api/index.js` hanya me-*re-export* `src/app.js`, tidak ada logika yang berbeda antara mode Docker dan mode Vercel — satu-satunya perbedaan adalah **driver Redis** yang dipilih otomatis oleh `src/config/redis.js`.

---

## 🔌 Contoh Query & Mutation GraphQL

**Ambil semua artikel:**
```graphql
query {
  articles {
    id
    title
    slug
    category
    author
    cacheStatus
  }
}
```

**Ambil satu artikel (melewati cache layer):**
```graphql
query {
  article(slug: "selamat-datang-di-berry-cms") {
    title
    content
    cacheStatus   # HIT jika sudah di-cache, MISS jika baru diambil
  }
}
```

**Buat artikel baru:**
```graphql
mutation {
  createArticle(
    title: "Judul Artikel"
    slug: "judul-artikel"
    content: "Isi konten di sini..."
    category: "Berita"
    author: "Nama Penulis"
  ) {
    id
    createdAt
  }
}
```

**Hapus artikel (otomatis purge cache):**
```graphql
mutation {
  deleteArticle(id: "art_1234567890_abcdef")
}
```

**Statistik real-time:**
```graphql
query {
  analytics {
    totalArticles
    cacheHits
    cacheMisses
    cacheHitRate
    latencyMs
    activeKeys
    redisMode
  }
}
```

---

## 🧩 Environment Variables

| Variable | Wajib untuk | Deskripsi |
|---|---|---|
| `PORT` | Self-hosted | Port Express, default `4000` |
| `REDIS_URL` | Self-hosted | Connection string ioredis, default `redis://127.0.0.1:6379` |
| `UPSTASH_REDIS_REST_URL` | Vercel | REST URL dari Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel | REST token dari Upstash |

---

## 🛠️ Tech Stack

Node.js · Express · Apollo Server 4 · GraphQL · ioredis · @upstash/redis · Docker · Tailwind CSS · Lucide Icons

---

## 📜 Lisensi

MIT — bebas digunakan, dimodifikasi, dan di-deploy ulang tanpa batasan vendor apa pun.
