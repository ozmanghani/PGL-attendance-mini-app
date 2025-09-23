import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating mock attendance records...');

  const mockRecords = Array.from({ length: 20 }, (_, index) => {
    const userId = String(1000 + index + 1).padStart(4, '0');
    const timestamp = new Date(Date.now() - index * 3600000).toISOString(); // Every hour back
    const status = Math.random() > 0.5 ? '0' : '1'; // Check in (0) or check out (1)
    const verifyType = '1'; // Fingerprint

    return {
      rawData: `${userId}\t${timestamp}\t${status}\t${verifyType}`,
      isSynced: true,
      createdAt: new Date(Date.now() - index * 3600000),
    };
  });

  for (const record of mockRecords) {
    await prisma.rawAttendance.create({
      data: record,
    });
  }

  console.log(`Created ${mockRecords.length} mock attendance records`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
