import type { Response } from "express";
import prisma from "../config/prisma";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../config/cloudinary";
import type { AuthRequest } from "../middlewares/auth.middleware";


// 👤 USER AVATAR


// POST /users/:id/avatar
export async function uploadAvatar(req: AuthRequest, res: Response) {
  const id = parseInt(req.params.id as string);

  // 🔐 Only owner can upload
  if (req.userId !== id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  // 🧹 Delete old avatar if exists
  if (user.avatarPublicId) {
    await deleteFromCloudinary(user.avatarPublicId);
  }

  const { url, publicId } = await uploadToCloudinary(
    req.file.buffer,
    "airbnb/avatars"
  );

  const updated = await prisma.user.update({
    where: { id },
    data: {
      avatar: url,
      avatarPublicId: publicId,
    },
  });

  const { password, ...safeUser } = updated;

  res.json({
    message: "Avatar uploaded successfully",
    user: safeUser,
  });
}

// DELETE /users/:id/avatar
export async function deleteAvatar(req: AuthRequest, res: Response) {
  const id = parseInt(req.params.id as string);

  if (req.userId !== id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!user.avatarPublicId) {
    return res.status(400).json({ error: "No avatar to remove" });
  }

  await deleteFromCloudinary(user.avatarPublicId);

  await prisma.user.update({
    where: { id },
    data: {
      avatar: null,
      avatarPublicId: null,
    },
  });

  res.json({ message: "Avatar removed successfully" });
}

// 🏠 LISTING PHOTOS


// POST /listings/:id/photos
export async function uploadListingPhotos(
  req: AuthRequest,
  res: Response
) {
  const id = parseInt(req.params.id as string);

  const listing = await prisma.listing.findUnique({
    where: { id },
  });

  if (!listing) {
    return res.status(404).json({ error: "Listing not found" });
  }

  // 🔐 Only host can upload
  if (listing.hostId !== req.userId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const existingCount = await prisma.listingPhoto.count({
    where: { listingId: id },
  });

  if (existingCount >= 5) {
    return res
      .status(400)
      .json({ error: "Maximum of 5 photos allowed" });
  }

  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const remainingSlots = 5 - existingCount;
  const filesToUpload = files.slice(0, remainingSlots);

  const uploads = await Promise.all(
    filesToUpload.map((file) =>
      uploadToCloudinary(file.buffer, "airbnb/listings")
    )
  );

  await prisma.listingPhoto.createMany({
    data: uploads.map((u) => ({
      url: u.url,
      publicId: u.publicId,
      listingId: id,
    })),
  });

  const updatedListing = await prisma.listing.findUnique({
    where: { id },
    include: { photos: true },
  });

  res.json({
    message: "Photos uploaded successfully",
    listing: updatedListing,
  });
}

// DELETE /listings/:id/photos/:photoId
export async function deleteListingPhoto(
  req: AuthRequest,
  res: Response
) {
  const listingId = parseInt(req.params.id as string);
  const photoId = parseInt(req.params.photoId as string);

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing) {
    return res.status(404).json({ error: "Listing not found" });
  }

  if (listing.hostId !== req.userId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const photo = await prisma.listingPhoto.findUnique({
    where: { id: photoId },
  });

  if (!photo) {
    return res.status(404).json({ error: "Photo not found" });
  }

  // 🔐 Prevent deleting other listing photos
  if (photo.listingId !== listingId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await deleteFromCloudinary(photo.publicId);

  await prisma.listingPhoto.delete({
    where: { id: photoId },
  });

  res.json({ message: "Photo deleted successfully" });
}