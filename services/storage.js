const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BUCKET_NAME = 'finance-club-dashboard-cache';

const storage = IS_PRODUCTION ? new Storage() : null;

// ── JSON cache files ──

async function readJSON(filepath, fallback) {
  if (!IS_PRODUCTION) {
    try {
      if (fs.existsSync(filepath)) return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch {}
    return fallback;
  }

  try {
    const filename = path.basename(filepath);
    const [contents] = await storage.bucket(BUCKET_NAME).file(filename).download();
    return JSON.parse(contents.toString());
  } catch (err) {
    if (err.code === 404) return fallback;
    console.error(`[Storage] Failed to read ${path.basename(filepath)}:`, err.message);
    return fallback;
  }
}

async function writeJSON(filepath, data) {
  if (!IS_PRODUCTION) {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    return;
  }

  try {
    const filename = path.basename(filepath);
    await storage.bucket(BUCKET_NAME).file(filename).save(JSON.stringify(data, null, 2), {
      contentType: 'application/json',
    });
  } catch (err) {
    console.error(`[Storage] Failed to write ${path.basename(filepath)}:`, err.message);
  }
}

// ── Images ──

async function uploadImage(localPath, gcsFilename) {
  if (!IS_PRODUCTION) return localPath;

  try {
    const destination = `images/${gcsFilename}`;
    await storage.bucket(BUCKET_NAME).upload(localPath, {
      destination,
      metadata: {
        cacheControl: 'public, max-age=86400',
      },
    });

    // Return a LOCAL proxy path — the Express app will stream from GCS
    return `/data/images/${gcsFilename}`;
  } catch (err) {
    console.error(`[Storage] Failed to upload image ${gcsFilename}:`, err.message);
    return null;
  }
}

async function streamImage(gcsPath) {
  if (!IS_PRODUCTION || !storage) return null;
  try {
    const file = storage.bucket(BUCKET_NAME).file(gcsPath);
    const [exists] = await file.exists();
    if (!exists) return null;
    return file.createReadStream();
  } catch (err) {
    console.error(`[Storage] Failed to stream ${gcsPath}:`, err.message);
    return null;
  }
}

async function imageExists(gcsFilename) {
  if (!IS_PRODUCTION) return false;
  try {
    const [exists] = await storage.bucket(BUCKET_NAME).file(`images/${gcsFilename}`).exists();
    return exists;
  } catch {
    return false;
  }
}

module.exports = { readJSON, writeJSON, uploadImage, imageExists, streamImage };
