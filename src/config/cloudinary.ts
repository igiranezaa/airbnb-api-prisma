import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function assertCloudinaryConfig() {
  const missing = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ].filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing Cloudinary configuration: ${missing.join(", ")}`);
  }
}

export async function uploadToCloudinary(buffer: Buffer, folder: string) {
  assertCloudinaryConfig();

  return new Promise<{ url: string; publicId: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );
    stream.end(buffer);
  });
}

export async function deleteFromCloudinary(publicId: string) {
  assertCloudinaryConfig();

  await cloudinary.uploader.destroy(publicId);
}
