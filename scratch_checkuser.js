const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const users = await prisma.user.findMany({ select: { email: true, role: true } });
  console.log(users);
  await prisma.$disconnect();
})();
