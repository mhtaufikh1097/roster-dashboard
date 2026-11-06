import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import Fastify from 'fastify';
import { activityRoutes } from './routes/activity.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { rosterRoutes } from './routes/roster.js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 16) {
  throw new Error('JWT_SECRET wajib diisi (minimal 16 karakter). Lihat server/.env.example');
}

const app = Fastify({ logger: true });

// Aksi seperti submit/acknowledge tidak punya body; terima JSON kosong.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
  const text = typeof body === 'string' ? body : body.toString();
  if (!text.trim()) return done(null, {});
  try {
    done(null, JSON.parse(text));
  } catch {
    const error = new Error('JSON tidak valid.') as Error & { statusCode: number };
    error.statusCode = 400;
    done(error, undefined);
  }
});

await app.register(cors, {
  origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
});
await app.register(jwt, { secret: jwtSecret });

app.get('/api/health', async () => ({ ok: true }));
await app.register(authRoutes);
await app.register(adminRoutes);
await app.register(rosterRoutes);
await app.register(activityRoutes);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });

