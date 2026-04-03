const axios  = require('axios');
const config = require('../config');
const { readJSON, writeJSON } = require('./cache');
const { downloadPostImages, downloadProfilePic } = require('./images');

let cache = { account: null, insights: null, posts: null, lastFetch: null };

// ── History ──
async function loadHistory() {
  return await readJSON(config.LI_HISTORY_FILE, { followers: [], engagement_rate: [] });
}

async function saveHistory(history) {
  await writeJSON(config.LI_HISTORY_FILE, history);
}

async function appendSnapshot(followersCount, engagementRate) {
  const history = await loadHistory();
  const today = new Date().toISOString().slice(0, 10);
  if (!history.followers.some(e => e.date === today)) {
    history.followers.push({ date: today, value: followersCount });
  }
  if (engagementRate != null && !history.engagement_rate.some(e => e.date === today)) {
    history.engagement_rate.push({ date: today, value: engagementRate });
  }
  history.followers = history.followers.slice(-90);
  history.engagement_rate = history.engagement_rate.slice(-90);
  await saveHistory(history);
  return history;
}

// ── Cache ──
async function loadCacheFromDisk() {
  try {
    const data = await readJSON(config.LI_CACHE_FILE, null);
    if (!data) return;
    cache = data;
    console.log(`[LI Cache] Loaded from disk — last fetch: ${cache.lastFetch}`);
  } catch {}
}

async function saveCacheToDisk() {
  await writeJSON(config.LI_CACHE_FILE, cache);
}

function fetchedToday() {
  if (!cache.lastFetch) return false;
  return new Date(cache.lastFetch).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function getCache() { return cache; }

// ── Apify Fetch ──
async function fetchFromApify() {
  const companyUrl = decodeURIComponent(config.LI_COMPANY_URL);
  console.log(`[Apify/LI] Scraping company: ${companyUrl}...`);

  // Step 1: Fetch company profile
  console.log('[Apify/LI] Step 1 — Fetching company profile...');
  const profileEndpoint = 'https://api.apify.com/v2/acts/dev_fusion~linkedin-company-scraper/run-sync-get-dataset-items';

  let company = {};
  try {
    const { data: profileData } = await axios.post(profileEndpoint, {
      profileUrls: [companyUrl],
    }, {
      params: { token: config.APIFY_TOKEN },
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    });

    console.log(`[Apify/LI] Profile items received: ${profileData?.length || 0}`);
    if (profileData?.[0]) {
      console.log('[Apify/LI] Profile keys:', Object.keys(profileData[0]).join(', '));
      company = profileData[0];
    }
  } catch (err) {
    console.warn('[Apify/LI] Profile scraper failed, will try fallback from posts:', err.message);
  }

  // Step 2: Fetch company posts
  console.log('[Apify/LI] Step 2 — Fetching company posts...');
  const postsEndpoint = 'https://api.apify.com/v2/acts/harvestapi~linkedin-company-posts/run-sync-get-dataset-items';

  const { data: postsData } = await axios.post(postsEndpoint, {
    targetUrls: [companyUrl],
  }, {
    params: { token: config.APIFY_TOKEN },
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000,
  });

  console.log('[Apify/LI] Raw posts response (first 500 chars):', JSON.stringify(postsData).slice(0, 500));
  console.log(`[Apify/LI] Post items received: ${postsData?.length || 0}`);
  if (postsData?.[0]) console.log('[Apify/LI] First post keys:', Object.keys(postsData[0]).join(', '));

  const rawPosts = (postsData || []).filter(p => p.type === 'post');
  console.log(`[Apify/LI] Posts after type=post filter: ${rawPosts.length}`);

  // ── Fallback: extract profile info from posts' author field ──
  if (!company.companyName && !company.name && rawPosts.length > 0) {
    const author = rawPosts[0].author || {};
    console.log('[Apify/LI] Using fallback profile from posts author:', JSON.stringify(author).slice(0, 500));
    company = {
      companyName: author.name || author.companyName || '',
      description: author.description || author.headline || '',
      tagline: author.tagline || '',
      followerCount: author.followerCount ?? author.followersCount ?? 0,
      employeeCount: author.employeeCount ?? company.employeeCount ?? 0,
      logoResolutionResult: author.profilePicture || author.logo || author.image || '',
      logoUrl: author.profilePicture || author.logo || author.image || '',
      websiteUrl: author.websiteUrl || author.url || '',
      url: author.linkedinUrl || author.url || companyUrl,
      ...company,  // keep any fields from profile scraper that did come through
    };
    // Override empty fields from profile scraper with author data
    if (!company.followerCount && (author.followerCount || author.followersCount)) {
      company.followerCount = author.followerCount ?? author.followersCount ?? 0;
    }
  }

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

  console.log(`[Apify/LI] Account built — name: "${account.name}", followers: ${account.followers_count}`);

  let posts = rawPosts.slice(0, 12).map(p => {
    const eng = p.engagement || {};
    const likes    = eng.likes ?? 0;
    const comments = eng.comments ?? 0;
    const shares   = eng.shares ?? 0;

    const reactionBreakdown = { LIKE: 0, APPRECIATION: 0, EMPATHY: 0, PRAISE: 0, INTEREST: 0, ENTERTAINMENT: 0 };
    (eng.reactions || []).forEach(r => {
      if (reactionBreakdown.hasOwnProperty(r.type)) {
        reactionBreakdown[r.type] = r.count || 0;
      }
    });
    const totalReactionsForPost = Object.values(reactionBreakdown).reduce((a, b) => a + b, 0);

    let media_type = 'TEXT';
    if (p.postImages && p.postImages.length > 0) media_type = 'IMAGE';
    if (p.document) media_type = 'DOCUMENT';
    if (p.video) media_type = 'VIDEO';

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

  console.log(`[Apify/LI] Downloading ${posts.length} post images...`);
  posts = await downloadPostImages(posts, 'li');
  posts = posts.map(({ _originalImageUrl, ...rest }) => rest);

  const totalReactions = posts.reduce((s, p) => s + p.insights.reactions, 0);
  const totalComments  = posts.reduce((s, p) => s + p.insights.comments, 0);
  const totalShares    = posts.reduce((s, p) => s + p.insights.shares, 0);
  const numPosts       = posts.length || 1;
  const followers      = account.followers_count || 1;
  const engagementRate = Math.round(((totalReactions + totalComments + totalShares) / numPosts) / followers * 10000) / 100;

  const history = await appendSnapshot(account.followers_count, engagementRate);

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

// ── Refresh ──
async function refreshCache() {
  try {
    cache = await fetchFromApify();
    await saveCacheToDisk();
    console.log(`[LI Cache] Updated at ${cache.lastFetch}`);
    return { ok: true, lastFetch: cache.lastFetch };
  } catch (err) {
    console.error('[LI Cache] Error:', err.response?.data || err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { getCache, loadCacheFromDisk, refreshCache, fetchedToday, loadHistory };
