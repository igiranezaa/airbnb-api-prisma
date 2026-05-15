import type { Response } from "express";
import prisma from "../config/prisma";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../config/cloudinary";
import { deleteCacheByPrefix } from "../config/cache";
import type { AuthRequest } from "../middlewares/auth.middleware";

const MAX_LISTING_PHOTOS = 5;

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
    // avatar field stores the cloudinary URL; extract public_id from URL for deletion
    const parts = user.avatar.split("/");
    const publicId = parts.slice(-2).join("/").replace(/\.[^/.]+$/, "");
    try {
      await deleteFromCloudinary(publicId);
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

  const parts = user.avatar.split("/");
  const publicId = parts.slice(-2).join("/").replace(/\.[^/.]+$/, "");
  try {
    await deleteFromCloudinary(publicId);
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

  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const currentPhotos = Array.isArray(listing.photos) ? (listing.photos as string[]) : [];
  const remainingSlots = MAX_LISTING_PHOTOS - currentPhotos.length;

  if (remainingSlots <= 0) {
    return res.status(400).json({ error: `A listing can have at most ${MAX_LISTING_PHOTOS} photos` });
  }

  const filesToUpload = files.slice(0, remainingSlots);
  const uploads: Array<{ url: string; publicId: string }> = [];

  for (const file of filesToUpload) {
    uploads.push(await uploadToCloudinary(file.buffer, "airbnb/listings"));
  }

  const newUrls = uploads.map((u) => u.url);

  const updatedListing = await prisma.listing.update({
    where: { id },
    data: { photos: [...currentPhotos, ...newUrls] },
  });

  deleteCacheByPrefix("listings:");
  deleteCacheByPrefix("stats:listings");

  res.json({
    message: "Photos uploaded successfully",
    photos: uploads.map((u) => ({ url: u.url, publicId: u.publicId })),
    listing: updatedListing,
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
