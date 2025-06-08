// 🔹 repoFetcher.js – Dynamic GitHub file link storage and fetcher

const repoLinks = []; // [{repo, branch, path}]

export function addRepoFile(repo, branch, path) {
  repoLinks.push({ repo, branch, path });
}

export function removeRepoFile(index) {
  if (index >= 0 && index < repoLinks.length) {
    repoLinks.splice(index, 1);
  }
}

export function listRepoFiles() {
  return repoLinks.slice();
}

// Fetches latest content for all stored files
export async function fetchAllRepoFiles() {
  const results = {};
  for (const { repo, branch, path } of repoLinks) {
    const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
    try {
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      results[`${repo}/${branch}/${path}`] = await res.text();
    } catch (err) {
      results[`${repo}/${branch}/${path}`] = `ERROR: ${err.message}`;
    }
  }
  return results;
}

// Optional: fetch a single arbitrary file, not in the list
export async function fetchRepoFile(repo, branch, path) {
  const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  try {
    const res = await fetch(rawUrl);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
}