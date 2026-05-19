import type { Response } from "express";
import prisma from "../config/prisma";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../config/cloudinary";
import { deleteCacheByPrefix } from "../config/cache";
import type { AuthRequest } from "../middlewares/auth.middleware";

const MIN_LISTING_PHOTOS = 3;
const MAX_LISTING_PHOTOS = 100;

function isDataImageUrl(value: string) {
  return value.startsWith("data:image/");
}

function photoUrlFromValue(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const possibleUrl = record["url"] ?? record["secure_url"] ?? record["imageUrl"] ?? record["src"];

  if (typeof possibleUrl !== "string") return null;

  const normalized = possibleUrl.trim();
  return normalized ? normalized : null;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map(photoUrlFromValue).filter((item): item is string => Boolean(item));
  }
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map(photoUrlFromValue).filter((item): item is string => Boolean(item));
    }
  } catch (_) {}

  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}

function listingUploadFiles(req: AuthRequest) {
  if (Array.isArray(req.files)) return req.files;

  const filesByField = req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;

  return [
    ...(filesByField?.["images"] ?? []),
    ...(filesByField?.["photos"] ?? []),
  ];
}

function publicIdFromUrl(url: string) {
  const marker = "/upload/";
  const uploadIndex = url.indexOf(marker);
  if (uploadIndex === -1) return null;

  const path = url.slice(uploadIndex + marker.length);
  const withoutVersion = path.replace(/^v\d+\//, "");
  return withoutVersion.replace(/\.[^/.]+$/, "");
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function matchesPhotoId(url: string, photoId: string) {
  const decodedPhotoId = safeDecode(photoId);
  return url === decodedPhotoId || publicIdFromUrl(url) === decodedPhotoId;
}


// 👤 USER AVATAR


// POST /users/:id/avatar
export async function uploadAvatar(req: AuthRequest, res: Response) {
  const id = req.params["id"] as string;

  if (req.userId !== id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.avatar) {
    const publicId = publicIdFromUrl(user.avatar);
    try {
      if (publicId) await deleteFromCloudinary(publicId);
    } catch (_) {}
  }

  const { url } = await uploadToCloudinary(
    req.file.buffer,
    "airbnb/avatars"
  );

  const updated = await prisma.user.update({
    where: { id },
    data: { avatar: url },
  });

  const { password, ...safeUser } = updated;

  res.json({
    message: "Avatar uploaded successfully",
    user: safeUser,
  });
}

// DELETE /users/:id/avatar
export async function deleteAvatar(req: AuthRequest, res: Response) {
  const id = req.params["id"] as string;

  if (req.userId !== id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!user.avatar) {
    return res.status(400).json({ error: "No avatar to remove" });
  }

  const publicId = publicIdFromUrl(user.avatar);
  try {
    if (publicId) await deleteFromCloudinary(publicId);
  } catch (_) {}

  await prisma.user.update({
    where: { id },
    data: { avatar: null },
  });

  res.json({ message: "Avatar removed successfully" });
}

// 🏠 LISTING PHOTOS


// POST /listings/:id/photos
export async function uploadListingPhotos(
  req: AuthRequest,
  res: Response
) {
  const id = req.params["id"] as string;

  const listing = await prisma.listing.findUnique({ where: { id } });

  if (!listing) {
    return res.status(404).json({ error: "Listing not found" });
  }

  if (listing.hostId !== req.userId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const files = listingUploadFiles(req);

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const currentPhotos = Array.isArray(listing.photos) ? (listing.photos as string[]) : [];
  const requestedKeepPhotos = parseStringArray(req.body["photos"] ?? req.body["keepPhotos"]);
  const persistedPhotos = (requestedKeepPhotos ?? currentPhotos).filter((photo) => !isDataImageUrl(photo));

  if (persistedPhotos.length + files.length > MAX_LISTING_PHOTOS) {
    return res.status(400).json({ message: `A listing can have at most ${MAX_LISTING_PHOTOS} photos` });
  }

  const filesToUpload = files.slice(0, MAX_LISTING_PHOTOS - persistedPhotos.length);
  const uploads: Array<{ url: string; publicId: string }> = [];

  try {
    for (const file of filesToUpload) {
      uploads.push(await uploadToCloudinary(file.buffer, "airbnb/listings"));
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing Cloudinary configuration")) {
      return res.status(500).json({
        error: "Photo upload is not configured on the server. Add Cloudinary variables on Render and redeploy.",
      });
    }

    console.error("Cloudinary listing upload failed:", error);
    return res.status(502).json({
      error: "Photo upload failed. Check the Cloudinary environment variables on Render, then redeploy.",
    });
  }

  const newUrls = uploads.map((u) => u.url);

  const nextPhotos = [...persistedPhotos, ...newUrls];

  if (listing.published && nextPhotos.length < MIN_LISTING_PHOTOS) {
    return res.status(400).json({ message: `At least ${MIN_LISTING_PHOTOS} photos are required for a published listing` });
  }

  const removedPhotos = currentPhotos.filter((url) => !persistedPhotos.includes(url) && !isDataImageUrl(url));
  for (const url of removedPhotos) {
    const publicId = publicIdFromUrl(url);
    try {
      if (publicId) await deleteFromCloudinary(publicId);
    } catch (_) {}
  }

  await prisma.listing.update({
    where: { id },
    data: { photos: nextPhotos },
  });

  deleteCacheByPrefix("listings:");
  deleteCacheByPrefix("stats:listings");

  res.json({
    message: "Photos uploaded successfully",
    urls: newUrls,
    photos: uploads.map((u) => ({ url: u.url, publicId: u.publicId })),
  });
}

// DELETE /listings/:id/photos/:photoId
export async function deleteListingPhoto(
  req: AuthRequest,
  res: Response
) {
  const id = req.params["id"] as string;
  const photoId = req.params["photoId"] as string;

  const listing = await prisma.listing.findUnique({ where: { id } });

  if (!listing) {
    return res.status(404).json({ error: "Listing not found" });
  }

  if (listing.hostId !== req.userId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const decodedPhotoId = safeDecode(photoId);
  const targetPhoto = (listing.photos as string[]).find((url) => matchesPhotoId(url, decodedPhotoId));
  const nextPhotos = (listing.photos as string[]).filter((url) => !matchesPhotoId(url, decodedPhotoId));

  if (!targetPhoto || nextPhotos.length === listing.photos.length) {
    return res.status(404).json({ error: "Photo not found" });
  }

  const targetPublicId = publicIdFromUrl(targetPhoto) ?? decodedPhotoId;

  try {
    await deleteFromCloudinary(targetPublicId);
  } catch (_) {
    return res.status(404).json({ error: "Photo not found" });
  }

  const updatedListing = await prisma.listing.update({
    where: { id },
    data: { photos: nextPhotos },
  });

  deleteCacheByPrefix("listings:");
  deleteCacheByPrefix("stats:listings");

  res.json({ message: "Photo deleted successfully", listing: updatedListing });
}
