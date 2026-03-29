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
const LI_URL      = process.env.LINKEDIN_COMPANY_URL || 'https://www.linkedin.com/company/financeclub-leipzig/';

if (MOCK) console.log('[MOCK] Running in mock-data mode.');
else console.log(`[Config] APIFY  IG=@${IG_USERNAME}  LI=${LI_URL}`);

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — Instagram (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function buildMockIGCache() {
  const days = 30;
  const ts = (base, variance) =>
    Array.from({ length: days }, (_, i) => ({
      value: Math.floor(base + Math.sin(i / 3) * variance + Math.random() * (variance / 2)),
      end_time: new Date(Date.now() - (days - 1 - i) * 86400000).toISOString(),
    }));

  return {
    lastFetch: new Date().toISOString(),
    source: 'mock',
    account: {
<<<<<<< HEAD
      id: '123456789', username: 'financeclub_leipzig', name: 'Finance Club Leipzig',
      biography: 'Student-run finance club at Leipzig University\nInvesting - Markets - Careers',
      followers_count: 1284, following_count: 312, media_count: 87,
=======
      id: '123456789',
      username: 'financeclub_leipzig',
      name: 'Finance Club Leipzig',
      biography: 'Student-run finance club at Leipzig University 📈\nInvesting · Markets · Careers',
      followers_count: 1284,
      media_count: 87,
>>>>>>> parent of a81a53c (Image Rendering Finished)
      profile_picture_url: 'https://placehold.co/120x120/1a1a2e/ffffff?text=FCL',
      website: 'https://financeclub-leipzig.de',
    },
    insights: [
      { name: 'follower_count', period: 'day', title: 'Follower Count', values: ts(1250, 15) },
      { name: 'engagement_rate', period: 'day', title: 'Engagement Rate (%)', values: ts(3.2, 0.5) },
      { name: 'impressions', period: 'day', title: 'Impressions', values: [], _unavailable: true },
      { name: 'reach',       period: 'day', title: 'Reach',       values: [], _unavailable: true },
    ],
    posts: [
<<<<<<< HEAD
      { id:'p1', caption:'Our recap of the latest ECB rate decision.', media_type:'IMAGE', timestamp:new Date(Date.now()-1*864e5).toISOString(), permalink:'https://www.instagram.com/', media_url:'https://placehold.co/400x400/1a1a2e/ffffff?text=ECB+Recap', local_image:null, insights:{impressions:0,reach:0,saved:0,likes:134,comments:12,video_views:0,engagement:146} },
      { id:'p2', caption:'Event recap: our panel on sustainable investing.', media_type:'IMAGE', timestamp:new Date(Date.now()-4*864e5).toISOString(), permalink:'https://www.instagram.com/', media_url:'https://placehold.co/400x400/16213e/ffffff?text=Event+Recap', local_image:null, insights:{impressions:0,reach:0,saved:0,likes:287,comments:34,video_views:0,engagement:321} },
      { id:'p3', caption:'Week in markets: S&P hits new highs.', media_type:'CAROUSEL_ALBUM', timestamp:new Date(Date.now()-7*864e5).toISOString(), permalink:'https://www.instagram.com/', media_url:'https://placehold.co/400x400/0f3460/ffffff?text=Markets+Week', local_image:null, insights:{impressions:0,reach:0,saved:0,likes:198,comments:21,video_views:0,engagement:219} },
      { id:'p4', caption:'Welcoming our new semester members!', media_type:'IMAGE', timestamp:new Date(Date.now()-11*864e5).toISOString(), permalink:'https://www.instagram.com/', media_url:'https://placehold.co/400x400/533483/ffffff?text=New+Members', local_image:null, insights:{impressions:0,reach:0,saved:0,likes:312,comments:45,video_views:0,engagement:357} },
      { id:'p5', caption:'Reel: 60 seconds on how to read a P&L statement.', media_type:'VIDEO', timestamp:new Date(Date.now()-15*864e5).toISOString(), permalink:'https://www.instagram.com/', media_url:'https://placehold.co/400x400/e94560/ffffff?text=Reel', local_image:null, insights:{impressions:0,reach:0,saved:0,likes:521,comments:67,video_views:4100,engagement:588} },
      { id:'p6', caption:'Book of the month: "The Intelligent Investor".', media_type:'CAROUSEL_ALBUM', timestamp:new Date(Date.now()-20*864e5).toISOString(), permalink:'https://www.instagram.com/', media_url:'https://placehold.co/400x400/1a1a2e/ffffff?text=Book+Club', local_image:null, insights:{impressions:0,reach:0,saved:0,likes:167,comments:18,video_views:0,engagement:185} },
=======
      {
        id: 'post_001', caption: '📊 Our recap of the latest ECB rate decision.', media_type: 'IMAGE',
        timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/1a1a2e/ffffff?text=ECB+Recap',
        insights: { impressions: 0, reach: 0, saved: 0, likes: 134, comments: 12, video_views: 0, engagement: 146 },
      },
      {
        id: 'post_002', caption: '🎤 Event recap: our panel on sustainable investing.', media_type: 'IMAGE',
        timestamp: new Date(Date.now() - 4 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/16213e/ffffff?text=Event+Recap',
        insights: { impressions: 0, reach: 0, saved: 0, likes: 287, comments: 34, video_views: 0, engagement: 321 },
      },
      {
        id: 'post_003', caption: '📈 Week in markets: S&P hits new highs.', media_type: 'CAROUSEL_ALBUM',
        timestamp: new Date(Date.now() - 7 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/0f3460/ffffff?text=Markets+Week',
        insights: { impressions: 0, reach: 0, saved: 0, likes: 198, comments: 21, video_views: 0, engagement: 219 },
      },
      {
        id: 'post_004', caption: '🎓 Welcoming our new semester members!', media_type: 'IMAGE',
        timestamp: new Date(Date.now() - 11 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/533483/ffffff?text=New+Members',
        insights: { impressions: 0, reach: 0, saved: 0, likes: 312, comments: 45, video_views: 0, engagement: 357 },
      },
      {
        id: 'post_005', caption: '🎬 Reel: 60 seconds on how to read a P&L statement.', media_type: 'VIDEO',
        timestamp: new Date(Date.now() - 15 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/e94560/ffffff?text=Reel',
        insights: { impressions: 0, reach: 0, saved: 0, likes: 521, comments: 67, video_views: 4100, engagement: 588 },
      },
      {
        id: 'post_006', caption: '📚 Book of the month: "The Intelligent Investor".', media_type: 'CAROUSEL_ALBUM',
        timestamp: new Date(Date.now() - 20 * 86400000).toISOString(), permalink: 'https://www.instagram.com/',
        media_url: 'https://placehold.co/400x400/1a1a2e/ffffff?text=Book+Club',
        insights: { impressions: 0, reach: 0, saved: 0, likes: 167, comments: 18, video_views: 0, engagement: 185 },
      },
>>>>>>> parent of a81a53c (Image Rendering Finished)
    ],
    calculated_metrics: { engagement_rate: 3.21, avg_likes: 270, avg_comments: 33, posts_scraped: 6 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — LinkedIn
// ─────────────────────────────────────────────────────────────────────────────
function buildMockLICache() {
  const days = 30;
  const ts = (base, variance) =>
    Array.from({ length: days }, (_, i) => ({
      value: Math.floor(base + Math.sin(i / 3) * variance + Math.random() * (variance / 2)),
      end_time: new Date(Date.now() - (days - 1 - i) * 86400000).toISOString(),
    }));

<<<<<<< HEAD
  return {
    lastFetch: new Date().toISOString(),
    source: 'mock',
    company: {
      name: 'Finance Club Leipzig',
      url: 'https://www.linkedin.com/company/financeclub-leipzig/',
      description: 'Student-run finance & investment club at Leipzig University. We connect students passionate about financial markets, investing, and career development.',
      industry: 'Financial Services',
      company_size: '11-50 employees',
      headquarters: 'Leipzig, Saxony, Germany',
      founded: 2019,
      followers_count: 847,
      employees_on_linkedin: 12,
      logo_url: 'https://placehold.co/120x120/0077b5/ffffff?text=FCL',
      website: 'https://financeclub-leipzig.de',
      specialties: ['Finance', 'Investing', 'Career Development', 'Student Organizations'],
      company_type: 'Nonprofit',
    },
    insights: [
      { name: 'followers', period: 'day', title: 'Followers', values: ts(820, 10) },
    ],
    posts: [
      { id:'li1', text:'We are thrilled to announce our partnership with Deutsche Bank for the upcoming Careers in Finance panel! Join us on April 15th.', timestamp:new Date(Date.now()-2*864e5).toISOString(), url:'https://www.linkedin.com/', image_url:'https://placehold.co/400x400/0077b5/ffffff?text=DB+Partnership', num_likes:89, num_comments:14, num_shares:23, num_impressions:2340 },
      { id:'li2', text:'Market Weekly: Our analysts break down the latest developments in European equities and what it means for the Eurozone.', timestamp:new Date(Date.now()-5*864e5).toISOString(), url:'https://www.linkedin.com/', image_url:'https://placehold.co/400x400/004182/ffffff?text=Market+Weekly', num_likes:67, num_comments:8, num_shares:31, num_impressions:1890 },
      { id:'li3', text:'Congratulations to our 5 members who secured summer internships at Goldman Sachs, JPMorgan, and McKinsey!', timestamp:new Date(Date.now()-9*864e5).toISOString(), url:'https://www.linkedin.com/', image_url:'https://placehold.co/400x400/0a66c2/ffffff?text=Internships', num_likes:234, num_comments:45, num_shares:67, num_impressions:4560 },
      { id:'li4', text:'Workshop recap: DCF Valuation Masterclass with over 40 attendees learning hands-on financial modeling.', timestamp:new Date(Date.now()-13*864e5).toISOString(), url:'https://www.linkedin.com/', image_url:'https://placehold.co/400x400/004182/ffffff?text=DCF+Workshop', num_likes:56, num_comments:7, num_shares:12, num_impressions:1670 },
      { id:'li5', text:'Finance Club Leipzig ranked in the Top 10 student finance organizations in Germany by FinanceStudents.de!', timestamp:new Date(Date.now()-18*864e5).toISOString(), url:'https://www.linkedin.com/', image_url:'https://placehold.co/400x400/0077b5/ffffff?text=Top+10', num_likes:345, num_comments:56, num_shares:89, num_impressions:6780 },
      { id:'li6', text:'New blog post: "5 Books Every Finance Student Should Read Before Graduation" — link in comments!', timestamp:new Date(Date.now()-22*864e5).toISOString(), url:'https://www.linkedin.com/', image_url:'https://placehold.co/400x400/004182/ffffff?text=Book+List', num_likes:123, num_comments:19, num_shares:45, num_impressions:3210 },
    ],
    calculated_metrics: {
      avg_likes: 152.3,
      avg_comments: 24.8,
      avg_shares: 44.5,
      total_engagement: 1338,
      engagement_rate: 2.63,
      posts_scraped: 6,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT STORAGE
// ─────────────────────────────────────────────────────────────────────────────
let igCache = { account: null, insights: null, posts: null, lastFetch: null };
let liCache = { company: null, insights: null, posts: null, lastFetch: null };

const DATA_DIR       = path.join(__dirname, 'data');
const IMAGES_DIR     = path.join(DATA_DIR, 'images');
const IG_HISTORY     = path.join(DATA_DIR, 'ig_history.json');
const LI_HISTORY     = path.join(DATA_DIR, 'li_history.json');
const IG_CACHE_FILE  = path.join(DATA_DIR, 'ig_cache.json');
const LI_CACHE_FILE  = path.join(DATA_DIR, 'li_cache.json');
=======
const DATA_DIR     = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const CACHE_FILE   = path.join(DATA_DIR, 'cache.json');
>>>>>>> parent of a81a53c (Image Rendering Finished)

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Generic history helpers ──
function loadHistory(file) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return { followers: [], engagement_rate: [] };
}
function saveHistory(file, h) { ensureDataDir(); fs.writeFileSync(file, JSON.stringify(h, null, 2)); }

function appendSnapshot(file, followersCount, engagementRate) {
  const h = loadHistory(file);
  const today = new Date().toISOString().slice(0, 10);
  if (!h.followers.some(e => e.date === today)) h.followers.push({ date: today, value: followersCount });
  if (engagementRate != null && !h.engagement_rate.some(e => e.date === today)) h.engagement_rate.push({ date: today, value: engagementRate });
  h.followers = h.followers.slice(-90);
  h.engagement_rate = h.engagement_rate.slice(-90);
  saveHistory(file, h);
  return h;
}

<<<<<<< HEAD
// ── Cache persistence ──
function loadCacheFile(file) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return null;
}
function saveCacheFile(file, data) { ensureDataDir(); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function fetchedToday(c) {
  if (!c || !c.lastFetch) return false;
  return new Date(c.lastFetch).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE DOWNLOADER (shared by IG + LI)
// ─────────────────────────────────────────────────────────────────────────────
async function downloadImage(url, filename) {
  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const ext = (resp.headers['content-type'] || '').includes('png') ? '.png' : '.jpg';
    const fp = path.join(IMAGES_DIR, filename + ext);
    fs.writeFileSync(fp, resp.data);
    return '/data/images/' + filename + ext;
  } catch (err) {
    console.error(`[Image] Download failed ${filename}:`, err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
=======
// Check if we already fetched today
function fetchedToday() {
  if (!cache.lastFetch) return false;
  const lastDate = new Date(cache.lastFetch).toISOString().slice(0, 10);
  const today    = new Date().toISOString().slice(0, 10);
  return lastDate === today;
}

// ─────────────────────────────────────────────────────────────────────────────
>>>>>>> parent of a81a53c (Image Rendering Finished)
// AUTH
// ─────────────────────────────────────────────────────────────────────────────
const PASSWORD_HASH = bcrypt.hashSync(process.env.DASHBOARD_PASSWORD || 'ChangeMe123!', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false, saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 },
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.post('/login', async (req, res) => {
  const match = await bcrypt.compare(req.body.password || '', PASSWORD_HASH);
  if (match) { req.session.authenticated = true; return res.redirect('/'); }
  res.redirect('/login?error=1');
});
app.post('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });
<<<<<<< HEAD

app.use('/data/images', requireAuth, express.static(IMAGES_DIR));
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// APIFY — Instagram  (unchanged logic)
=======
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// APIFY — Instagram Profile Scraper
// Actor: apify/instagram-profile-scraper
// Docs:  https://apify.com/apify/instagram-profile-scraper
//
// We call the "run-sync-get-dataset-items" endpoint which:
//   1. Starts the actor
//   2. Waits for it to finish (~30-60s)
//   3. Returns the results directly
>>>>>>> parent of a81a53c (Image Rendering Finished)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchIGFromApify() {
  console.log(`[Apify/IG] Scraping @${IG_USERNAME}...`);
  const url = 'https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items';
  const { data } = await axios.post(url, { usernames: [IG_USERNAME] }, {
    params: { token: APIFY_TOKEN },
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000, // 2 min timeout — actor can take a while
  });

  if (!data || data.length === 0) throw new Error('Apify/IG returned no data');
  const profile = data[0];

<<<<<<< HEAD
  const origPic = profile.profilePicUrlHD || profile.profilePicUrl || '';
  const localPic = await downloadImage(origPic, 'ig_profile_' + (profile.username || IG_USERNAME));

=======
  // ── Build account object ──
>>>>>>> parent of a81a53c (Image Rendering Finished)
  const account = {
    id: profile.id || profile.igId || '',
    username: profile.username || IG_USERNAME,
    name: profile.fullName || profile.username || '',
    biography: profile.biography || '',
    followers_count: profile.followersCount ?? profile.subscribersCount ?? 0,
    following_count: profile.followsCount ?? profile.followingCount ?? 0,
    media_count: profile.postsCount ?? profile.mediaCount ?? 0,
<<<<<<< HEAD
    profile_picture_url: localPic || origPic,
=======
    profile_picture_url: profile.profilePicUrl || profile.profilePicUrlHD || '',
>>>>>>> parent of a81a53c (Image Rendering Finished)
    website: profile.externalUrl || profile.website || '',
    is_verified: profile.verified ?? false,
    is_private: profile.private ?? false,
  };

<<<<<<< HEAD
  const rawPosts = (profile.latestPosts || profile.posts || []).slice(0, 12);
  let posts = rawPosts.map(p => {
    const likes = p.likesCount ?? p.likes ?? 0;
=======
  // ── Build posts array ──
  const rawPosts = profile.latestPosts || profile.posts || [];
  const posts = rawPosts.slice(0, 12).map(p => {
    const likes    = p.likesCount ?? p.likes ?? 0;
>>>>>>> parent of a81a53c (Image Rendering Finished)
    const comments = p.commentsCount ?? p.comments ?? 0;
    const videoViews = p.videoViewCount ?? p.videoPlayCount ?? 0;
    let media_type = 'IMAGE';
    if (p.type === 'Video' || p.isVideo || p.videoUrl) media_type = 'VIDEO';
    else if (p.type === 'Sidecar' || p.childPosts?.length) media_type = 'CAROUSEL_ALBUM';
<<<<<<< HEAD
    let imageUrl = p.displayUrl || p.imageUrl || '';
    if (!imageUrl && p.images?.length) imageUrl = p.images[0];
    if (!imageUrl && p.childPosts?.length) imageUrl = p.childPosts[0].displayUrl || '';
    if (media_type === 'VIDEO' && !imageUrl) imageUrl = p.previewUrl || p.thumbnailUrl || '';
=======

>>>>>>> parent of a81a53c (Image Rendering Finished)
    return {
      id: p.shortCode || p.id || '',
      caption: (p.caption || '').slice(0, 500),
      media_type,
<<<<<<< HEAD
      timestamp: p.timestamp || (p.takenAtTimestamp ? new Date(p.takenAtTimestamp * 1000).toISOString() : ''),
      permalink: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ''),
      _originalImageUrl: imageUrl,
      media_url: '', thumbnail_url: '', local_image: null,
      insights: { impressions: 0, reach: 0, saved: 0, likes, comments, video_views: videoViews, engagement: likes + comments },
    };
  });

  // Download images
  for (let i = 0; i < posts.length; i++) {
    if (posts[i]._originalImageUrl) {
      posts[i].local_image = await downloadImage(posts[i]._originalImageUrl, 'ig_' + posts[i].id);
    }
    delete posts[i]._originalImageUrl;
  }

  const totalL = posts.reduce((s, p) => s + p.insights.likes, 0);
  const totalC = posts.reduce((s, p) => s + p.insights.comments, 0);
  const n = posts.length || 1;
  const engRate = Math.round(((totalL + totalC) / n) / (account.followers_count || 1) * 10000) / 100;

  const history = appendSnapshot(IG_HISTORY, account.followers_count, engRate);
=======
      timestamp: p.timestamp || p.takenAtTimestamp
        ? new Date((p.takenAtTimestamp || 0) * 1000).toISOString()
        : p.timestamp || '',
      permalink: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ''),
      media_url: p.displayUrl || p.imageUrl || p.videoUrl || '',
      thumbnail_url: p.displayUrl || p.imageUrl || '',
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
>>>>>>> parent of a81a53c (Image Rendering Finished)

  return {
    account, posts,
    insights: [
      { name: 'follower_count', period: 'day', title: 'Follower Count', values: history.followers.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })) },
      { name: 'engagement_rate', period: 'day', title: 'Engagement Rate (%)', values: history.engagement_rate.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })) },
      { name: 'impressions', period: 'day', title: 'Impressions', values: [], _unavailable: true },
      { name: 'reach',       period: 'day', title: 'Reach',       values: [], _unavailable: true },
    ],
    calculated_metrics: { engagement_rate: engRate, avg_likes: Math.round(totalL / n * 10) / 10, avg_comments: Math.round(totalC / n * 10) / 10, posts_scraped: n },
    lastFetch: new Date().toISOString(),
    source: 'apify',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// APIFY — LinkedIn Company Scraper
//
// Uses  apify/linkedin-company-scraper  (or compatible actor).
// Provide LINKEDIN_COMPANY_URL in .env.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchLIFromApify() {
  console.log(`[Apify/LI] Scraping ${LI_URL}...`);

  // Try the well-known actors in order of reliability
  const actorId = process.env.APIFY_LINKEDIN_ACTOR || 'curious_coder~linkedin-company-data-extractor';

  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`;
  const { data } = await axios.post(url, {
    profileUrls: [LI_URL],
  }, {
    params: { token: APIFY_TOKEN },
    headers: { 'Content-Type': 'application/json' },
    timeout: 180000,
  });

  if (!data || data.length === 0) throw new Error('Apify/LI returned no data');
  const raw = data[0];

  // ── Normalise company info (different actors use different field names) ──
  const followers = raw.followerCount ?? raw.followersCount ?? raw.followers ?? 0;
  const employeeCount = raw.employeeCount ?? raw.employeesOnLinkedIn ?? raw.staffCount ?? raw.associatedMemberCount ?? 0;

  let logoUrl = raw.logo ?? raw.logoUrl ?? raw.companyLogoUrl ?? '';
  if (logoUrl) {
    const localLogo = await downloadImage(logoUrl, 'li_logo');
    if (localLogo) logoUrl = localLogo;
  }

  const company = {
    name: raw.name ?? raw.companyName ?? '',
    url: raw.url ?? raw.linkedInUrl ?? LI_URL,
    description: raw.description ?? raw.about ?? raw.summary ?? '',
    industry: raw.industry ?? raw.industries?.[0] ?? '',
    company_size: raw.companySize ?? raw.staffCountRange ?? raw.employeeRange ?? '',
    headquarters: raw.headquarters ?? raw.location ?? [raw.city, raw.state, raw.country].filter(Boolean).join(', '),
    founded: raw.founded ?? raw.foundedYear ?? raw.foundedOn ?? '',
    followers_count: followers,
    employees_on_linkedin: employeeCount,
    logo_url: logoUrl,
    website: raw.website ?? raw.companyUrl ?? '',
    specialties: raw.specialties ?? raw.specialities ?? [],
    company_type: raw.type ?? raw.companyType ?? '',
    tagline: raw.tagline ?? '',
  };

  // ── Posts (if available from the actor) ──
  const rawPosts = raw.posts ?? raw.updates ?? raw.recentUpdates ?? [];
  let posts = rawPosts.slice(0, 12).map((p, i) => {
    const likes    = p.numLikes ?? p.likesCount ?? p.socialCounts?.numLikes ?? 0;
    const comments = p.numComments ?? p.commentsCount ?? p.socialCounts?.numComments ?? 0;
    const shares   = p.numShares ?? p.sharesCount ?? p.socialCounts?.numShares ?? 0;
    const impressions = p.numImpressions ?? p.impressionsCount ?? 0;
    let imageUrl = p.imageUrl ?? p.image ?? p.images?.[0] ?? '';
    return {
      id: p.id ?? p.urn ?? ('li_post_' + i),
      text: (p.text ?? p.commentary ?? p.caption ?? '').slice(0, 600),
      timestamp: p.postedAt ?? p.publishedAt ?? p.timestamp ?? p.postedDate ?? '',
      url: p.url ?? p.postUrl ?? '',
      _originalImageUrl: imageUrl,
      image_url: '',
      local_image: null,
      num_likes: likes,
      num_comments: comments,
      num_shares: shares,
      num_impressions: impressions,
    };
  });

  // Download post images
  for (let i = 0; i < posts.length; i++) {
    if (posts[i]._originalImageUrl) {
      posts[i].local_image = await downloadImage(posts[i]._originalImageUrl, 'li_' + posts[i].id);
    }
    posts[i].image_url = posts[i].local_image || posts[i]._originalImageUrl || '';
    delete posts[i]._originalImageUrl;
  }

  // ── Calculated metrics ──
  const n = posts.length || 1;
  const totalL = posts.reduce((s, p) => s + p.num_likes, 0);
  const totalC = posts.reduce((s, p) => s + p.num_comments, 0);
  const totalS = posts.reduce((s, p) => s + p.num_shares, 0);
  const totalE = totalL + totalC + totalS;
  const engRate = followers > 0 ? Math.round((totalE / n) / followers * 10000) / 100 : 0;

  const history = appendSnapshot(LI_HISTORY, followers, engRate);

  return {
    company, posts,
    insights: [
      { name: 'followers', period: 'day', title: 'Followers', values: history.followers.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })) },
      { name: 'engagement_rate', period: 'day', title: 'Engagement Rate (%)', values: history.engagement_rate.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })) },
    ],
    calculated_metrics: { avg_likes: Math.round(totalL / n * 10) / 10, avg_comments: Math.round(totalC / n * 10) / 10, avg_shares: Math.round(totalS / n * 10) / 10, total_engagement: totalE, engagement_rate: engRate, posts_scraped: n },
    lastFetch: new Date().toISOString(),
    source: 'apify',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE REFRESH
// ─────────────────────────────────────────────────────────────────────────────
async function refreshIGCache() {
  if (MOCK) { igCache = buildMockIGCache(); console.log('[MOCK/IG] Loaded'); return; }
  try {
    igCache = await fetchIGFromApify();
    saveCacheFile(IG_CACHE_FILE, igCache);
    console.log(`[IG] Updated at ${igCache.lastFetch}`);
  } catch (err) { console.error('[IG] Error:', err.response?.data || err.message); }
}

async function refreshLICache() {
  if (MOCK) { liCache = buildMockLICache(); console.log('[MOCK/LI] Loaded'); return; }
  try {
    liCache = await fetchLIFromApify();
    saveCacheFile(LI_CACHE_FILE, liCache);
    console.log(`[LI] Updated at ${liCache.lastFetch}`);
  } catch (err) {
    console.error('[LI] Error:', err.response?.data || err.message);
    // If Apify fails, try loading cached data or fall back to mock
    const disk = loadCacheFile(LI_CACHE_FILE);
    if (disk) { liCache = disk; console.log('[LI] Using disk cache from', liCache.lastFetch); }
    else { liCache = buildMockLICache(); liCache._fallback = true; console.log('[LI] Fell back to mock'); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES — Instagram
// ─────────────────────────────────────────────────────────────────────────────

// Return cached KPIs (never triggers a scrape — instant response)
app.get('/api/kpis', requireAuth, async (req, res) => {
<<<<<<< HEAD
  if (!igCache.lastFetch) {
    const disk = loadCacheFile(IG_CACHE_FILE);
    if (disk) igCache = disk; else await refreshIGCache();
  }
  res.json(igCache);
=======
  // If no cache in memory, try loading from disk first
  if (!cache.lastFetch) loadCacheFromDisk();
  // If still nothing, do an initial fetch
  if (!cache.lastFetch) await refreshCache();
  res.json(cache);
>>>>>>> parent of a81a53c (Image Rendering Finished)
});

// Manual refresh — button click from the dashboard
// Only allows one scrape per calendar day to save Apify credits
app.post('/api/refresh', requireAuth, async (req, res) => {
  if (MOCK) { igCache = buildMockIGCache(); return res.json({ ok: true, lastFetch: igCache.lastFetch }); }
  if (fetchedToday(igCache)) return res.status(429).json({ ok: false, error: 'Already fetched today. Next refresh available tomorrow.', lastFetch: igCache.lastFetch });
  await refreshIGCache();
  res.json({ ok: true, lastFetch: igCache.lastFetch });
});

<<<<<<< HEAD
app.get('/api/history', requireAuth, (req, res) => res.json(loadHistory(IG_HISTORY)));

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES — LinkedIn
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/linkedin/kpis', requireAuth, async (req, res) => {
  if (!liCache.lastFetch) {
    const disk = loadCacheFile(LI_CACHE_FILE);
    if (disk) liCache = disk; else await refreshLICache();
  }
  res.json(liCache);
=======
// History endpoint for long-term trend charts
app.get('/api/history', requireAuth, (req, res) => {
  res.json(loadHistory());
>>>>>>> parent of a81a53c (Image Rendering Finished)
});

app.post('/api/linkedin/refresh', requireAuth, async (req, res) => {
  if (MOCK) { liCache = buildMockLICache(); return res.json({ ok: true, lastFetch: liCache.lastFetch }); }
  if (fetchedToday(liCache)) return res.status(429).json({ ok: false, error: 'Already fetched today. Next refresh available tomorrow.', lastFetch: liCache.lastFetch });
  await refreshLICache();
  res.json({ ok: true, lastFetch: liCache.lastFetch });
});

app.get('/api/linkedin/history', requireAuth, (req, res) => res.json(loadHistory(LI_HISTORY)));

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
<<<<<<< HEAD
  console.log(`Finance Club Dashboard on http://localhost:${PORT}`);
  ensureDataDir();

  // Load disk caches
  const igDisk = loadCacheFile(IG_CACHE_FILE);
  if (igDisk) { igCache = igDisk; console.log('[IG] Loaded disk cache from', igCache.lastFetch); }
  const liDisk = loadCacheFile(LI_CACHE_FILE);
  if (liDisk) { liCache = liDisk; console.log('[LI] Loaded disk cache from', liCache.lastFetch); }

  if (MOCK) {
    console.log('[MOCK] Password:', process.env.DASHBOARD_PASSWORD || 'ChangeMe123!');
    if (!igCache.lastFetch) igCache = buildMockIGCache();
    if (!liCache.lastFetch) liCache = buildMockLICache();
  } else {
    if (!igCache.lastFetch) { console.log('[Startup] No IG cache — running initial scrape...'); await refreshIGCache(); }
    if (!liCache.lastFetch) { console.log('[Startup] No LI cache — running initial scrape...'); await refreshLICache(); }
=======
  console.log(`Finance Club Dashboard running on http://localhost:${PORT}`);

  // Try to load last cache from disk so the dashboard works instantly
  loadCacheFromDisk();

  if (MOCK) {
    console.log('[MOCK] Password:', process.env.DASHBOARD_PASSWORD || 'ChangeMe123!');
    if (!cache.lastFetch) cache = buildMockCache();
  } else if (!cache.lastFetch) {
    // First ever run — fetch once
    console.log('[Startup] No cached data found — running initial Apify scrape...');
    await refreshCache();
>>>>>>> parent of a81a53c (Image Rendering Finished)
  }
});
