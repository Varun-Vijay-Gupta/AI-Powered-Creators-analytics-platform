interface Props {
  youtubeUrl: string;
  instagramUrl: string;
  onYoutubeChange: (v: string) => void;
  onInstagramChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
}

export function UrlForm({
  youtubeUrl,
  instagramUrl,
  onYoutubeChange,
  onInstagramChange,
  onSubmit,
  loading,
  error,
}: Props) {
  return (
    <form
      className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h1 className="text-lg font-semibold">Compare two videos</h1>
      <p className="text-sm text-slate-400">
        Video A = YouTube, Video B = Instagram Reel. Analysis pulls live metadata and transcripts.
      </p>

      <label className="block text-sm">
        <span className="text-slate-400">YouTube URL (Video A)</span>
        <input
          type="url"
          required
          value={youtubeUrl}
          onChange={(e) => onYoutubeChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </label>

      <label className="block text-sm">
        <span className="text-slate-400">Instagram Reel URL (Video B)</span>
        <input
          type="url"
          required
          value={instagramUrl}
          onChange={(e) => onInstagramChange(e.target.value)}
          placeholder="https://www.instagram.com/reel/..."
          className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </label>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full sm:w-auto rounded bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Analyzing… (this can take a minute)" : "Analyze videos"}
      </button>
    </form>
  );
}
