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

if (MOCK) console.log('[MOCK] Running in mock-data mode.');
else console.log(`[Config] APIFY  IG_USERNAME=${IG_USERNAME}`);

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
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
// CACHE + HISTORY (persistent daily snapshots)
// ─────────────────────────────────────────────────────────────────────────────
let cache = { account: null, insights: null, posts: null, lastFetch: null };

const DATA_DIR     = path.join(__dirname, 'data');
const IMAGES_DIR   = path.join(DATA_DIR, 'images');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const CACHE_FILE   = path.join(DATA_DIR, 'cache.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {}
  return { followers: [], engagement_rate: [] };
}

function saveHistory(history) {
  ensureDataDir();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function loadCacheFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      console.log(`[Cache] Loaded from disk — last fetch: ${cache.lastFetch}`);
    }
  } catch {}
}

function saveCacheToDisk() {
  ensureDataDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function appendSnapshot(followersCount, engagementRate) {
  const history = loadHistory();
  const today = new Date().toISOString().slice(0, 10);
  if (!history.followers.some(e => e.date === today)) {
    history.followers.push({ date: today, value: followersCount });
  }
  if (engagementRate != null && !history.engagement_rate.some(e => e.date === today)) {
    history.engagement_rate.push({ date: today, value: engagementRate });
  }
  history.followers = history.followers.slice(-90);
  history.engagement_rate = history.engagement_rate.slice(-90);
  saveHistory(history);
  return history;
}

function fetchedToday() {
  if (!cache.lastFetch) return false;
  const lastDate = new Date(cache.lastFetch).toISOString().slice(0, 10);
  const today    = new Date().toISOString().slice(0, 10);
  return lastDate === today;
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE DOWNLOADER
// Downloads post images locally so they don't expire or get blocked by CORS.
// ─────────────────────────────────────────────────────────────────────────────
async function downloadImage(url, filename) {
  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const ext = (resp.headers['content-type'] || '').includes('png') ? '.png' : '.jpg';
    const filepath = path.join(IMAGES_DIR, filename + ext);
    fs.writeFileSync(filepath, resp.data);
    return '/data/images/' + filename + ext;
  } catch (err) {
    console.error(`[Image] Failed to download ${filename}:`, err.message);
    return null;
  }
}

async function downloadPostImages(posts) {
  ensureDataDir();
  const results = [];
  for (const p of posts) {
    const url = p._originalImageUrl;
    if (url) {
      const localPath = await downloadImage(url, p.id);
      results.push({ ...p, local_image: localPath });
    } else {
      results.push({ ...p, local_image: null });
    }
  }
  return results;
}

async function downloadProfilePic(url, username) {
  if (!url) return null;
  return downloadImage(url, 'profile_' + username);
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
app.use('/data/images', requireAuth, express.static(IMAGES_DIR));

app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// APIFY — Instagram Profile Scraper
// ─────────────────────────────────────────────────────────────────────────────
async function fetchFromApify() {
  console.log(`[Apify] Scraping @${IG_USERNAME}...`);

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

  // ── Download profile picture ──
  const originalPicUrl = profile.profilePicUrlHD || profile.profilePicUrl || '';
  const localPicUrl = await downloadProfilePic(originalPicUrl, profile.username || IG_USERNAME);

  // ── Build account object ──
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

  // ── Build posts array ──
  const rawPosts = profile.latestPosts || profile.posts || [];
  let posts = rawPosts.slice(0, 12).map(p => {
    const likes    = p.likesCount ?? p.likes ?? 0;
    const comments = p.commentsCount ?? p.comments ?? 0;
    const videoViews = p.videoViewCount ?? p.videoPlayCount ?? p.video_views ?? 0;

    let media_type = 'IMAGE';
    if (p.type === 'Video' || p.isVideo || p.videoUrl) media_type = 'VIDEO';
    else if (p.type === 'Sidecar' || p.childPosts?.length) media_type = 'CAROUSEL_ALBUM';

    // For carousels/sidecars: pick the first image
    let imageUrl = p.displayUrl || p.imageUrl || '';
    if (!imageUrl && p.images && p.images.length > 0) {
      imageUrl = p.images[0];
    }
    if (!imageUrl && p.childPosts && p.childPosts.length > 0) {
      imageUrl = p.childPosts[0].displayUrl || p.childPosts[0].imageUrl || '';
    }
    // For video posts use the thumbnail
    if (media_type === 'VIDEO' && !imageUrl) {
      imageUrl = p.previewUrl || p.thumbnailUrl || p.videoThumbnailUrl || '';
    }

    return {
      id: p.shortCode || p.id || '',
      caption: (p.caption || '').slice(0, 500),
      media_type,
      timestamp: p.timestamp
        ? p.timestamp
        : p.takenAtTimestamp
          ? new Date(p.takenAtTimestamp * 1000).toISOString()
          : '',
      permalink: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ''),
      _originalImageUrl: imageUrl,
      media_url: '',
      thumbnail_url: '',
      local_image: null,
      insights: {
        impressions: 0,
        reach: 0,
        saved: 0,
        likes,
        comments,
        video_views: videoViews,
        engagement: likes + comments,
      },
    };
  });

  // ── Download all post images locally ──
  console.log(`[Apify] Downloading ${posts.length} post images...`);
  posts = await downloadPostImages(posts);

  // Clean up temporary field
  posts = posts.map(({ _originalImageUrl, ...rest }) => rest);

  // ── Calculate engagement ──
  const totalLikes    = posts.reduce((s, p) => s + p.insights.likes, 0);
  const totalComments = posts.reduce((s, p) => s + p.insights.comments, 0);
  const numPosts      = posts.length || 1;
  const followers     = account.followers_count || 1;
  const engagementRate = Math.round(((totalLikes + totalComments) / numPosts) / followers * 10000) / 100;

  // ── Save daily snapshot ──
  const history = appendSnapshot(account.followers_count, engagementRate);

  // ── Build insights from history ──
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
// CACHE REFRESH
// ─────────────────────────────────────────────────────────────────────────────
async function refreshCache() {
  if (MOCK) {
    cache = buildMockCache();
    console.log('[MOCK] Cache loaded with mock data at', cache.lastFetch);
    return;
  }

  try {
    cache = await fetchFromApify();
    saveCacheToDisk();
    console.log(`[Cache] Updated at ${cache.lastFetch}`);
  } catch (err) {
    console.error('[Cache] Error:', err.response?.data || err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/kpis', requireAuth, async (req, res) => {
  if (!cache.lastFetch) loadCacheFromDisk();
  if (!cache.lastFetch) await refreshCache();
  res.json(cache);
});

app.post('/api/refresh', requireAuth, async (req, res) => {
  if (MOCK) {
    cache = buildMockCache();
    return res.json({ ok: true, lastFetch: cache.lastFetch });
  }

  if (fetchedToday()) {
    return res.status(429).json({
      ok: false,
      error: 'Already fetched today. Next refresh available tomorrow.',
      lastFetch: cache.lastFetch,
    });
  }

  await refreshCache();
  res.json({ ok: true, lastFetch: cache.lastFetch });
});

app.get('/api/history', requireAuth, (req, res) => {
  res.json(loadHistory());
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`Finance Club Dashboard running on http://localhost:${PORT}`);
  ensureDataDir();

  loadCacheFromDisk();

  if (MOCK) {
    console.log('[MOCK] Password:', process.env.DASHBOARD_PASSWORD || 'ChangeMe123!');
    if (!cache.lastFetch) cache = buildMockCache();
  } else if (!cache.lastFetch) {
    console.log('[Startup] No cached data found — running initial Apify scrape...');
    await refreshCache();
  }
});