const axios  = require('axios');
const path   = require('path');
const fs     = require('fs');
const config = require('../config');
const { ensureDataDir } = require('./cache');

async function downloadImage(url, filename, subdir) {
  try {
    const targetDir = subdir === 'li' ? config.LI_IMAGES : config.IG_IMAGES;
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const ext = (resp.headers['content-type'] || '').includes('png') ? '.png' : '.jpg';
    const filepath = path.join(targetDir, filename + ext);
    fs.writeFileSync(filepath, resp.data);
    return `/data/images/${subdir}/${filename}${ext}`;
  } catch (err) {
    console.error(`[Image] Failed to download ${filename}:`, err.message);
    return null;
  }
}

async function downloadPostImages(posts, subdir) {
  ensureDataDir();
  const results = [];
  for (const p of posts) {
    const url = p._originalImageUrl;
    if (url) {
      const localPath = await downloadImage(url, p.id, subdir);
      results.push({ ...p, local_image: localPath });
    } else {
      results.push({ ...p, local_image: null });
    }
  }
  return results;
}

async function downloadProfilePic(url, filename, subdir) {
  if (!url) return null;
  return downloadImage(url, filename, subdir);
}

module.exports = { downloadImage, downloadPostImages, downloadProfilePic };
