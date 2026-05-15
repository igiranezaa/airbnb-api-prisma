import "dotenv/config";
import prisma from "../src/config/prisma";
import bcrypt from "bcrypt";

async function main() {
  console.log("🌱 Seeding...");

  // 1. CLEAN
  await prisma.review.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.user.deleteMany();

  // 2. HASH PASSWORD
  const hashedPassword = await bcrypt.hash("password123", 10);

  // 3. USERS
  await prisma.user.createMany({
    data: [
      {
        name: "Alice Host",
        email: "host1@test.com",
        username: "host1",
        phone: "0780000001",
        password: hashedPassword,
        role: "HOST",
      },
      {
        name: "Bob Host",
        email: "host2@test.com",
        username: "host2",
        phone: "0780000002",
        password: hashedPassword,
        role: "HOST",
      },
      {
        name: "Carol Guest",
        email: "guest1@test.com",
        username: "guest1",
        phone: "0780000003",
        password: hashedPassword,
        role: "GUEST",
      },
      {
        name: "David Guest",
        email: "guest2@test.com",
        username: "guest2",
        phone: "0780000004",
        password: hashedPassword,
        role: "GUEST",
      },
      {
        name: "Eve Guest",
        email: "guest3@test.com",
        username: "guest3",
        phone: "0780000005",
        password: hashedPassword,
        role: "GUEST",
      },
      {
        name: "Admin User",
        email: "admin@test.com",
        username: "admin",
        phone: "0780000006",
        password: hashedPassword,
        role: "ADMIN",
      },
    ],
  });

  const users = await prisma.user.findMany();
  const hosts = users.filter((u) => u.role === "HOST");
  const guests = users.filter((u) => u.role === "GUEST");

  // 4. LISTINGS — varied locations and types for AI search testing
  await prisma.listing.createMany({
    data: [
      // Kigali apartments (for Part 1 & 4 recommendations)
      {
        title: "Modern Studio in Kigali CBD",
        description: "Stylish studio in the heart of Kigali business district.",
        location: "Kigali",
        pricePerNight: 75,
        guests: 2,
        type: "APARTMENT",
        amenities: ["WiFi", "kitchen", "air conditioning", "workspace"],
        hostId: hosts[0]!.id,
      },
      {
        title: "Spacious Kigali Apartment",
        description: "Bright 2-bedroom apartment with city views.",
        location: "Kigali",
        pricePerNight: 95,
        guests: 4,
        type: "APARTMENT",
        amenities: ["WiFi", "kitchen", "parking", "balcony"],
        hostId: hosts[0]!.id,
      },
      {
        title: "Budget Apartment Nyamirambo",
        description: "Affordable and clean apartment in a lively neighborhood.",
        location: "Kigali",
        pricePerNight: 50,
        guests: 2,
        type: "APARTMENT",
        amenities: ["WiFi", "kitchen"],
        hostId: hosts[1]!.id,
      },
      // Kigali houses
      {
        title: "Family House in Kacyiru",
        description: "Spacious family home near embassies and schools.",
        location: "Kigali",
        pricePerNight: 130,
        guests: 6,
        type: "HOUSE",
        amenities: ["WiFi", "garden", "parking", "BBQ", "kitchen"],
        hostId: hosts[0]!.id,
      },
      {
        title: "Luxury Villa Kigali Heights",
        description: "Premium villa with pool and panoramic city views.",
        location: "Kigali",
        pricePerNight: 250,
        guests: 8,
        type: "VILLA",
        amenities: ["WiFi", "pool", "chef", "gym", "parking", "garden"],
        hostId: hosts[1]!.id,
      },
      // Musanze / Gisenyi
      {
        title: "Cozy Cabin near Volcanoes Park",
        description: "Peaceful cabin perfect for gorilla trekking base camp.",
        location: "Musanze",
        pricePerNight: 60,
        guests: 2,
        type: "CABIN",
        amenities: ["WiFi", "fireplace", "breakfast", "nature views"],
        hostId: hosts[1]!.id,
      },
      {
        title: "Lake Kivu Cabin",
        description: "Charming cabin steps from Lake Kivu with stunning sunsets.",
        location: "Gisenyi",
        pricePerNight: 70,
        guests: 3,
        type: "CABIN",
        amenities: ["WiFi", "lake view", "kayak", "breakfast"],
        hostId: hosts[0]!.id,
      },
      {
        title: "Gisenyi Beach House",
        description: "Relaxed beach house on the shores of Lake Kivu.",
        location: "Gisenyi",
        pricePerNight: 110,
        guests: 5,
        type: "HOUSE",
        amenities: ["WiFi", "beach access", "pool", "kitchen", "parking"],
        hostId: hosts[1]!.id,
      },
    ],
  });

  await prisma.listing.updateMany({
    data: { published: true },
  });

  const listings = await prisma.listing.findMany();
  const [apt1, apt2, apt3, house1, villa1, cabin1, cabin2, house2] = listings;

  // 5. BOOKINGS — enough history for guest1 to get AI recommendations (Part 4)
  await prisma.booking.createMany({
    data: [
      // guest1 has 5 bookings (all Kigali apartments — clear pattern for AI)
      {
        guestId: guests[0]!.id,
        listingId: apt1!.id,
        checkIn: new Date("2025-11-01"),
        checkOut: new Date("2025-11-04"),
        totalPrice: 3 * apt1!.pricePerNight,
        status: "CONFIRMED",
      },
      {
        guestId: guests[0]!.id,
        listingId: apt2!.id,
        checkIn: new Date("2025-12-10"),
        checkOut: new Date("2025-12-13"),
        totalPrice: 3 * apt2!.pricePerNight,
        status: "CONFIRMED",
      },
      {
        guestId: guests[0]!.id,
        listingId: apt3!.id,
        checkIn: new Date("2026-01-05"),
        checkOut: new Date("2026-01-08"),
        totalPrice: 3 * apt3!.pricePerNight,
        status: "CONFIRMED",
      },
      {
        guestId: guests[0]!.id,
        listingId: apt1!.id,
        checkIn: new Date("2026-02-14"),
        checkOut: new Date("2026-02-16"),
        totalPrice: 2 * apt1!.pricePerNight,
        status: "CONFIRMED",
      },
      {
        guestId: guests[0]!.id,
        listingId: apt2!.id,
        checkIn: new Date("2026-03-20"),
        checkOut: new Date("2026-03-23"),
        totalPrice: 3 * apt2!.pricePerNight,
        status: "CONFIRMED",
      },
      // guest2 bookings (mix of cabins and houses — different pattern)
      {
        guestId: guests[1]!.id,
        listingId: cabin1!.id,
        checkIn: new Date("2026-04-01"),
        checkOut: new Date("2026-04-03"),
        totalPrice: 2 * cabin1!.pricePerNight,
        status: "CONFIRMED",
      },
      {
        guestId: guests[1]!.id,
        listingId: cabin2!.id,
        checkIn: new Date("2026-04-10"),
        checkOut: new Date("2026-04-12"),
        totalPrice: 2 * cabin2!.pricePerNight,
        status: "PENDING",
      },
      // guest3 bookings
      {
        guestId: guests[2]!.id,
        listingId: villa1!.id,
        checkIn: new Date("2026-05-01"),
        checkOut: new Date("2026-05-05"),
        totalPrice: 4 * villa1!.pricePerNight,
        status: "CONFIRMED",
      },
      {
        guestId: guests[2]!.id,
        listingId: house1!.id,
        checkIn: new Date("2026-06-10"),
        checkOut: new Date("2026-06-12"),
        totalPrice: 2 * house1!.pricePerNight,
        status: "PENDING",
      },
    ],
  });

  // 6. REVIEWS — at least 3 per listing for AI review summary (Part 5)
  await prisma.review.createMany({
    data: [
      // apt1 — 4 reviews
      {
        rating: 5,
        comment: "Amazing location, super clean and modern. Check-in was seamless.",
        userId: guests[0]!.id,
        listingId: apt1!.id,
      },
      {
        rating: 5,
        comment: "Perfect for a business trip. Fast WiFi and great workspace.",
        userId: guests[1]!.id,
        listingId: apt1!.id,
      },
      {
        rating: 4,
        comment: "Very comfortable and well-equipped. A bit noisy at night from the street.",
        userId: guests[2]!.id,
        listingId: apt1!.id,
      },
      {
        rating: 5,
        comment: "Host was super responsive. Would definitely book again!",
        userId: guests[1]!.id,
        listingId: apt1!.id,
      },
      // apt2 — 3 reviews
      {
        rating: 4,
        comment: "Great apartment with a beautiful balcony and city views.",
        userId: guests[0]!.id,
        listingId: apt2!.id,
      },
      {
        rating: 4,
        comment: "Spacious and clean. Parking was a huge plus.",
        userId: guests[2]!.id,
        listingId: apt2!.id,
      },
      {
        rating: 3,
        comment: "Good location but the kitchen could use some updating.",
        userId: guests[1]!.id,
        listingId: apt2!.id,
      },
      // villa1 — 3 reviews
      {
        rating: 5,
        comment: "Absolutely stunning villa. The pool and views are world-class.",
        userId: guests[0]!.id,
        listingId: villa1!.id,
      },
      {
        rating: 5,
        comment: "The chef was a wonderful surprise. Luxury from start to finish.",
        userId: guests[2]!.id,
        listingId: villa1!.id,
      },
      {
        rating: 4,
        comment: "Outstanding property. Only minor issue was limited hot water in the morning.",
        userId: guests[1]!.id,
        listingId: villa1!.id,
      },
      // cabin1 — 3 reviews
      {
        rating: 5,
        comment: "Perfect base for gorilla trekking. So peaceful and cozy.",
        userId: guests[1]!.id,
        listingId: cabin1!.id,
      },
      {
        rating: 4,
        comment: "Loved the fireplace and nature views. Breakfast was delicious.",
        userId: guests[0]!.id,
        listingId: cabin1!.id,
      },
      {
        rating: 5,
        comment: "Quiet, clean, and the host gave great trekking tips.",
        userId: guests[2]!.id,
        listingId: cabin1!.id,
      },
      // house2 — 3 reviews
      {
        rating: 5,
        comment: "Waking up to Lake Kivu views every morning was magical.",
        userId: guests[0]!.id,
        listingId: house2!.id,
      },
      {
        rating: 4,
        comment: "Beautiful beach house. Pool was great, beach access even better.",
        userId: guests[1]!.id,
        listingId: house2!.id,
      },
      {
        rating: 4,
        comment: "Great family getaway. Kids loved the lake and the kayaks.",
        userId: guests[2]!.id,
        listingId: house2!.id,
      },
    ],
  });

  const reviewCount = await prisma.review.count();
  const bookingCount = await prisma.booking.count();

  console.log("✅ Seeding complete!");
  console.log(`   - ${hosts.length} hosts`);
  console.log(`   - ${guests.length} guests`);
  console.log(`   - 1 admin`);
  console.log(`   - ${listings.length} listings`);
  console.log(`   - ${bookingCount} bookings`);
  console.log(`   - ${reviewCount} reviews`);
  console.log("");
  console.log("Test accounts (password: password123):");
  console.log("   HOST   → host1@test.com");
  console.log("   HOST   → host2@test.com");
  console.log("   GUEST  → guest1@test.com  (5 bookings — use for /ai/recommend)");
  console.log("   GUEST  → guest2@test.com");
  console.log("   GUEST  → guest3@test.com");
  console.log("   ADMIN  → admin@test.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
