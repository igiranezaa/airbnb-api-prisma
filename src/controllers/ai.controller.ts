import { Response, NextFunction } from "express";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import prisma from "../config/prisma";
import { model, deterministicModel } from "../config/ai";
import { getCache, setCache, deleteCache } from "../config/cache";
import type { AuthRequest } from "../middlewares/auth.middleware";

// In-memory chat session store
const chatSessions = new Map<string, Array<{ role: "human" | "ai"; content: string }>>();

function handleAiError(error: unknown, res: Response): boolean {
  console.error("Groq error:", JSON.stringify(error, null, 2));
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    const status = Number(err["status"] ?? err["statusCode"] ?? err["code"]);
    if (status === 429) {
      res.status(429).json({ message: "AI service is busy, please try again in a moment" });
      return true;
    }
    if (status === 401) {
      res.status(500).json({ message: "AI service configuration error" });
      return true;
    }
  }
  return false;
}

function parseAiJson(text: string): Record<string, unknown> | null {
  // Strip markdown code fences if present
  const cleaned = text.replace(/```(?:json)?\n?/g, "").trim();
  // Extract first JSON object found
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// PART 1 — Smart Listing Search with Pagination
export async function aiSearch(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ message: "query is required" });

    const page = Math.max(1, parseInt(req.query["page"] as string) || 1);
    const limit = Math.max(1, parseInt(req.query["limit"] as string) || 10);
    const skip = (page - 1) * limit;

    const extractPrompt = `Extract search filters from this query and return ONLY valid JSON with no explanation:
Query: "${query}"

Return JSON in exactly this format:
{
  "location": "city name or null",
  "type": "APARTMENT|HOUSE|VILLA|CABIN or null",
  "maxPrice": number or null,
  "guests": number or null
}

Rules:
- Only use these type values: APARTMENT, HOUSE, VILLA, CABIN
- If a filter is not mentioned, set it to null
- Return only the JSON object, nothing else`;

    let aiResponse: string;
    try {
      const result = await deterministicModel.invoke([new HumanMessage(extractPrompt)]);
      aiResponse = result.content as string;
    } catch (err) {
      if (handleAiError(err, res)) return;
      throw err;
    }

    const filters = parseAiJson(aiResponse);
    if (!filters) return res.status(500).json({ message: "AI returned invalid response" });

    const { location, type, maxPrice, guests } = filters as {
      location: string | null;
      type: string | null;
      maxPrice: number | null;
      guests: number | null;
    };

    if (!location && !type && !maxPrice && !guests) {
      return res.status(400).json({
        message: "Could not extract any filters from your query, please be more specific",
      });
    }

    const where: Record<string, unknown> = {};
    if (location) where["location"] = { contains: location, mode: "insensitive" };
    if (type) where["type"] = type;
    if (maxPrice) where["pricePerNight"] = { lte: maxPrice };
    if (guests) where["guests"] = { gte: guests };

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        skip,
        take: limit,
        include: { host: { select: { id: true, name: true, email: true } } },
      }),
      prisma.listing.count({ where }),
    ]);

    res.json({
      filters: { location, type, maxPrice, guests },
      data: listings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

// PART 2 — Listing Description Generator with Tone Control
export async function generateDescription(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const tone: string = req.body.tone ?? "professional";

    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    if (listing.hostId !== req.userId) {
      return res.status(403).json({ message: "Forbidden: you are not the owner of this listing" });
    }

    const toneInstructions: Record<string, string> = {
      professional: "Write in a formal, clear, business-like tone. Be informative and precise.",
      casual: "Write in a friendly, relaxed, conversational tone. Be warm and approachable.",
      luxury:
        "Write in an elegant, premium, aspirational tone. Use rich language that evokes exclusivity and comfort.",
    };

    const instruction = toneInstructions[tone] ?? toneInstructions["professional"];

    const prompt = `Write a compelling property listing description for this rental property.
${instruction}
Keep it to 2-4 sentences.

Property details:
- Title: ${listing.title}
- Location: ${listing.location}
- Type: ${listing.type}
- Price per night: $${listing.pricePerNight}
- Max guests: ${listing.guests}
- Amenities: ${listing.amenities.join(", ")}

Return only the description text, no extra commentary.`;

    let description: string;
    try {
      const result = await model.invoke([new HumanMessage(prompt)]);
      description = (result.content as string).trim();
    } catch (err) {
      if (handleAiError(err, res)) return;
      throw err;
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: { description },
    });

    res.json({ description, listing: updated });
  } catch (error) {
    next(error);
  }
}

// PART 3 — Guest Support Chatbot with Listing Context
export async function chat(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sessionId, message, listingId } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ message: "sessionId and message are required" });
    }

    let systemContent =
      "You are a helpful guest support assistant for an Airbnb-like platform. Answer guest questions clearly and politely.";

    if (listingId) {
      const listing = await prisma.listing.findUnique({ where: { id: listingId } });
      if (!listing) return res.status(404).json({ message: "Listing not found" });

      systemContent = `You are a helpful guest support assistant for an Airbnb-like platform.
You are currently helping a guest with questions about this specific listing:

Title: ${listing.title}
Location: ${listing.location}
Price per night: $${listing.pricePerNight}
Max guests: ${listing.guests}
Type: ${listing.type}
Amenities: ${listing.amenities.join(", ")}
Description: ${listing.description}

Answer questions about this listing accurately based on the details above.
If asked something not covered by the listing details, say you don't have that information.`;
    }

    const history = chatSessions.get(sessionId) ?? [];

    // Trim to last 10 exchanges (20 messages)
    const trimmed = history.slice(-20);

    const messages = [
      new SystemMessage(systemContent),
      ...trimmed.map((m) =>
        m.role === "human" ? new HumanMessage(m.content) : new AIMessage(m.content)
      ),
      new HumanMessage(message),
    ];

    let aiResponse: string;
    try {
      const result = await model.invoke(messages);
      aiResponse = (result.content as string).trim();
    } catch (err) {
      if (handleAiError(err, res)) return;
      throw err;
    }

    trimmed.push({ role: "human", content: message });
    trimmed.push({ role: "ai", content: aiResponse });
    chatSessions.set(sessionId, trimmed);

    res.json({ response: aiResponse, sessionId, messageCount: trimmed.length });
  } catch (error) {
    next(error);
  }
}

