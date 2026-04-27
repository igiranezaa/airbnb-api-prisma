import "dotenv/config";
import express from "express";
import { connectDB } from "./config/prisma";

import usersRoutes from "./routes/users.routes";
import listingsRoutes from "./routes/listings.routes";
import bookingsRoutes from "./routes/bookings.routes";
import authRoutes from "./routes/auth.routes";
import uploadRoutes from "./routes/upload.routes";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ROUTES
app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/users", uploadRoutes);
app.use("/listings", listingsRoutes);
app.use("/bookings", bookingsRoutes);

app.get("/", (req, res) => {
  res.send("API is running");
});

// ✅ START SERVER ONLY AFTER DB CONNECTS
async function main() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

main();