// episodeLinks.js

async function fetchEpisodeList() {
  const res = await fetch("https://epguides.com/AmericanDad/");
  const html = await res.text();
  const rows = [...html.matchAll(/<tr>[\s\S]*?<\/tr>/gi)];
  const episodes = [];
  for (let row of rows) {
    const tds = [...row[0].matchAll(/<td[^>]*>(.*?)<\/td>/g)];
    if (tds.length < 5) continue;
    let [epNum, , airDate, titleHtml] = tds.map(x => x[1]);
    const match = String(epNum).match(/(\d+)-(\d+)/);
    if (!match) continue;
    const [ , season, episode ] = match;
    const title = titleHtml.replace(/<.*?>/g, "").replace(/"/g, '').trim();
    episodes.push({
      season: Number(season),
      episode: Number(episode),
      airDate: airDate.trim(),
      title
    });
  }
  return episodes;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function getWCOTVEpisodeLink(season, episode) {
  const episodes = await fetchEpisodeList();
  const ep = episodes.find(e =>
    e.season === Number(season) && e.episode === Number(episode)
  );
  if (!ep) return null;
  const slug = slugify(ep.title);
  return {
    ...ep,
    url: `https://www.wco.tv/american-dad-season-${season}-episode-${episode}-${slug}`
  };
}

export async function getRandomWCOEpisodeLink(season) {
  const episodes = await fetchEpisodeList();
  const filtered = episodes.filter(e => e.season === Number(season));
  if (!filtered.length) return null;
  const ep = filtered[Math.floor(Math.random() * filtered.length)];
  const slug = slugify(ep.title);
  return {
    ...ep,
    url: `https://www.wco.tv/american-dad-season-${season}-episode-${ep.episode}-${slug}`
  };
}