import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import { authenticate, requireRole, type Role } from '../auth.js';
import { ensureTechnicianAccount } from '../userSync.js';

const ROLES: Role[] = ['admin', 'supervisor', 'user'];

type PersonnelBody = { name?: string; department?: string; position?: string; isActive?: boolean };
type UserBody = {
  username?: string;
  password?: string;
  fullName?: string;
  role?: Role;
  personnelId?: number | null;
  isActive?: boolean;
};

const mapUser = (row: Record<string, unknown>) => ({
  id: row.id,
  username: row.username,
  fullName: row.full_name,
  role: row.role,
  personnelId: row.personnel_id,
  personnelName: row.personnel_name ?? null,
  isActive: row.is_active,
  createdAt: row.created_at,
});

export const adminRoutes = async (app: FastifyInstance): Promise<void> => {
  // ---- Personel ----
  app.get<{ Querystring: { all?: string } }>('/api/personnel', { preHandler: authenticate }, async (request) => {
    const onlyActive = request.query.all === 'true' && request.user.role === 'admin' ? '' : 'WHERE is_active';
    const { rows } = await pool.query(
      `SELECT id, name, department, position, is_active FROM personnel ${onlyActive} ORDER BY name`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      department: row.department,
      position: row.position,
      isActive: row.is_active,
    }));
  });

  app.post<{ Body: PersonnelBody }>('/api/personnel', { preHandler: requireRole('admin') }, async (request, reply) => {
    const name = request.body?.name?.trim();
    if (!name) return reply.code(400).send({ message: 'Nama personel wajib diisi.' });
    try {
      const { rows } = await pool.query(
        'INSERT INTO personnel (name, department, position) VALUES ($1, $2, $3) RETURNING id',
        [name, request.body.department?.trim() ?? '', request.body.position?.trim() ?? ''],
      );
      await ensureTechnicianAccount(pool, rows[0].id, name);
      return reply.code(201).send({ id: rows[0].id });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send({ message: 'Nama personel sudah ada.' });
      }
      throw error;
    }
  });

  app.put<{ Params: { id: string }; Body: PersonnelBody }>(
    '/api/personnel/:id',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { name, department, position, isActive } = request.body ?? {};
      const result = await pool.query(
        `UPDATE personnel SET
           name = COALESCE($2, name),
           department = COALESCE($3, department),
           position = COALESCE($4, position),
           is_active = COALESCE($5, is_active)
         WHERE id = $1`,
        [request.params.id, name?.trim() || null, department?.trim() ?? null, position?.trim() ?? null, isActive ?? null],
      );
      if (!result.rowCount) return reply.code(404).send({ message: 'Personel tidak ditemukan.' });
      if (name?.trim()) {
        await pool.query('UPDATE users SET full_name = $2 WHERE personnel_id = $1', [request.params.id, name.trim()]);
      }
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/personnel/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    try {
      const result = await pool.query('DELETE FROM personnel WHERE id = $1', [request.params.id]);
      if (!result.rowCount) return reply.code(404).send({ message: 'Personel tidak ditemukan.' });
      return { ok: true };
    } catch {
      return reply.code(409).send({
        message: 'Personel sudah terhubung pada laporan activity. Gunakan fitur Nonaktifkan.',
      });
    }
  });

  // ---- Pengguna (Admin Control) ----
  app.get('/api/users', { preHandler: requireRole('admin') }, async () => {
    const { rows } = await pool.query(
      `SELECT u.*, p.name AS personnel_name FROM users u
       LEFT JOIN personnel p ON p.id = u.personnel_id
       ORDER BY u.is_active DESC, CASE u.role WHEN 'admin' THEN 1 WHEN 'supervisor' THEN 2 ELSE 3 END, u.full_name, u.username`,
    );
    return rows.map(mapUser);
  });

  app.post<{ Body: UserBody }>('/api/users', { preHandler: requireRole('admin') }, async (request, reply) => {
    const { username, password, fullName, role, personnelId } = request.body ?? {};
    if (!username?.trim() || !password || !role || !ROLES.includes(role)) {
      return reply.code(400).send({ message: 'Username, password, dan role wajib diisi dengan benar.' });
    }
    if (password.length < 6) {
      return reply.code(400).send({ message: 'Password minimal 6 karakter.' });
    }
    try {
      const hash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `INSERT INTO users (username, password_hash, full_name, role, personnel_id, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
        [username.trim(), hash, fullName?.trim() || username.trim(), role, personnelId ?? null],
      );
      return reply.code(201).send({ id: rows[0].id });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send({ message: 'Username sudah dipakai.' });
      }
      throw error;
    }
  });

  app.put<{ Params: { id: string }; Body: UserBody }>(
    '/api/users/:id',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { username, password, fullName, role, personnelId, isActive } = request.body ?? {};
      if (role && !ROLES.includes(role)) return reply.code(400).send({ message: 'Role tidak valid.' });
      if (password !== undefined && password.length < 6) {
        return reply.code(400).send({ message: 'Password minimal 6 karakter.' });
      }
      if (Number(request.params.id) === request.user.id && (isActive === false || (role && role !== 'admin'))) {
        return reply.code(400).send({ message: 'Anda tidak dapat menonaktifkan atau menurunkan role akun sendiri.' });
      }

      const hash = password ? await bcrypt.hash(password, 10) : null;
      try {
        const result = await pool.query(
          `UPDATE users SET
             username = COALESCE($2, username),
             password_hash = COALESCE($3, password_hash),
             full_name = COALESCE($4, full_name),
             role = COALESCE($5, role),
             personnel_id = CASE WHEN $6::boolean THEN $7::integer ELSE personnel_id END,
             is_active = COALESCE($8, is_active)
           WHERE id = $1`,
          [
            request.params.id,
            username?.trim() || null,
            hash,
            fullName !== undefined ? fullName.trim() : null,
            role ?? null,
            personnelId !== undefined,
            personnelId ?? null,
            isActive ?? null,
          ],
        );
        if (!result.rowCount) return reply.code(404).send({ message: 'Pengguna tidak ditemukan.' });
        return { ok: true };
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.code(409).send({ message: 'Username sudah digunakan oleh akun lain.' });
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/api/users/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    if (Number(request.params.id) === request.user.id) {
      return reply.code(400).send({ message: 'Tidak dapat menghapus akun yang sedang Anda gunakan.' });
    }
    const result = await pool.query('DELETE FROM users WHERE id = $1', [request.params.id]);
    if (!result.rowCount) return reply.code(404).send({ message: 'Pengguna tidak ditemukan.' });
    return { ok: true };
  });
};
