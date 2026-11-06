import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { authenticate, type AuthUser, type Role } from '../auth.js';
import { ensureInitialData } from '../userSync.js';

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  role: Role;
  personnel_id: number | null;
  personnel_name?: string | null;
  is_active: boolean;
};

export const authRoutes = async (app: FastifyInstance): Promise<void> => {
  await ensureInitialData();

  app.post<{ Body: { username?: string; password?: string } }>('/api/auth/login', async (request, reply) => {
    const identifier = request.body?.username?.trim() ?? '';
    const password = request.body?.password ?? '';
    if (!identifier || !password) {
      return reply.code(400).send({ message: 'Username / Nama Personel dan password wajib diisi.' });
    }

    const { rows } = await pool.query<UserRow>(
      `SELECT u.*, p.name AS personnel_name
       FROM users u
       LEFT JOIN personnel p ON p.id = u.personnel_id
       WHERE lower(u.username) = lower($1)
          OR lower(u.full_name) = lower($1)
          OR lower(p.name) = lower($1)
       ORDER BY u.is_active DESC, u.id ASC
       LIMIT 1`,
      [identifier],
    );
    const user = rows[0];
    const valid = user && user.is_active && (await bcrypt.compare(password, user.password_hash));
    if (!user || !valid) {
      return reply.code(401).send({ message: 'Username/Nama atau password salah. Silakan coba lagi.' });
    }

    const displayName = user.personnel_name || user.full_name || user.username;
    const payload: AuthUser = { id: user.id, username: user.username, role: user.role, personnelId: user.personnel_id };
    const token = app.jwt.sign(payload, { expiresIn: '12h' });
    return { token, user: { ...payload, fullName: displayName } };
  });

  app.get('/api/auth/me', { preHandler: authenticate }, async (request, reply) => {
    const { rows } = await pool.query<UserRow>(
      `SELECT u.*, p.name AS personnel_name
       FROM users u
       LEFT JOIN personnel p ON p.id = u.personnel_id
       WHERE u.id = $1 AND u.is_active`,
      [request.user.id],
    );
    const user = rows[0];
    if (!user) return reply.code(401).send({ message: 'Akun tidak ditemukan atau nonaktif.' });
    return {
      id: user.id,
      username: user.username,
      fullName: user.personnel_name || user.full_name || user.username,
      role: user.role,
      personnelId: user.personnel_id,
    };
  });

  // Daftar akun personel roster untuk referensi cepat di halaman login
  app.get('/api/auth/roster-accounts', async () => {
    const { rows } = await pool.query<{ username: string; full_name: string; role: Role; personnel_name: string | null }>(
      `SELECT u.username, u.full_name, u.role, p.name AS personnel_name
       FROM users u
       LEFT JOIN personnel p ON p.id = u.personnel_id
       WHERE u.is_active
       ORDER BY CASE u.role WHEN 'user' THEN 1 WHEN 'supervisor' THEN 2 ELSE 3 END, COALESCE(p.name, u.full_name, u.username)`,
    );
    return rows.map((r) => ({
      username: r.username,
      name: r.personnel_name || r.full_name || r.username,
      role: r.role,
    }));
  });
};
