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

    const GCS_PREFIX = 'https://storage.googleapis.com/finance-club-dashboard-cache/images/';

    // Fix GCS URLs → proxy paths
    if (cache.account && cache.account.logo_url && cache.account.logo_url.startsWith(GCS_PREFIX)) {
      cache.account.logo_url = '/data/images/' + cache.account.logo_url.slice(GCS_PREFIX.length);
    }
    if (cache.posts) {
      cache.posts.forEach(p => {
        if (p.local_image && p.local_image.startsWith(GCS_PREFIX)) {
          p.local_image = '/data/images/' + p.local_image.slice(GCS_PREFIX.length);
        }
      });
    }

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

async function fetchFromApify(options = {}) {
  const { fullImageRescrape = true } = options;
  const companyUrl = decodeURIComponent(config.LI_COMPANY_URL);
  console.log(`[Apify/LI] Scraping company: ${companyUrl}... (fullImages: ${fullImageRescrape})`);

  const postsEndpoint = 'https://api.apify.com/v2/acts/harvestapi~linkedin-company-posts/run-sync-get-dataset-items';
  let company = {};
  let rawPosts = [];

  if (fullImageRescrape) {
    // ════════════════════════════════════════════
    // FULL REFRESH — all company data + all posts
    // ════════════════════════════════════════════

    // Step 1: Try dedicated profile scraper
    console.log('[Apify/LI] Step 1 — Fetching company profile (full rescrape)...');
    const profileEndpoint = 'https://api.apify.com/v2/acts/dev_fusion~linkedin-company-scraper/run-sync-get-dataset-items';
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
      console.warn('[Apify/LI] Profile scraper failed:', err.message);
    }

    // Step 2: Fetch all posts
    console.log('[Apify/LI] Step 2 — Fetching all posts...');
    const { data: postsData } = await axios.post(postsEndpoint, {
      targetUrls: [companyUrl],
      maxPosts: 50,
      scrapeComments: false,
      scrapeReactions: false,
      includeReposts: false,
      includeQuotePosts: false,
    }, {
      params: { token: config.APIFY_TOKEN },
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    });

    console.log(`[Apify/LI] Post items received: ${postsData?.length || 0}`);
    rawPosts = (postsData || []).filter(p => p.type === 'post');
    console.log(`[Apify/LI] Posts after type=post filter: ${rawPosts.length}`);

  } else {
    // ════════════════════════════════════════════
    // LIGHT REFRESH — new posts only + follower update
    // ════════════════════════════════════════════

    // Calculate cutoff: lastFetch - 2 days
    const lastFetch = cache.lastFetch ? new Date(cache.lastFetch) : new Date(0);
    const cutoff = new Date(lastFetch.getTime() - 2 * 24 * 60 * 60 * 1000);
    const cutoffDate = cutoff.toISOString().slice(0, 10); // "2026-04-02"
    console.log(`[Apify/LI] Light refresh — postedLimitDate: ${cutoffDate}`);

    // Fetch only posts after cutoff
    console.log('[Apify/LI] Step 1 — Fetching recent posts...');
    const { data: postsData } = await axios.post(postsEndpoint, {
      targetUrls: [companyUrl],
      maxPosts: 10,
      postedLimitDate: cutoffDate,
      scrapeComments: false,
      scrapeReactions: false,
      includeReposts: false,
      includeQuotePosts: false,
    }, {
      params: { token: config.APIFY_TOKEN },
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000,
    });

    console.log(`[Apify/LI] Post items received: ${postsData?.length || 0}`);
    const allPosts = (postsData || []).filter(p => p.type === 'post');

    // Extract follower count from author field
    let followerCount = 0;
    if (allPosts.length > 0) {
      const author = allPosts[0].author || {};
      if (author.info && typeof author.info === 'string') {
        const match = author.info.replace(/,/g, '').match(/([\d]+)\s*follower/i);
        if (match) followerCount = parseInt(match[1], 10);
      }
      console.log(`[Apify/LI] Follower count from author.info: ${followerCount}`);
    }

    // If no posts returned at all → fetch just 1 post (no date limit) to get author info
    if (allPosts.length === 0 && followerCount === 0) {
      console.log('[Apify/LI] No posts returned — fetching 1 post for follower info...');
      try {
        const { data: minimalData } = await axios.post(postsEndpoint, {
          targetUrls: [companyUrl],
          maxPosts: 1,
          scrapeComments: false,
          scrapeReactions: false,
          includeReposts: false,
          includeQuotePosts: false,
        }, {
          params: { token: config.APIFY_TOKEN },
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000,
        });

        const minimalPosts = (minimalData || []).filter(p => p.type === 'post');
        if (minimalPosts.length > 0) {
          const author = minimalPosts[0].author || {};
          if (author.info && typeof author.info === 'string') {
            const match = author.info.replace(/,/g, '').match(/([\d]+)\s*follower/i);
            if (match) followerCount = parseInt(match[1], 10);
          }
          console.log(`[Apify/LI] Follower count from minimal scrape: ${followerCount}`);
        }
      } catch (err) {
        console.warn('[Apify/LI] Minimal scrape failed:', err.message);
      }
    }

    // Extract avatar URL from author field
    let avatarUrl = '';
    const authorForAvatar = allPosts.length > 0 ? (allPosts[0].author || {}) : {};
    if (authorForAvatar.avatar && authorForAvatar.avatar.url) {
      avatarUrl = authorForAvatar.avatar.url;
    }

    // Build company from cached data + updated follower count + fresh avatar
    company = {
      companyName: cache.account?.name || '',
      description: cache.account?.description || '',
      tagline: cache.account?.tagline || '',
      followerCount: followerCount || cache.account?.followers_count || 0,
      logoResolutionResult: avatarUrl || cache.account?.logo_url || '',
      websiteUrl: cache.account?.website || '',
      url: cache.account?.linkedin_url || companyUrl,
    };


    rawPosts = allPosts;
    console.log(`[Apify/LI] Will process ${rawPosts.length} new + ${(cache.posts || []).length} cached posts`);
  }

  // ── Fallback: extract profile info from posts' author field ──
  if (!company.companyName && !company.name && rawPosts.length > 0) {
    const author = rawPosts[0].author || {};
    console.log('[Apify/LI] Using fallback profile from posts author:', JSON.stringify(author).slice(0, 500));

    let followerCount = 0;
    if (author.info && typeof author.info === 'string') {
      const match = author.info.replace(/,/g, '').match(/([\d]+)\s*follower/i);
      if (match) followerCount = parseInt(match[1], 10);
    }

    const avatarUrl = (author.avatar && author.avatar.url) ? author.avatar.url : '';

    company = {
      companyName: author.name || '',
      description: '',
      tagline: '',
      followerCount: followerCount,
      logoResolutionResult: avatarUrl,
      logoUrl: avatarUrl,
      websiteUrl: author.website || '',
      url: author.linkedinUrl || companyUrl,
    };
  }

  // ── Logo: only re-download if missing or full rescrape ──
  const originalLogoUrl = company.logoResolutionResult || company.logoUrl || company.logo || '';
  let localLogoUrl = cache.account?.logo_url || null;
  const logoIsProxyPath = localLogoUrl && localLogoUrl.startsWith('/data/images/');
  const logoIsRealUrl = originalLogoUrl && originalLogoUrl.startsWith('http');

  if (fullImageRescrape || !localLogoUrl) {
    // Full rescrape or no cached logo → download
    if (logoIsRealUrl) {
      localLogoUrl = await downloadProfilePic(originalLogoUrl, 'li_logo', 'li');
    }
  } else if (logoIsProxyPath && logoIsRealUrl) {
    // Light refresh: logo exists in cache, but re-download if avatar URL changed
    // (LinkedIn avatar URLs expire, so refresh periodically)
    const freshLogo = await downloadProfilePic(originalLogoUrl, 'li_logo', 'li');
    if (freshLogo) localLogoUrl = freshLogo;
  }


  const account = {
    name: company.companyName || company.name || '',
    description: company.description || '',
    tagline: company.tagline || '',
    followers_count: company.followerCount ?? 0,
    logo_url: localLogoUrl || originalLogoUrl,
    cover_url: company.croppedCoverImage || company.originalCoverImage || '',
    website: company.websiteUrl || '',
    linkedin_url: company.url || companyUrl,
  };

  console.log(`[Apify/LI] Account built — name: "${account.name}", followers: ${account.followers_count}`);

  // ── Map raw posts to our format ──
  const cachedPostImages = {};
  if (!fullImageRescrape && cache.posts) {
    cache.posts.forEach(p => {
      if (p.id && p.local_image) {
        cachedPostImages[p.id] = p.local_image;
      }
    });
  }

  let newMappedPosts = rawPosts.slice(0, 12).map(p => {
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

    const postId = p.id || '';

    return {
      id: postId,
      text: (p.content || '').slice(0, 500),
      media_type,
      timestamp,
      permalink: p.linkedinUrl || '',
      _originalImageUrl: imageUrl,
      _cachedImage: cachedPostImages[postId] || null,
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

  // ── Download images for new posts only ──
  const postsNeedingImages = newMappedPosts.filter(p => !p._cachedImage);
  const postsWithCached    = newMappedPosts.filter(p => p._cachedImage);

  console.log(`[Apify/LI] Images: ${postsWithCached.length} cached, ${postsNeedingImages.length} to download`);

  const downloaded = postsNeedingImages.length > 0
    ? await downloadPostImages(postsNeedingImages, 'li')
    : [];

  const downloadedMap = {};
  downloaded.forEach(p => { downloadedMap[p.id] = p; });

  newMappedPosts = newMappedPosts.map(p => {
    if (p._cachedImage) {
      return { ...p, local_image: p._cachedImage };
    }
    if (downloadedMap[p.id]) {
      return downloadedMap[p.id];
    }
    return p;
  });

  // Clean up internal fields
  newMappedPosts = newMappedPosts.map(({ _originalImageUrl, _cachedImage, ...rest }) => rest);

  // ── Merge with cached posts for light refresh ──
  let posts;
  if (fullImageRescrape) {
    posts = newMappedPosts.slice(0, 12);
  } else {
    const newIds = new Set(newMappedPosts.map(p => p.id));
    const keptCached = (cache.posts || []).filter(p => !newIds.has(p.id));
    posts = [...newMappedPosts, ...keptCached].slice(0, 12);
    console.log(`[Apify/LI] Final posts: ${newMappedPosts.length} new + ${keptCached.length} cached = ${posts.length} total`);
  }

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
async function refreshCache(options = {}) {
  try {
    cache = await fetchFromApify(options);
    await saveCacheToDisk();
    console.log(`[LI Cache] Updated at ${cache.lastFetch}`);
    return { ok: true, lastFetch: cache.lastFetch };
  } catch (err) {
    console.error('[LI Cache] Error:', err.response?.data || err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { getCache, loadCacheFromDisk, refreshCache, fetchedToday, loadHistory };
