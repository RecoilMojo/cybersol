import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const host = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cybersol.org";
  const now = new Date();
  return [
    { url: host, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${host}/play`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${host}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${host}/roadmap`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${host}/leaderboard`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
  ];
}
