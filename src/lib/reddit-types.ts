export interface RedditBrief {
  title: string;
  url: string;
  subreddit?: string;
  summary: string;
}

export interface RedditBriefsFile {
  asOf: string | null;
  label: string;
  briefs: RedditBrief[];
}
