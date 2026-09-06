import { hash } from 'bcryptjs';
import { connectToMongo, disconnectFromMongo } from '../src/infrastructure/database/connection.js';
import { TenantModel, UserModel } from '../src/infrastructure/database/models/index.js';
import { generateTenantId, generateInstanceId } from '../src/shared/crypto/index.js';
import { logger } from '../src/logger.js';

const SEED_EMAIL = process.env.SEED_EMAIL ?? 'admin@localhost';
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'changeme123';
const SEED_TENANT_NAME = process.env.SEED_TENANT_NAME ?? 'Default Tenant';
const SEED_TENANT_SLUG = process.env.SEED_TENANT_SLUG ?? 'default';
const BCRYPT_ROUNDS = 12;

async function seed(): Promise<void> {
  await connectToMongo();
  logger.info('connected to mongodb for seeding');

  // Create tenant if it doesn't exist.
  let tenant = await TenantModel.findOne({ slug: SEED_TENANT_SLUG }).lean().exec();
  if (!tenant) {
    tenant = await TenantModel.create({
      _id: generateTenantId(),
      name: SEED_TENANT_NAME,
      slug: SEED_TENANT_SLUG,
      plan: 'free',
      isActive: true,
      defaultInstanceLimit: 5,
    });
    logger.info({ tenantId: tenant._id, slug: SEED_TENANT_SLUG }, 'tenant created');
  } else {
    logger.info({ tenantId: tenant._id, slug: SEED_TENANT_SLUG }, 'tenant already exists');
  }

  // Create user if it doesn't exist.
  let user = await UserModel.findOne({ email: SEED_EMAIL }).lean().exec();
  if (!user) {
    const hashedPassword = await hash(SEED_PASSWORD, BCRYPT_ROUNDS);
    user = await UserModel.create({
      email: SEED_EMAIL,
      password: hashedPassword,
      name: 'Admin',
      role: 'owner',
      tenantId: tenant._id,
      isActive: true,
    });
    logger.info({ userId: user._id, email: SEED_EMAIL }, 'user created');
  } else {
    logger.info({ userId: user._id, email: SEED_EMAIL }, 'user already exists');
  }

  logger.info(
    {
      tenantId: tenant._id,
      userId: user._id,
      email: SEED_EMAIL,
    },
    'seed complete',
  );

  await disconnectFromMongo();
}

seed().catch((err: unknown) => {
  logger.error({ err }, 'seed failed');
  process.exit(1);
});
