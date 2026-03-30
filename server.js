require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcrypt');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 1000;
const MOCK = process.env.MOCK_DATA === 'true';

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const IG_USERNAME = process.env.INSTAGRAM_USERNAME || 'finance.club.leipzig';
const LI_COMPANY_URL = process.env.LINKEDIN_COMPANY_URL;

if (MOCK) console.log('[MOCK] Running in mock-data mode.');
else console.log(`[Config] APIFY  IG_USERNAME=${IG_USERNAME}  LI_COMPANY=${LI_COMPANY_URL}`);

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — Instagram
// ─────────────────────────────────────────────────────────────────────────────
function buildMockCache() {
  const days = 30;
  const makeTimeseries = (base, variance) =>
    Array.from({ length: days }, (_, i) => ({
      value: Math.floor(base + Math.sin(i / 3) * variance + Math.random() * (variance / 2)),
      end_time: new Date(Date.now() - (days - 1 - i) * 86400000).toISOString(),
    }));

  return {
    lastFetch: new Date().toISOString(),
    account: {
      id: '123456789',
      username: 'financeclub_leipzig',
      name: 'Finance Club Leipzig',
      biography: 'Student-run finance club at Leipzig University\nInvesting - Markets - Careers',
      followers_count: 1284,
      media_count: 87,
      profile_picture_url: 'https://placehold.co/120x120/1a1a2e/ffffff?text=FCL',
      website: 'https://financeclub-leipzig.de',
    },
    insights: [
      { name: 'impressions',    period: 'day', title: 'Impressions',    values: makeTimeseries(1100, 400) },
      { name: 'reach',          period: 'day', title: 'Reach',          values: makeTimeseries(700,  250) },
      { name: 'profile_views',  period: 'day', title: 'Profile Views',  values: makeTimeseries(60,   30)  },
      { name: 'follower_count', period: 'day', title: 'Follower Count', values: makeTimeseries(1250, 15)  },
    ],
    posts: [
      {
        id: 'post_001', caption: 'Our recap of the latest ECB rate decision.', media_type: 'IMAGE',
        timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/1a1a2e/ffffff?text=ECB+Recap',
        local_image: null,
        insights: { impressions: 0, reach: 0, saved: 0, likes: 134, comments: 12, video_views: 0, engagement: 146 },
      },
      {
        id: 'post_002', caption: 'Event recap: our panel on sustainable investing.', media_type: 'IMAGE',
        timestamp: new Date(Date.now() - 4 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/16213e/ffffff?text=Event+Recap',
        local_image: null,
        insights: { impressions: 0, reach: 0, saved: 0, likes: 287, comments: 34, video_views: 0, engagement: 321 },
      },
      {
        id: 'post_003', caption: 'Week in markets: S&P hits new highs.', media_type: 'CAROUSEL_ALBUM',
        timestamp: new Date(Date.now() - 7 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/0f3460/ffffff?text=Markets+Week',
        local_image: null,
        insights: { impressions: 0, reach: 0, saved: 0, likes: 198, comments: 21, video_views: 0, engagement: 219 },
      },
      {
        id: 'post_004', caption: 'Welcoming our new semester members!', media_type: 'IMAGE',
        timestamp: new Date(Date.now() - 11 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/533483/ffffff?text=New+Members',
        local_image: null,
        insights: { impressions: 0, reach: 0, saved: 0, likes: 312, comments: 45, video_views: 0, engagement: 357 },
      },
      {
        id: 'post_005', caption: 'Reel: 60 seconds on how to read a P&L statement.', media_type: 'VIDEO',
        timestamp: new Date(Date.now() - 15 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/e94560/ffffff?text=Reel',
        local_image: null,
        insights: { impressions: 0, reach: 0, saved: 0, likes: 521, comments: 67, video_views: 4100, engagement: 588 },
      },
      {
        id: 'post_006', caption: 'Book of the month: "The Intelligent Investor".', media_type: 'CAROUSEL_ALBUM',
        timestamp: new Date(Date.now() - 20 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/1a1a2e/ffffff?text=Book+Club',
        local_image: null,
        insights: { impressions: 0, reach: 0, saved: 0, likes: 167, comments: 18, video_views: 0, engagement: 185 },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — LinkedIn
// ─────────────────────────────────────────────────────────────────────────────
function buildLiMockCache() {
  const days = 30;
  const makeTimeseries = (base, variance) =>
    Array.from({ length: days }, (_, i) => ({
      value: Math.floor(base + Math.sin(i / 4) * variance + Math.random() * (variance / 2)),
      end_time: new Date(Date.now() - (days - 1 - i) * 86400000).toISOString(),
    }));

  return {
    lastFetch: new Date().toISOString(),
    account: {
      name: 'Finance Club Leipzig',
      description: 'Student-run finance club at Leipzig University. We connect students with the world of finance through events, workshops, and networking.',
      tagline: 'Bridging Academia and Finance',
      followers_count: 342,
      employee_count: 15,
      logo_url: 'https://placehold.co/120x120/0077b5/ffffff?text=FCL',
      cover_url: '',
      website: 'https://financeclub-leipzig.de',
      linkedin_url: 'https://www.linkedin.com/company/finance-club-leipzig',
    },
    insights: [
      { name: 'follower_count', period: 'day', title: 'Follower Count', values: makeTimeseries(320, 10) },
      { name: 'engagement_rate', period: 'day', title: 'Engagement Rate (%)', values: makeTimeseries(5.2, 1.5) },
    ],
    posts: [
      {
        id: 'li_post_001',
        text: 'Excited to announce our partnership with Deutsche Börse for next semester\'s trading competition! 🏆📈',
        media_type: 'IMAGE',
        timestamp: new Date(Date.now() - 2 * 86400000).toISOString(),
        permalink: 'https://www.linkedin.com/',
        local_image: 'https://placehold.co/400x300/0077b5/ffffff?text=Trading+Comp',
        insights: {
          reactions: 89, comments: 14, shares: 23, engagement: 126,
          reaction_breakdown: { LIKE: 62, APPRECIATION: 12, PRAISE: 8, EMPATHY: 4, INTEREST: 3, ENTERTAINMENT: 0 },
        },
      },
      {
        id: 'li_post_002',
        text: 'Our latest workshop on DCF valuation attracted over 60 participants! Thank you to everyone who joined. 📊',
        media_type: 'IMAGE',
        timestamp: new Date(Date.now() - 5 * 86400000).toISOString(),
        permalink: 'https://www.linkedin.com/',
        local_image: 'https://placehold.co/400x300/16213e/ffffff?text=DCF+Workshop',
        insights: {
          reactions: 145, comments: 28, shares: 31, engagement: 204,
          reaction_breakdown: { LIKE: 98, APPRECIATION: 22, PRAISE: 14, EMPATHY: 6, INTEREST: 5, ENTERTAINMENT: 0 },
        },
      },
      {
        id: 'li_post_003',
        text: 'Market outlook Q2 2026: Our research team shares their analysis on European equities and fixed income trends.',
        media_type: 'DOCUMENT',
        timestamp: new Date(Date.now() - 9 * 86400000).toISOString(),
        permalink: 'https://www.linkedin.com/',
        local_image: 'https://placehold.co/400x300/0f3460/ffffff?text=Q2+Outlook',
        insights: {
          reactions: 201, comments: 42, shares: 55, engagement: 298,
          reaction_breakdown: { LIKE: 130, APPRECIATION: 30, PRAISE: 18, EMPATHY: 8, INTEREST: 15, ENTERTAINMENT: 0 },
        },
      },
      {
        id: 'li_post_004',
        text: 'We\'re hiring! Looking for a new Head of Marketing for the upcoming semester. Apply now! 🚀',
        media_type: 'IMAGE',
        timestamp: new Date(Date.now() - 14 * 86400000).toISOString(),
        permalink: 'https://www.linkedin.com/',
        local_image: 'https://placehold.co/400x300/533483/ffffff?text=Hiring',
        insights: {
          reactions: 178, comments: 35, shares: 67, engagement: 280,
          reaction_breakdown: { LIKE: 120, APPRECIATION: 28, PRAISE: 15, EMPATHY: 5, INTEREST: 8, ENTERTAINMENT: 2 },
        },
      },
      {
        id: 'li_post_005',
        text: 'Throwback to our networking event with alumni from Goldman Sachs, McKinsey and BCG. What an inspiring evening! 🤝',
        media_type: 'IMAGE',
        timestamp: new Date(Date.now() - 20 * 86400000).toISOString(),
        permalink: 'https://www.linkedin.com/',
        local_image: 'https://placehold.co/400x300/0077b5/ffffff?text=Networking',
        insights: {
          reactions: 312, comments: 56, shares: 48, engagement: 416,
          reaction_breakdown: { LIKE: 210, APPRECIATION: 45, PRAISE: 30, EMPATHY: 12, INTEREST: 10, ENTERTAINMENT: 5 },
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE + HISTORY — Shared Helpers
// ─────────────────────────────────────────────────────────────────────────────
const DATA_DIR    = path.join(__dirname, 'data');
const IG_IMAGES   = path.join(DATA_DIR, 'images', 'ig');
const LI_IMAGES   = path.join(DATA_DIR, 'images', 'li');

const IG_CACHE_FILE   = path.join(DATA_DIR, 'ig_cache.json');
const IG_HISTORY_FILE = path.join(DATA_DIR, 'ig_history.json');
const LI_CACHE_FILE   = path.join(DATA_DIR, 'li_cache.json');
const LI_HISTORY_FILE = path.join(DATA_DIR, 'li_history.json');

// Legacy file paths for migration
const LEGACY_CACHE_FILE   = path.join(DATA_DIR, 'cache.json');
const LEGACY_HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const LEGACY_IMAGES_DIR   = path.join(DATA_DIR, 'images');

function ensureDataDir() {
  [DATA_DIR, IG_IMAGES, LI_IMAGES].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

// ── One-time migration from old file names ──
function migrateDataFiles() {
  ensureDataDir();
  // Migrate cache.json → ig_cache.json
  if (fs.existsSync(LEGACY_CACHE_FILE) && !fs.existsSync(IG_CACHE_FILE)) {
    console.log('[Migration] Renaming cache.json → ig_cache.json');
    fs.renameSync(LEGACY_CACHE_FILE, IG_CACHE_FILE);
  }
  // Migrate history.json → ig_history.json
  if (fs.existsSync(LEGACY_HISTORY_FILE) && !fs.existsSync(IG_HISTORY_FILE)) {
    console.log('[Migration] Renaming history.json → ig_history.json');
    fs.renameSync(LEGACY_HISTORY_FILE, IG_HISTORY_FILE);
  }
  // Move images from data/images/*.jpg → data/images/ig/*.jpg
  if (fs.existsSync(LEGACY_IMAGES_DIR)) {
    const files = fs.readdirSync(LEGACY_IMAGES_DIR);
    files.forEach(f => {
      const full = path.join(LEGACY_IMAGES_DIR, f);
      if (fs.statSync(full).isFile()) {
        const dest = path.join(IG_IMAGES, f);
        if (!fs.existsSync(dest)) {
          console.log(`[Migration] Moving image ${f} → images/ig/`);
          fs.renameSync(full, dest);
        }
      }
    });
  }

  // ── Patch old image paths in ig_cache.json ──
  if (fs.existsSync(IG_CACHE_FILE)) {
    try {
      const raw = fs.readFileSync(IG_CACHE_FILE, 'utf8');
      // Only patch if there are old-style paths (without /ig/ or /li/)
      if (raw.includes('/data/images/') && !raw.includes('/data/images/ig/')) {
        console.log('[Migration] Patching image paths in ig_cache.json...');
        const patched = raw.replace(/\/data\/images\/(?!ig\/|li\/)/g, '/data/images/ig/');
        fs.writeFileSync(IG_CACHE_FILE, patched);
      }
    } catch (e) {
      console.error('[Migration] Failed to patch ig_cache.json paths:', e.message);
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// INSTAGRAM — Cache + History
// ─────────────────────────────────────────────────────────────────────────────
let igCache = { account: null, insights: null, posts: null, lastFetch: null };

function loadIgHistory() {
  try {
    if (fs.existsSync(IG_HISTORY_FILE)) return JSON.parse(fs.readFileSync(IG_HISTORY_FILE, 'utf8'));
  } catch {}
  return { followers: [], engagement_rate: [] };
}

function saveIgHistory(history) {
  ensureDataDir();
  fs.writeFileSync(IG_HISTORY_FILE, JSON.stringify(history, null, 2));
}

function loadIgCacheFromDisk() {
  try {
    if (fs.existsSync(IG_CACHE_FILE)) {
      igCache = JSON.parse(fs.readFileSync(IG_CACHE_FILE, 'utf8'));
      // Fix old image paths: /data/images/x → /data/images/ig/x
      if (igCache.account && igCache.account.profile_picture_url
          && igCache.account.profile_picture_url.startsWith('/data/images/')
          && !igCache.account.profile_picture_url.startsWith('/data/images/ig/')) {
        igCache.account.profile_picture_url = igCache.account.profile_picture_url.replace('/data/images/', '/data/images/ig/');
      }
      if (igCache.posts) {
        igCache.posts.forEach(p => {
          if (p.local_image && p.local_image.startsWith('/data/images/')
              && !p.local_image.startsWith('/data/images/ig/')) {
            p.local_image = p.local_image.replace('/data/images/', '/data/images/ig/');
          }
        });
      }
      console.log(`[IG Cache] Loaded from disk — last fetch: ${igCache.lastFetch}`);
    }
  } catch {}
}
function saveIgCacheToDisk() {
  ensureDataDir();
  fs.writeFileSync(IG_CACHE_FILE, JSON.stringify(igCache, null, 2));
}

function appendIgSnapshot(followersCount, engagementRate) {
  const history = loadIgHistory();
  const today = new Date().toISOString().slice(0, 10);
  if (!history.followers.some(e => e.date === today)) {
    history.followers.push({ date: today, value: followersCount });
  }
  if (engagementRate != null && !history.engagement_rate.some(e => e.date === today)) {
    history.engagement_rate.push({ date: today, value: engagementRate });
  }
  history.followers = history.followers.slice(-90);
  history.engagement_rate = history.engagement_rate.slice(-90);
  saveIgHistory(history);
  return history;
}

function igFetchedToday() {
  if (!igCache.lastFetch) return false;
  return new Date(igCache.lastFetch).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// LINKEDIN — Cache + History
// ─────────────────────────────────────────────────────────────────────────────
let liCache = { account: null, insights: null, posts: null, lastFetch: null };

function loadLiHistory() {
  try {
    if (fs.existsSync(LI_HISTORY_FILE)) return JSON.parse(fs.readFileSync(LI_HISTORY_FILE, 'utf8'));
  } catch {}
  return { followers: [], engagement_rate: [] };
}

function saveLiHistory(history) {
  ensureDataDir();
  fs.writeFileSync(LI_HISTORY_FILE, JSON.stringify(history, null, 2));
}

function loadLiCacheFromDisk() {
  try {
    if (fs.existsSync(LI_CACHE_FILE)) {
      liCache = JSON.parse(fs.readFileSync(LI_CACHE_FILE, 'utf8'));
      console.log(`[LI Cache] Loaded from disk — last fetch: ${liCache.lastFetch}`);
    }
  } catch {}
}

function saveLiCacheToDisk() {
  ensureDataDir();
  fs.writeFileSync(LI_CACHE_FILE, JSON.stringify(liCache, null, 2));
}

function appendLiSnapshot(followersCount, engagementRate) {
  const history = loadLiHistory();
  const today = new Date().toISOString().slice(0, 10);
  if (!history.followers.some(e => e.date === today)) {
    history.followers.push({ date: today, value: followersCount });
  }
  if (engagementRate != null && !history.engagement_rate.some(e => e.date === today)) {
    history.engagement_rate.push({ date: today, value: engagementRate });
  }
  history.followers = history.followers.slice(-90);
  history.engagement_rate = history.engagement_rate.slice(-90);
  saveLiHistory(history);
  return history;
}

function liFetchedToday() {
  if (!liCache.lastFetch) return false;
  return new Date(liCache.lastFetch).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE DOWNLOADER
// ─────────────────────────────────────────────────────────────────────────────
async function downloadImage(url, filename, subdir) {
  try {
    const targetDir = subdir === 'li' ? LI_IMAGES : IG_IMAGES;
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

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────
const PASSWORD_HASH = bcrypt.hashSync(process.env.DASHBOARD_PASSWORD || 'ChangeMe123!', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 },
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/login', async (req, res) => {
  const { password } = req.body;
  const match = await bcrypt.compare(password, PASSWORD_HASH);
  if (match) { req.session.authenticated = true; return res.redirect('/'); }
  res.redirect('/login?error=1');
});

app.post('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// Serve downloaded images (behind auth)
app.use('/data/images/ig', requireAuth, express.static(IG_IMAGES));
app.use('/data/images/li', requireAuth, express.static(LI_IMAGES));

// Serve static files (behind auth)
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// APIFY — Instagram Profile Scraper (unchanged logic, updated var names)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchIgFromApify() {
  console.log(`[Apify/IG] Scraping @${IG_USERNAME}...`);

  const url = 'https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items';

  const { data } = await axios.post(url, {
    usernames: [IG_USERNAME],
  }, {
    params: { token: APIFY_TOKEN },
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000,
  });

  if (!data || data.length === 0) {
    throw new Error('Apify returned no data — check username or token');
  }

  const profile = data[0];

  const originalPicUrl = profile.profilePicUrlHD || profile.profilePicUrl || '';
  const localPicUrl = await downloadProfilePic(originalPicUrl, 'profile_' + (profile.username || IG_USERNAME), 'ig');

  const account = {
    id: profile.id || profile.igId || '',
    username: profile.username || IG_USERNAME,
    name: profile.fullName || profile.username || '',
    biography: profile.biography || '',
    followers_count: profile.followersCount ?? profile.subscribersCount ?? 0,
    following_count: profile.followsCount ?? profile.followingCount ?? 0,
    media_count: profile.postsCount ?? profile.mediaCount ?? 0,
    profile_picture_url: localPicUrl || originalPicUrl,
    website: profile.externalUrl || profile.website || '',
    is_verified: profile.verified ?? profile.isVerified ?? false,
    is_private: profile.private ?? profile.isPrivate ?? false,
  };

  const rawPosts = profile.latestPosts || profile.posts || [];
  let posts = rawPosts.slice(0, 12).map(p => {
    const likes    = p.likesCount ?? p.likes ?? 0;
    const comments = p.commentsCount ?? p.comments ?? 0;
    const videoViews = p.videoViewCount ?? p.videoPlayCount ?? p.video_views ?? 0;

    let media_type = 'IMAGE';
    if (p.type === 'Video' || p.isVideo || p.videoUrl) media_type = 'VIDEO';
    else if (p.type === 'Sidecar' || p.childPosts?.length) media_type = 'CAROUSEL_ALBUM';

    let imageUrl = p.displayUrl || p.imageUrl || '';
    if (!imageUrl && p.images && p.images.length > 0) imageUrl = p.images[0];
    if (!imageUrl && p.childPosts && p.childPosts.length > 0) imageUrl = p.childPosts[0].displayUrl || p.childPosts[0].imageUrl || '';
    if (media_type === 'VIDEO' && !imageUrl) imageUrl = p.previewUrl || p.thumbnailUrl || p.videoThumbnailUrl || '';

    return {
      id: p.shortCode || p.id || '',
      caption: (p.caption || '').slice(0, 500),
      media_type,
      timestamp: p.timestamp ? p.timestamp : p.takenAtTimestamp ? new Date(p.takenAtTimestamp * 1000).toISOString() : '',
      permalink: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ''),
      _originalImageUrl: imageUrl,
      media_url: '',
      thumbnail_url: '',
      local_image: null,
      insights: { impressions: 0, reach: 0, saved: 0, likes, comments, video_views: videoViews, engagement: likes + comments },
    };
  });

  console.log(`[Apify/IG] Downloading ${posts.length} post images...`);
  posts = await downloadPostImages(posts, 'ig');
  posts = posts.map(({ _originalImageUrl, ...rest }) => rest);

  const totalLikes    = posts.reduce((s, p) => s + p.insights.likes, 0);
  const totalComments = posts.reduce((s, p) => s + p.insights.comments, 0);
  const numPosts      = posts.length || 1;
  const followers     = account.followers_count || 1;
  const engagementRate = Math.round(((totalLikes + totalComments) / numPosts) / followers * 10000) / 100;

  const history = appendIgSnapshot(account.followers_count, engagementRate);

  const insights = [
    {
      name: 'follower_count', period: 'day', title: 'Follower Count',
      values: history.followers.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })),
    },
    {
      name: 'engagement_rate', period: 'day', title: 'Engagement Rate (%)',
      values: history.engagement_rate.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })),
    },
    { name: 'impressions', period: 'day', title: 'Impressions', values: [], _unavailable: true },
    { name: 'reach',       period: 'day', title: 'Reach',       values: [], _unavailable: true },
  ];

  return {
    account,
    insights,
    posts,
    calculated_metrics: {
      engagement_rate: engagementRate,
      avg_likes: Math.round(totalLikes / numPosts * 10) / 10,
      avg_comments: Math.round(totalComments / numPosts * 10) / 10,
      posts_scraped: numPosts,
    },
    lastFetch: new Date().toISOString(),
    source: 'apify',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// APIFY — LinkedIn Scrapers
// ─────────────────────────────────────────────────────────────────────────────
async function fetchLiFromApify() {
  const companyUrl = decodeURIComponent(LI_COMPANY_URL);
  console.log(`[Apify/LI] Scraping company: ${companyUrl}...`);

  // ── Step 1: Fetch company profile ──
  console.log('[Apify/LI] Step 1 — Fetching company profile...');
  const profileEndpoint = 'https://api.apify.com/v2/acts/dev_fusion~linkedin-company-scraper/run-sync-get-dataset-items';

  const { data: profileData } = await axios.post(profileEndpoint, {
    profileUrls: [companyUrl],   // ← was: urls
  }, {
    params: { token: APIFY_TOKEN },
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000,
  });

  console.log(`[Apify/LI] Profile items received: ${profileData?.length || 0}`);
  if (profileData?.[0]) console.log('[Apify/LI] Profile keys:', Object.keys(profileData[0]).join(', '));

  const company = (profileData && profileData.length > 0) ? profileData[0] : {};

  // Download logo locally
  const originalLogoUrl = company.logoResolutionResult || company.logoUrl || company.logo || '';
  const localLogoUrl = await downloadProfilePic(originalLogoUrl, 'li_logo', 'li');

  const account = {
    name: company.companyName || company.name || '',
    description: company.description || '',
    tagline: company.tagline || '',
    followers_count: company.followerCount ?? 0,
    employee_count: company.employeeCount ?? 0,
    logo_url: localLogoUrl || originalLogoUrl,
    cover_url: company.croppedCoverImage || company.originalCoverImage || '',
    website: company.websiteUrl || '',
    linkedin_url: company.url || companyUrl,
  };


  // ── Step 2: Fetch company posts ──
  console.log('[Apify/LI] Step 2 — Fetching company posts...');
  const postsEndpoint = 'https://api.apify.com/v2/acts/harvestapi~linkedin-company-posts/run-sync-get-dataset-items';

  // ── Step 2: Fetch company posts ──
  const { data: postsData } = await axios.post(postsEndpoint, {
    targetUrls: [companyUrl],    // ← THIS is the correct field name
  }, {
    params: { token: APIFY_TOKEN },
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000,
  });
  
  console.log('[Apify/LI] Raw posts response (first 500 chars):', JSON.stringify(postsData).slice(0, 500));


  console.log(`[Apify/LI] Post items received: ${postsData?.length || 0}`);
  if (postsData?.[0]) console.log('[Apify/LI] First post keys:', Object.keys(postsData[0]).join(', '));

  const rawPosts = (postsData || []).filter(p => p.type === 'post');
  console.log(`[Apify/LI] Posts after type=post filter: ${rawPosts.length}`);

  let posts = rawPosts.slice(0, 12).map(p => {
    const eng = p.engagement || {};
    const likes    = eng.likes ?? 0;
    const comments = eng.comments ?? 0;
    const shares   = eng.shares ?? 0;

    // Build reaction breakdown
    const reactionBreakdown = { LIKE: 0, APPRECIATION: 0, EMPATHY: 0, PRAISE: 0, INTEREST: 0, ENTERTAINMENT: 0 };
    (eng.reactions || []).forEach(r => {
      if (reactionBreakdown.hasOwnProperty(r.type)) {
        reactionBreakdown[r.type] = r.count || 0;
      }
    });
    const totalReactionsForPost = Object.values(reactionBreakdown).reduce((a, b) => a + b, 0);

    // Determine media type
    let media_type = 'TEXT';
    if (p.postImages && p.postImages.length > 0) media_type = 'IMAGE';
    if (p.document) media_type = 'DOCUMENT';
    if (p.video) media_type = 'VIDEO';

    // Pick best image
    let imageUrl = '';
    if (p.postImages && p.postImages.length > 0) {
      const firstImg = p.postImages[0];
      imageUrl = typeof firstImg === 'string' ? firstImg : (firstImg.url || firstImg.imageUrl || '');
    }
    if (!imageUrl && p.document && p.document.coverPages && p.document.coverPages.length > 0) {
      const coverPage = p.document.coverPages[0];
      if (coverPage.imageUrls && coverPage.imageUrls.length > 0) {
        imageUrl = coverPage.imageUrls[0];
      }
    }

    // Timestamp — handle string, object, or epoch
    let timestamp = '';
    if (p.postedAt) {
      if (typeof p.postedAt === 'string') {
        timestamp = p.postedAt;
      } else {
        timestamp = p.postedAt.date || (p.postedAt.timestamp ? new Date(p.postedAt.timestamp).toISOString() : '');
      }
    }
    if (!timestamp) timestamp = p.postedDate || p.publishedAt || '';

    return {
      id: p.id || '',
      text: (p.content || '').slice(0, 500),
      media_type,
      timestamp,
      permalink: p.linkedinUrl || '',
      _originalImageUrl: imageUrl,
      local_image: null,
      insights: {
        reactions: totalReactionsForPost || likes,
        comments,
        shares,
        engagement: (totalReactionsForPost || likes) + comments + shares,
        reaction_breakdown: reactionBreakdown,
      },
    };
  });

  // Download post images
  console.log(`[Apify/LI] Downloading ${posts.length} post images...`);
  posts = await downloadPostImages(posts, 'li');
  posts = posts.map(({ _originalImageUrl, ...rest }) => rest);

  // Calculate metrics
  const totalReactions = posts.reduce((s, p) => s + p.insights.reactions, 0);
  const totalComments  = posts.reduce((s, p) => s + p.insights.comments, 0);
  const totalShares    = posts.reduce((s, p) => s + p.insights.shares, 0);
  const numPosts       = posts.length || 1;
  const followers      = account.followers_count || 1;
  const engagementRate = Math.round(((totalReactions + totalComments + totalShares) / numPosts) / followers * 10000) / 100;

  // Save daily snapshot
  const history = appendLiSnapshot(account.followers_count, engagementRate);

  const insights = [
    {
      name: 'follower_count', period: 'day', title: 'Follower Count',
      values: history.followers.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })),
    },
    {
      name: 'engagement_rate', period: 'day', title: 'Engagement Rate (%)',
      values: history.engagement_rate.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })),
    },
  ];

  return {
    account,
    insights,
    posts,
    calculated_metrics: {
      engagement_rate: engagementRate,
      avg_reactions: Math.round(totalReactions / numPosts * 10) / 10,
      avg_comments: Math.round(totalComments / numPosts * 10) / 10,
      avg_shares: Math.round(totalShares / numPosts * 10) / 10,
      posts_scraped: numPosts,
    },
    lastFetch: new Date().toISOString(),
    source: 'apify',
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// CACHE REFRESH
// ─────────────────────────────────────────────────────────────────────────────
async function refreshIgCache() {
  if (MOCK) {
    igCache = buildMockCache();
    console.log('[MOCK/IG] Cache loaded at', igCache.lastFetch);
    return;
  }
  try {
    igCache = await fetchIgFromApify();
    saveIgCacheToDisk();
    console.log(`[IG Cache] Updated at ${igCache.lastFetch}`);
  } catch (err) {
    console.error('[IG Cache] Error:', err.response?.data || err.message);
  }
}

async function refreshLiCache() {
  if (MOCK) {
    liCache = buildLiMockCache();
    console.log('[MOCK/LI] Cache loaded at', liCache.lastFetch);
    return;
  }
  try {
    liCache = await fetchLiFromApify();
    saveLiCacheToDisk();
    console.log(`[LI Cache] Updated at ${liCache.lastFetch}`);
  } catch (err) {
    console.error('[LI Cache] Error:', err.response?.data || err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES — Instagram
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/kpis', requireAuth, async (req, res) => {
  if (!igCache.lastFetch) loadIgCacheFromDisk();
  if (!igCache.lastFetch) await refreshIgCache();
  res.json(igCache);
});

app.post('/api/refresh', requireAuth, async (req, res) => {
  if (MOCK) {
    igCache = buildMockCache();
    return res.json({ ok: true, lastFetch: igCache.lastFetch });
  }
  if (igFetchedToday()) {
    return res.status(429).json({
      ok: false,
      error: 'Already fetched Instagram today. Next refresh available tomorrow.',
      lastFetch: igCache.lastFetch,
    });
  }
  await refreshIgCache();
  res.json({ ok: true, lastFetch: igCache.lastFetch });
});

app.get('/api/history', requireAuth, (req, res) => {
  res.json(loadIgHistory());
});

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES — LinkedIn
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/linkedin/kpis', requireAuth, async (req, res) => {
  if (!liCache.lastFetch) loadLiCacheFromDisk();
  if (!liCache.lastFetch) await refreshLiCache();
  res.json(liCache);
});

app.post('/api/linkedin/refresh', requireAuth, async (req, res) => {
  if (MOCK) {
    liCache = buildLiMockCache();
    return res.json({ ok: true, lastFetch: liCache.lastFetch });
  }
  if (liFetchedToday()) {
    return res.status(429).json({
      ok: false,
      error: 'Already fetched LinkedIn today. Next refresh available tomorrow.',
      lastFetch: liCache.lastFetch,
    });
  }
  await refreshLiCache();
  res.json({ ok: true, lastFetch: liCache.lastFetch });
});

app.get('/api/linkedin/history', requireAuth, (req, res) => {
  res.json(loadLiHistory());
});

// ─────────────────────────────────────────────────────────────────────────────
// ── PAGE ROUTES (must be BEFORE static middleware) ──
// ─────────────────────────────────────────────────────────────────────────────

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/instagram', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'insta.html'));
});

app.get('/linkedin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'linkedin.html'));
});

// Static files AFTER explicit routes
app.use('/data/images/ig', requireAuth, express.static(IG_IMAGES));
app.use('/data/images/li', requireAuth, express.static(LI_IMAGES));
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`Finance Club Dashboard running on http://localhost:${PORT}`);
  ensureDataDir();
  migrateDataFiles();

  loadIgCacheFromDisk();
  loadLiCacheFromDisk();

  if (MOCK) {
    console.log('[MOCK] Password:', process.env.DASHBOARD_PASSWORD || 'ChangeMe123!');
    if (!igCache.lastFetch) igCache = buildMockCache();
    if (!liCache.lastFetch) liCache = buildLiMockCache();
  } else {
    if (!igCache.lastFetch) {
      console.log('[Startup] No IG cache — running initial scrape...');
      await refreshIgCache();
    }
    if (!liCache.lastFetch) {
      console.log('[Startup] No LI cache — running initial scrape...');
      await refreshLiCache();
    }
  }
});
