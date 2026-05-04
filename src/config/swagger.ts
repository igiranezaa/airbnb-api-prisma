import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Airbnb API",
      version: "1.0.0",
      description: "REST API for Airbnb clone",
    },
    servers: [{ url: process.env.NODE_ENV === "production" ? process.env.BASE_URL : "http://localhost:3000" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: "string" },
            username: { type: "string" },
            phone: { type: "string" },
            role: { type: "string", enum: ["GUEST", "HOST", "ADMIN"] },
            avatar: { type: "string", nullable: true },
          },
        },
        Listing: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            location: { type: "string" },
            pricePerNight: { type: "number" },
            guests: { type: "integer" },
            type: { type: "string", enum: ["APARTMENT", "HOUSE", "VILLA", "CABIN"] },
            amenities: { type: "array", items: { type: "string" } },
            hostId: { type: "string" },
          },
        },
        Booking: {
          type: "object",
          properties: {
            id: { type: "string" },
            guestId: { type: "string" },
            listingId: { type: "string" },
            checkIn: { type: "string", format: "date" },
            checkOut: { type: "string", format: "date" },
            totalPrice: { type: "number" },
            status: { type: "string", enum: ["PENDING", "CONFIRMED", "CANCELLED"] },
          },
        },
        Review: {
          type: "object",
          properties: {
            id: { type: "string" },
            rating: { type: "integer", minimum: 1, maximum: 5 },
            comment: { type: "string" },
            userId: { type: "string" },
            listingId: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/v1/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
