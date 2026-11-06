import type { FastifyReply, FastifyRequest } from 'fastify';

export type Role = 'admin' | 'supervisor' | 'user';

export type AuthUser = {
  id: number;
  username: string;
  role: Role;
  personnelId: number | null;
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

export const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ message: 'Sesi tidak valid. Silakan login kembali.' });
  }
};

export const requireRole =
  (...roles: Role[]) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (!roles.includes(request.user.role)) {
      await reply.code(403).send({ message: 'Anda tidak memiliki akses untuk aksi ini.' });
    }
  };

