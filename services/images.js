const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const config  = require('../config');
const { uploadImage } = require('./storage');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

async function downloadImage(url, filename, subdir) {
  try {
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': subdir === 'li' ? 'https://www.linkedin.com/' : 'https://www.instagram.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    const ext = (resp.headers['content-type'] || '').includes('png') ? '.png' : '.jpg';
    const gcsFilename = `${subdir}/${filename}${ext}`;

    if (IS_PRODUCTION) {
      const tmpPath = path.join(os.tmpdir(), gcsFilename.replace('/', '_'));
      fs.writeFileSync(tmpPath, resp.data);
      const gcsUrl = await uploadImage(tmpPath, gcsFilename);
      try { fs.unlinkSync(tmpPath); } catch {}
      return gcsUrl;
    } else {
      const targetDir = subdir === 'li' ? config.LI_IMAGES : config.IG_IMAGES;
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const filepath = path.join(targetDir, filename + ext);
      fs.writeFileSync(filepath, resp.data);
      return `/data/images/${subdir}/${filename}${ext}`;
    }
  } catch (err) {
    console.error(`[Image] Failed to download ${filename}:`, err.message);
    return null;
  }
}

async function downloadPostImages(posts, subdir) {
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
