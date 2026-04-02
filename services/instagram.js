const axios  = require('axios');
const config = require('../config');
const { readJSON, writeJSON } = require('./cache');
const { downloadPostImages, downloadProfilePic } = require('./images');

let cache = { account: null, insights: null, posts: null, lastFetch: null };

// ── History ──
function loadHistory() {
  return readJSON(config.IG_HISTORY_FILE, { followers: [], engagement_rate: [] });
}

function saveHistory(history) {
  writeJSON(config.IG_HISTORY_FILE, history);
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

// ── Cache ──
function loadCacheFromDisk() {
  try {
    const data = readJSON(config.IG_CACHE_FILE, null);
    if (!data) return;
    cache = data;

    // Fix old image paths
    if (cache.account && cache.account.profile_picture_url
        && cache.account.profile_picture_url.startsWith('/data/images/')
        && !cache.account.profile_picture_url.startsWith('/data/images/ig/')) {
      cache.account.profile_picture_url = cache.account.profile_picture_url.replace('/data/images/', '/data/images/ig/');
    }
    if (cache.posts) {
      cache.posts.forEach(p => {
        if (p.local_image && p.local_image.startsWith('/data/images/')
            && !p.local_image.startsWith('/data/images/ig/')) {
          p.local_image = p.local_image.replace('/data/images/', '/data/images/ig/');
        }
      });
    }
    console.log(`[IG Cache] Loaded from disk — last fetch: ${cache.lastFetch}`);
  } catch {}
}

function saveCacheToDisk() {
  writeJSON(config.IG_CACHE_FILE, cache);
}

function fetchedToday() {
  if (!cache.lastFetch) return false;
  return new Date(cache.lastFetch).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function getCache() { return cache; }

// ── Apify Fetch ──
async function fetchFromApify() {
  console.log(`[Apify/IG] Scraping @${config.IG_USERNAME}...`);

  const url = 'https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items';

  const { data } = await axios.post(url, {
    usernames: [config.IG_USERNAME],
  }, {
    params: { token: config.APIFY_TOKEN },
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000,
  });

  if (!data || data.length === 0) {
    throw new Error('Apify returned no data — check username or token');
  }

  const profile = data[0];

  const originalPicUrl = profile.profilePicUrlHD || profile.profilePicUrl || '';
  const localPicUrl = await downloadProfilePic(originalPicUrl, 'profile_' + (profile.username || config.IG_USERNAME), 'ig');

  const account = {
    id: profile.id || profile.igId || '',
    username: profile.username || config.IG_USERNAME,
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

  const history = appendSnapshot(account.followers_count, engagementRate);

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

// ── Refresh ──
async function refreshCache() {
  try {
    cache = await fetchFromApify();
    saveCacheToDisk();
    console.log(`[IG Cache] Updated at ${cache.lastFetch}`);
    return { ok: true, lastFetch: cache.lastFetch };
  } catch (err) {
    console.error('[IG Cache] Error:', err.response?.data || err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { getCache, loadCacheFromDisk, refreshCache, fetchedToday, loadHistory };
