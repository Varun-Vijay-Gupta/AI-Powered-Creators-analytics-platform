import { fetchYtDlpMetadata, type YtDlpMetadata } from "../utils/ytdlp.js";

type Platform = "youtube" | "instagram";

function pickMax(...values: Array<number | null | undefined>): number | undefined {
  const nums = values.filter((v): v is number => typeof v === "number" && v > 0);
  return nums.length ? Math.max(...nums) : undefined;
}

function parseCountFromHtml(html: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const n = parseInt(match[1].replace(/,/g, ""), 10);
      if (n > 0) return n;
    }
  }
  return undefined;
}

async function scrapeWebpageStats(
  webpageUrl: string | undefined,
  platform: Platform
): Promise<{ views?: number; likes?: number }> {
  if (!webpageUrl) return {};

  try {
    const res = await fetch(webpageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return {};
    const html = await res.text();

    if (platform === "instagram") {
      return {
        views: parseCountFromHtml(html, [
          /"video_view_count":(\d+)/,
          /"play_count":(\d+)/,
          /"view_count":(\d+)/,
          /"video_play_count":(\d+)/,
        ]),
        likes: parseCountFromHtml(html, [
          /"edge_media_preview_like":\{"count":(\d+)/,
          /"like_count":(\d+)/,
        ]),
      };
    }

    return {
      likes: parseCountFromHtml(html, [
        /"likeCount"\s*:\s*"(\d+)"/,
        /"likeCount"\s*:\s*(\d+)/,
        /"label":"([\d,.]+[KMB]?)\s+likes"/i,
      ]),
      views: parseCountFromHtml(html, [/\"viewCount\"\s*:\s*\"(\d+)\"/, /\"viewCount\"\s*:\s*(\d+)/]),
    };
  } catch {
    return {};
  }
}

async function fetchYoutubeRaw(url: string): Promise<YtDlpMetadata> {
  const [defaultMeta, webMeta] = await Promise.all([
    fetchYtDlpMetadata(url),
    fetchYtDlpMetadata(url, ["--extractor-args", "youtube:player_client=web,tv_embedded"]).catch(
      () => ({}) as YtDlpMetadata
    ),
  ]);

  return {
    ...defaultMeta,
    view_count: pickMax(defaultMeta.view_count, webMeta.view_count) ?? defaultMeta.view_count,
    like_count: pickMax(defaultMeta.like_count, webMeta.like_count) ?? defaultMeta.like_count,
    comment_count:
      pickMax(defaultMeta.comment_count, webMeta.comment_count) ?? defaultMeta.comment_count,
    channel_follower_count:
      pickMax(defaultMeta.channel_follower_count, webMeta.channel_follower_count) ??
      defaultMeta.channel_follower_count,
  };
}

function fillMissingStats(
  platform: Platform,
  stats: { views: number; likes: number; comments: number }
): { views: number; likes: number; comments: number } {
  let { views, likes, comments } = stats;

  if (platform === "youtube" && likes <= 0 && views > 0 && comments > 0) {
    // Typical YouTube engagement ~3%; derive likes from views + comments
    likes = Math.max(Math.round(views * 0.03 - comments), comments * 5, 1);
  }

  if (platform === "instagram" && views <= 0 && (likes > 0 || comments > 0)) {
    // Typical reel engagement ~5–8%; derive views from likes + comments
    const interactions = likes + comments;
    views = Math.max(Math.round(interactions / 0.06), interactions * 10, 1);
  }

  return { views, likes, comments };
}

export async function fetchPlatformMetadata(
  url: string,
  platform: Platform
): Promise<YtDlpMetadata> {
  const raw =
    platform === "youtube" ? await fetchYoutubeRaw(url) : await fetchYtDlpMetadata(url);

  const scraped = await scrapeWebpageStats(raw.webpage_url, platform);

  const views = pickMax(raw.view_count, scraped.views) ?? raw.view_count ?? 0;
  const likes = pickMax(raw.like_count, scraped.likes) ?? raw.like_count ?? 0;
  const comments = raw.comment_count ?? 0;

  const filled = fillMissingStats(platform, { views, likes, comments });

  return {
    ...raw,
    view_count: filled.views,
    like_count: filled.likes,
    comment_count: filled.comments,
  };
}
