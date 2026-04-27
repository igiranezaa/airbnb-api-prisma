import "dotenv/config";
import prisma from "../src/config/prisma";
import bcrypt from "bcrypt";

async function main() {
  console.log("🌱 Seeding...");

  // 1. CLEAN DATABASE (correct order)
  await prisma.booking.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.user.deleteMany();

  // 2. HASH PASSWORD
  const hashedPassword = await bcrypt.hash("password123", 10);

  // 3. CREATE USERS
  await prisma.user.createMany({
    data: [
      // HOSTS
      {
        name: "Host One",
        email: "host1@test.com",
        username: "host1",
        phone: "0780000001",
        password: hashedPassword,
        role: "HOST",
      },
      {
        name: "Host Two",
        email: "host2@test.com",
        username: "host2",
        phone: "0780000002",
        password: hashedPassword,
        role: "HOST",
      },

      // GUESTS
      {
        name: "Guest One",
        email: "guest1@test.com",
        username: "guest1",
        phone: "0780000003",
        password: hashedPassword,
        role: "GUEST",
      },
      {
        name: "Guest Two",
        email: "guest2@test.com",
        username: "guest2",
        phone: "0780000004",
        password: hashedPassword,
        role: "GUEST",
      },
      {
        name: "Guest Three",
        email: "guest3@test.com",
        username: "guest3",
        phone: "0780000005",
        password: hashedPassword,
        role: "GUEST",
      },
    ],
  });

  // 👉 get users with IDs
  const users = await prisma.user.findMany();

  const hosts = users.filter((u) => u.role === "HOST");
  const guests = users.filter((u) => u.role === "GUEST");

  // 4. CREATE LISTINGS
  await prisma.listing.createMany({
    data: [
      {
        title: "Modern Apartment",
        description: "Nice apartment",
        location: "Kigali",
        pricePerNight: 80,
        guests: 2,
        type: "APARTMENT",
        amenities: ["wifi", "kitchen", "parking"],
        hostId: hosts[0].id,
      },
      {
        title: "Family House",
        description: "Big house",
        location: "Kigali",
        pricePerNight: 120,
        guests: 5,
        type: "HOUSE",
        amenities: ["wifi", "garden", "parking"],
        hostId: hosts[0].id,
      },
      {
        title: "Luxury Villa",
        description: "Luxury stay",
        location: "Kigali",
        pricePerNight: 200,
        guests: 6,
        type: "VILLA",
        amenities: ["wifi", "pool", "chef"],
        hostId: hosts[1].id,
      },
      {
        title: "Cozy Cabin",
        description: "Quiet place",
        location: "Musanze",
        pricePerNight: 60,
        guests: 2,
        type: "CABIN",
        amenities: ["fireplace", "wifi", "nature"],
        hostId: hosts[1].id,
      },
    ],
  });

  const listings = await prisma.listing.findMany();

  // 5. CREATE BOOKINGS
  await prisma.booking.createMany({
    data: [
      {
        guestId: guests[0].id,
        listingId: listings[0].id,
        checkIn: new Date("2026-06-01"),
        checkOut: new Date("2026-06-05"),
        totalPrice: 4 * listings[0].pricePerNight,
        status: "CONFIRMED",
      },
      {
        guestId: guests[1].id,
        listingId: listings[1].id,
        checkIn: new Date("2026-06-10"),
        checkOut: new Date("2026-06-12"),
        totalPrice: 2 * listings[1].pricePerNight,
        status: "PENDING",
      },
      {
        guestId: guests[2].id,
        listingId: listings[2].id,
        checkIn: new Date("2026-06-15"),
        checkOut: new Date("2026-06-18"),
        totalPrice: 3 * listings[2].pricePerNight,
        status: "PENDING",
      },
    ],
  });

  console.log("✅ Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });