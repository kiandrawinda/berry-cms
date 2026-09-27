export const typeDefs = `#graphql
  type Article {
    id: ID!
    title: String!
    slug: String!
    content: String!
    category: String!
    author: String!
    createdAt: String!
    "HIT jika sedang berada di Redis cache, MISS jika baru diambil dari primary store, null jika belum pernah dicek."
    cacheStatus: String
  }

  type Analytics {
    totalArticles: Int!
    cacheHits: Int!
    cacheMisses: Int!
    cacheHitRate: Float!
    latencyMs: Int!
    activeKeys: Int!
    redisMode: String!
  }

  type Query {
    "Daftar seluruh artikel, diurutkan dari yang terbaru."
    articles: [Article!]!
    "Ambil satu artikel berdasarkan slug, melewati Redis Cache Layer (TTL 60s)."
    article(slug: String!): Article
    "Statistik real-time: total artikel, cache hit rate, latency, dan active keys."
    analytics: Analytics!
  }

  type Mutation {
    createArticle(
      title: String!
      slug: String!
      content: String!
      category: String!
      author: String!
    ): Article!

    updateArticle(
      id: ID!
      title: String
      content: String
      category: String
      author: String
    ): Article!

    deleteArticle(id: ID!): Boolean!
  }
`;
