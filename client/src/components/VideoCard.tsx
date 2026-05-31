function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface Props {
  label: string;
  platform: string;
  title: string;
  creatorName: string;
  followerCount: number | null;
  views: number;
  likes: number;
  comments: number;
  engagementRate: number;
  uploadDate: string | null;
  durationSeconds: number;
  hashtags: string[];
  loading?: boolean;
}

export function VideoCard({
  label,
  platform,
  title,
  creatorName,
  followerCount,
  views,
  likes,
  comments,
  engagementRate,
  uploadDate,
  durationSeconds,
  hashtags,
  loading,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 animate-pulse">
        <div className="h-4 w-24 bg-slate-700 rounded mb-4" />
        <div className="h-6 w-full bg-slate-700 rounded mb-2" />
        <div className="h-4 w-2/3 bg-slate-700 rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-sky-400">{label}</span>
        <span className="text-xs uppercase tracking-wide text-slate-400">{platform}</span>
      </div>

      <div>
        <h2 className="font-medium leading-snug line-clamp-2">{title}</h2>
        <p className="text-sm text-slate-400 mt-1">{creatorName}</p>
        <p className="text-xs text-slate-500">
          {followerCount != null ? `${formatNumber(followerCount)} followers` : "Followers unknown"}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-slate-500">Views</dt>
          <dd className="font-medium">{formatNumber(views)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Likes</dt>
          <dd className="font-medium">{formatNumber(likes)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Comments</dt>
          <dd className="font-medium">{formatNumber(comments)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Engagement</dt>
          <dd className="font-medium text-emerald-400">{engagementRate.toFixed(2)}%</dd>
        </div>
        <div>
          <dt className="text-slate-500">Uploaded</dt>
          <dd>{formatDate(uploadDate)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Duration</dt>
          <dd>{formatDuration(durationSeconds)}</dd>
        </div>
      </dl>

      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {hashtags.slice(0, 6).map((tag) => (
            <span key={tag} className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
