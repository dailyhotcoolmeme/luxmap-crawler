import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const CANVAS_SIZE = 960;
const CONTENT_SIZE = 820;

async function edgeBackground(source) {
  const { data, info } = await sharp(source).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const corners = [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]];
  const colors = corners.map(([x, y]) => {
    const offset = (y * info.width + x) * info.channels;
    return [data[offset], data[offset + 1], data[offset + 2]];
  });
  return {
    r: Math.round(colors.reduce((sum, color) => sum + color[0], 0) / colors.length),
    g: Math.round(colors.reduce((sum, color) => sum + color[1], 0) / colors.length),
    b: Math.round(colors.reduce((sum, color) => sum + color[2], 0) / colors.length),
    alpha: 1,
  };
}

export async function downloadAndOptimizeImage(context, imageUrl, artifactDir) {
  const response = await context.request.get(imageUrl, { timeout: 30000 });
  if (!response.ok()) throw new Error(`image download failed: ${response.status()}`);
  const source = await response.body();
  const background = await edgeBackground(source);
  const trimmed = await sharp(source)
    .rotate()
    .flatten({ background })
    .trim({ background, threshold: 20 })
    .toBuffer();
  const fitted = await sharp(trimmed).resize({ width: CONTENT_SIZE, height: CONTENT_SIZE, fit: "inside" }).toBuffer();
  const fittedMetadata = await sharp(fitted).metadata();
  const horizontal = CANVAS_SIZE - fittedMetadata.width;
  const vertical = CANVAS_SIZE - fittedMetadata.height;
  const output = await sharp(fitted)
    .extend({
      left: Math.floor(horizontal / 2), right: Math.ceil(horizontal / 2),
      top: Math.floor(vertical / 2), bottom: Math.ceil(vertical / 2),
      background,
    })
    .webp({ quality: 78, effort: 4 })
    .toBuffer();
  const sha256 = crypto.createHash("sha256").update(output).digest("hex");
  const outputPath = path.join(artifactDir, `${sha256}.webp`);
  try { await fs.access(outputPath); } catch { await fs.writeFile(outputPath, output); }
  const metadata = await sharp(output).metadata();
  return { imagePath: outputPath, imageSha256: sha256, imageMimeType: "image/webp", imageWidth: metadata.width, imageHeight: metadata.height, imageBytes: output.length };
}
