import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { typeDefs } from './graphql/typeDefs.js';
import { resolvers } from './graphql/resolvers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Instance ApolloServer & promise start() dibuat sekali di scope module.
 * Ini penting untuk mode serverless (Vercel): selama container/lambda masih
 * "warm", instance ini akan dipakai ulang tanpa perlu start() berkali-kali.
 */
const apolloServer = new ApolloServer({ typeDefs, resolvers });
const apolloStartPromise = apolloServer.start();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'berry-cms', timestamp: new Date().toISOString() });
});

app.use('/graphql', async (req, res, next) => {
  try {
    await apolloStartPromise;
    return expressMiddleware(apolloServer, {
      context: async () => ({}),
    })(req, res, next);
  } catch (err) {
    next(err);
  }
});

// Serve Admin Dashboard (static single-file HTML, Tailwind via CDN)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Fallback: apapun selain /graphql & /health, arahkan ke dashboard
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/graphql') || req.path.startsWith('/health')) return next();
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

export default app;
