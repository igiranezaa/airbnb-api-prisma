import "dotenv/config";
import prisma from "../src/config/prisma";

async function main() {
  const result = await prisma.listing.updateMany({
    where: { published: false },
    data: { published: true },
  });

  console.log(`Published ${result.count} listing(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
