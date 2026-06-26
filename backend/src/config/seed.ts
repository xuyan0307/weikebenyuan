import type { Pool } from 'mysql2/promise';
import { hashPassword } from '../utils/bcrypt';

interface SeedUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: string;
  phone?: string;
}

const SEED_USERS: SeedUser[] = [
  { id: '00000000-0000-0000-0000-000000000001', username: 'admin', password: 'admin123', name: '超级管理员', role: 'superadmin', phone: '13800000001' },
  { id: '00000000-0000-0000-0000-000000000002', username: 'zhang', password: 'zhang123', name: '张管理员', role: 'admin', phone: '13800000002' },
  { id: '00000000-0000-0000-0000-000000000003', username: 'li', password: 'li123456', name: '李客服', role: 'service', phone: '13800000003' },
  { id: '00000000-0000-0000-0000-000000000004', username: 'wang', password: 'wang1234', name: '王产康师', role: 'therapist', phone: '13800000004' },
  { id: '00000000-0000-0000-0000-000000000005', username: 'zhao', password: 'zhao1234', name: '赵财务', role: 'finance', phone: '13800000005' },
];

export async function seedIfEmpty(pool: Pool): Promise<void> {
  const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
  const count = (rows as any)[0].cnt;
  if (Number(count) > 0) return;

  console.log('🌱 Seeding initial users...');
  for (const u of SEED_USERS) {
    await pool.execute(
      `INSERT INTO users (id, username, password_hash, name, role, phone, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [u.id, u.username, hashPassword(u.password), u.name, u.role, u.phone || null]
    );
  }
  console.log(`✅ Seeded ${SEED_USERS.length} users (admin / admin123)`);
}
