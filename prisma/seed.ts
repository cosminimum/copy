import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Database seed script')
  console.log('Note: Traders are now managed via Polymarket API search, not database seeding.')
  console.log('✓ No seeding needed')
}

main()
  .catch((e) => {
    console.error('Error in seed script:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
