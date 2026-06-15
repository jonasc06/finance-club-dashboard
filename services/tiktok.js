const axios  = require('axios');
const config = require('../config');
const { readJSON, writeJSON } = require('./cache');
const { downloadPostImages, downloadProfilePic } = require('./images');

let cache = { account: null, insights: null, posts: null, lastFetch: null };

// ── History ──
async function loadHistory() {
  return await readJSON(config.TT_HISTORY_FILE, { followers: [], engagement_rate: [], total_likes: [] });
}

async function saveHistory(history) {
  await writeJSON(config.TT_HISTORY_FILE, history);
}

async function appendSnapshot(followersCount, engagementRate, totalLikes) {
  const history = await loadHistory();
  if (!history.total_likes) history.total_likes = [];
  const today = new Date().toISOString().slice(0, 10);
  if (!history.followers.some(e => e.date === today)) {
    history.followers.push({ date: today, value: followersCount });
  }
  if (engagementRate != null && !history.engagement_rate.some(e => e.date === today)) {
    history.engagement_rate.push({ date: today, value: engagementRate });
  }
  if (totalLikes != null && !history.total_likes.some(e => e.date === today)) {
    history.total_likes.push({ date: today, value: totalLikes });
  }
  history.followers = history.followers.slice(-90);
  history.engagement_rate = history.engagement_rate.slice(-90);
  history.total_likes = history.total_likes.slice(-90);
  await saveHistory(history);
  return history;
}

// ── Cache ──
async function loadCacheFromDisk() {
  try {
    const data = await readJSON(config.TT_CACHE_FILE, null);
    if (!data) return;
    cache = data;

    const GCS_PREFIX = 'https://storage.googleapis.com/finance-club-dashboard-cache/images/';

    // Fix GCS URLs → proxy paths
    if (cache.account && cache.account.profile_picture_url && cache.account.profile_picture_url.startsWith(GCS_PREFIX)) {
      cache.account.profile_picture_url = '/data/images/' + cache.account.profile_picture_url.slice(GCS_PREFIX.length);
    }
    if (cache.posts) {
      cache.posts.forEach(p => {
        if (p.local_image && p.local_image.startsWith(GCS_PREFIX)) {
          p.local_image = '/data/images/' + p.local_image.slice(GCS_PREFIX.length);
        }
      });
    }
    console.log(`[TT Cache] Loaded from disk — last fetch: ${cache.lastFetch}`);
  } catch {}
}

async function saveCacheToDisk() {
  await writeJSON(config.TT_CACHE_FILE, cache);
}

