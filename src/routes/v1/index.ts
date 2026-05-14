import { Router } from "express";
import authRouter from "./auth.routes";
import usersRouter from "./users.routes";
import listingsRouter from "./listings.routes";
import bookingsRouter from "./bookings.routes";
import reviewsRouter from "./reviews.routes";
import messagesRouter from "./messages.routes";
import aiRouter from "./ai.routes";
import adminRouter from "./admin.routes";

const v1Router = Router();

v1Router.use("/auth", authRouter);
v1Router.use("/users", usersRouter);
v1Router.use("/listings", listingsRouter);
v1Router.use("/bookings", bookingsRouter);
v1Router.use("/reviews", reviewsRouter);
v1Router.use("/messages", messagesRouter);
v1Router.use("/ai", aiRouter);
v1Router.use("/admin", adminRouter);

export default v1Router;