// PART 4 — AI Booking Recommendation
export async function recommend(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;

    const bookings = await prisma.booking.findMany({
      where: { guestId: userId },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { listing: true },
    });

    if (bookings.length === 0) {
      return res.status(400).json({
        message: "No booking history found. Make some bookings first to get recommendations.",
      });
    }

    const historySummary = bookings
      .map(
        (b, i) =>
          `${i + 1}. ${b.listing.title} in ${b.listing.location} (${b.listing.type}), $${b.listing.pricePerNight}/night, ${b.listing.guests} guests max`
      )
      .join("\n");

    const prompt = `Based on this user's booking history, analyze their preferences and suggest search filters to find their next ideal listing.

Booking history:
${historySummary}

Return ONLY a JSON object in exactly this format, no explanation:
{
  "preferences": "string describing what the user likes",
  "searchFilters": {
    "location": "string or null",
    "type": "APARTMENT|HOUSE|VILLA|CABIN or null",
    "maxPrice": number or null,
    "guests": number or null
  },
  "reason": "string explaining the recommendation"
}`;

    let aiResponse: string;
    try {
      const result = await model.invoke([new HumanMessage(prompt)]);
      aiResponse = result.content as string;
    } catch (err) {
      if (handleAiError(err, res)) return;
      throw err;
    }

    const parsed = parseAiJson(aiResponse);
    if (!parsed) return res.status(500).json({ message: "AI returned invalid response" });

    const searchFilters = parsed["searchFilters"] as {
      location: string | null;
      type: string | null;
      maxPrice: number | null;
      guests: number | null;
    };

    const bookedListingIds = bookings.map((b) => b.listingId);
    const where: Record<string, unknown> = {
      id: { notIn: bookedListingIds },
    };
    if (searchFilters?.location)
      where["location"] = { contains: searchFilters.location, mode: "insensitive" };
    if (searchFilters?.type) where["type"] = searchFilters.type;
    if (searchFilters?.maxPrice) where["pricePerNight"] = { lte: searchFilters.maxPrice };
    if (searchFilters?.guests) where["guests"] = { gte: searchFilters.guests };

    const recommendations = await prisma.listing.findMany({
      where,
      take: 5,
      include: { host: { select: { id: true, name: true, email: true } } },
    });

    res.json({
      preferences: parsed["preferences"],
      reason: parsed["reason"],
      searchFilters,
      recommendations,
    });
  } catch (error) {
    next(error);
  }
}

// PART 5 — Listing Review Summarizer
export async function reviewSummary(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;

    const cacheKey = `ai:review-summary:${id}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const reviews = await prisma.review.findMany({
      where: { listingId: id },
      include: { user: { select: { name: true } } },
    });

    if (reviews.length < 3) {
      return res.status(400).json({
        message: "Not enough reviews to generate a summary (minimum 3 required)",
      });
    }

    const averageRating =
      Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10;

    const reviewsText = reviews
      .map((r) => `- ${r.user.name} (${r.rating}/5): "${r.comment}"`)
      .join("\n");

    const prompt = `Analyze these guest reviews for a rental property and return a JSON summary.

Reviews:
${reviewsText}

Return ONLY a JSON object in exactly this format:
{
  "summary": "2-3 sentence overall summary of guest experience",
  "positives": ["thing guests praised 1", "thing guests praised 2", "thing guests praised 3"],
  "negatives": ["thing guests complained about"]
}

Notes:
- positives must have exactly 3 items
- negatives can be an empty array if no complaints
- Return only the JSON, no extra text`;

    let aiResponse: string;
    try {
      const result = await model.invoke([new HumanMessage(prompt)]);
      aiResponse = result.content as string;
    } catch (err) {
      if (handleAiError(err, res)) return;
      throw err;
    }

    const parsed = parseAiJson(aiResponse);
    if (!parsed) return res.status(500).json({ message: "AI returned invalid response" });

    const result = {
      summary: parsed["summary"],
      positives: parsed["positives"],
      negatives: parsed["negatives"] ?? [],
      averageRating,
      totalReviews: reviews.length,
    };

    setCache(cacheKey, result, 10 * 60);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export function clearReviewSummaryCache(listingId: string): void {
  deleteCache(`ai:review-summary:${listingId}`);
}