function fetchedToday() {
  if (!cache.lastFetch) return false;
  return new Date(cache.lastFetch).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function getCache() { return cache; }

// ── Apify Fetch ──
async function fetchFromApify(options = {}) {
  const { fullImageRescrape = true } = options;

  console.log(`[Apify/TT] Scraping @${config.TT_USERNAME}... (fullImages: ${fullImageRescrape})`);

  const url = 'https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items';

  // Light (bi-daily) run pulls only the newest posts and merges them with the
  // cache; full (monthly) run re-pulls everything. We rarely post (~1/week),
  // so 10 is plenty between full rescrapes while keeping Apify cost low.
  const resultsPerPage = fullImageRescrape ? 30 : 10;

  const { data } = await axios.post(url, {
    profiles: [config.TT_USERNAME],
    resultsPerPage,
    shouldDownloadCovers: false,
    shouldDownloadVideos: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
  }, {
    params: { token: config.APIFY_TOKEN },
    headers: { 'Content-Type': 'application/json' },
    timeout: 180000,
  });

  if (!data || data.length === 0) {
    throw new Error('Apify returned no data — check username or token');
  }

  // The actor returns one item per video, each carrying full authorMeta.
  const authorMeta = data.find(d => d.authorMeta)?.authorMeta || {};

  // ── Profile picture: only re-download if missing or full rescrape ──
  // (TikTok avatar URLs expire, so refresh on light runs too — like LinkedIn.)
  const originalPicUrl = authorMeta.avatar || authorMeta.originalAvatarUrl || '';
  let localPicUrl = cache.account?.profile_picture_url || null;
  const picIsProxyPath = localPicUrl && localPicUrl.startsWith('/data/images/');
  if (fullImageRescrape || !localPicUrl || (picIsProxyPath && originalPicUrl)) {
    const fresh = await downloadProfilePic(originalPicUrl, 'profile_' + (authorMeta.name || config.TT_USERNAME), 'tt');
    if (fresh) localPicUrl = fresh;
  }

  const account = {
    id: authorMeta.id || '',
    username: authorMeta.name || config.TT_USERNAME,
    name: authorMeta.nickName || authorMeta.name || '',
    biography: authorMeta.signature || '',
    followers_count: authorMeta.fans ?? 0,
    following_count: authorMeta.following ?? 0,
    media_count: authorMeta.video ?? 0,
    total_likes: authorMeta.heart ?? 0,
    profile_picture_url: localPicUrl || originalPicUrl,
    website: authorMeta.bioLink || '',
    profile_url: authorMeta.profileUrl || `https://www.tiktok.com/@${config.TT_USERNAME}`,
    is_verified: authorMeta.verified ?? false,
    is_private: authorMeta.privateAccount ?? false,
  };

  const rawPosts = data.filter(p => p.id && p.webVideoUrl);

  // ── Build set of cached post IDs for skipping image downloads ──
  const cachedPostImages = {};
  if (!fullImageRescrape && cache.posts) {
    cache.posts.forEach(p => {
      if (p.id && p.local_image) {
        cachedPostImages[p.id] = p.local_image;
      }
    });
  }

  let posts = rawPosts.slice(0, resultsPerPage).map(p => {
    const views    = p.playCount ?? 0;
    const likes    = p.diggCount ?? 0;
    const comments = p.commentCount ?? 0;
    const shares   = p.shareCount ?? 0;
    const saves    = p.collectCount ?? 0;

    const imageUrl = p.videoMeta?.coverUrl || p.videoMeta?.originalCoverUrl || '';
    const postId = p.id || '';

    return {
      id: postId,
      caption: (p.text || '').slice(0, 500),
      media_type: p.isSlideshow ? 'SLIDESHOW' : 'VIDEO',
      timestamp: p.createTimeISO || (p.createTime ? new Date(p.createTime * 1000).toISOString() : ''),
      permalink: p.webVideoUrl || '',
      is_pinned: !!p.isPinned,
      duration: p.videoMeta?.duration ?? 0,
      hashtags: (p.hashtags || []).map(h => (typeof h === 'string' ? h : h.name)).filter(Boolean).slice(0, 10),
      _originalImageUrl: imageUrl,
      _cachedImage: cachedPostImages[postId] || null,
      local_image: null,
      insights: {
        views, likes, comments, shares, saves,
        engagement: likes + comments + shares + saves,
      },
    };
  });

  // ── Download only NEW images ──
  const postsNeedingImages = posts.filter(p => !p._cachedImage);
  const postsWithCached    = posts.filter(p => p._cachedImage);

  console.log(`[Apify/TT] Images: ${postsWithCached.length} cached, ${postsNeedingImages.length} to download`);

  const downloaded = postsNeedingImages.length > 0
    ? await downloadPostImages(postsNeedingImages, 'tt')
    : [];

  const downloadedMap = {};
  downloaded.forEach(p => { downloadedMap[p.id] = p; });

  posts = posts.map(p => {
    if (p._cachedImage) {
      return { ...p, local_image: p._cachedImage };
    }
    if (downloadedMap[p.id]) {
      return downloadedMap[p.id];
    }
    return p;
  });

  // Clean up internal fields
  posts = posts.map(({ _originalImageUrl, _cachedImage, ...rest }) => rest);

  // ── Merge with cached posts on light refresh — keep up to 30 ──
  // Fresh posts carry updated metrics and win over their cached copy.
  if (!fullImageRescrape) {
    const newIds = new Set(posts.map(p => p.id));
    const keptCached = (cache.posts || []).filter(p => !newIds.has(p.id));
    posts = [...posts, ...keptCached];
    console.log(`[Apify/TT] Merged ${newIds.size} fresh + ${keptCached.length} cached posts`);
  }
  posts = posts.slice(0, 30);

  const numPosts      = posts.length || 1;
  const totalViews    = posts.reduce((s, p) => s + p.insights.views, 0);
  const totalLikes    = posts.reduce((s, p) => s + p.insights.likes, 0);
  const totalComments = posts.reduce((s, p) => s + p.insights.comments, 0);
  const totalShares   = posts.reduce((s, p) => s + p.insights.shares, 0);
  const totalSaves    = posts.reduce((s, p) => s + p.insights.saves, 0);

  // TikTok-standard engagement rate: interactions / views, averaged per post.
  const perPostRates = posts
    .filter(p => p.insights.views > 0)
    .map(p => p.insights.engagement / p.insights.views * 100);
  const engagementRate = perPostRates.length
    ? Math.round(perPostRates.reduce((a, b) => a + b, 0) / perPostRates.length * 100) / 100
    : 0;

  const history = await appendSnapshot(account.followers_count, engagementRate, account.total_likes);

  const insights = [
    {
      name: 'follower_count', period: 'day', title: 'Follower Count',
      values: history.followers.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })),
    },
    {
      name: 'engagement_rate', period: 'day', title: 'Engagement Rate (%)',
      values: history.engagement_rate.map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })),
    },
    {
      name: 'total_likes', period: 'day', title: 'Total Likes',
      values: (history.total_likes || []).map(e => ({ value: e.value, end_time: e.date + 'T00:00:00Z' })),
    },
  ];

  return {
    account,
    insights,
    posts,
    calculated_metrics: {
      engagement_rate: engagementRate,
      avg_views: Math.round(totalViews / numPosts),
      avg_likes: Math.round(totalLikes / numPosts * 10) / 10,
      avg_comments: Math.round(totalComments / numPosts * 10) / 10,
      avg_shares: Math.round(totalShares / numPosts * 10) / 10,
      avg_saves: Math.round(totalSaves / numPosts * 10) / 10,
      posts_scraped: numPosts,
    },
    lastFetch: new Date().toISOString(),
    source: 'apify',
  };
}

// ── Refresh ──
async function refreshCache(options = {}) {
  try {
    cache = await fetchFromApify(options);
    await saveCacheToDisk();
    console.log(`[TT Cache] Updated at ${cache.lastFetch}`);
    return { ok: true, lastFetch: cache.lastFetch };
  } catch (err) {
    console.error('[TT Cache] Error:', err.response?.data || err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { getCache, loadCacheFromDisk, refreshCache, fetchedToday, loadHistory };
