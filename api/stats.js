// Serverless Function para Vercel: /api/stats
// Gera um SVG com estatísticas básicas do GitHub.
// Usa fetch nativo do Node 18.

export default async function handler(req, res) {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    // Fallback padrão para evitar imagens quebradas caso nada seja fornecido
    const username = searchParams.get('username') || process.env.GITHUB_USERNAME || 'MatheusMartinez54';

    // Se o usuário usar ?debug=1 retorna texto em vez de SVG para inspeção
    const debug = searchParams.get('debug');

    const token = process.env.GITHUB_TOKEN;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    // Fetch user and repos
    const [userResp, reposResp] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { headers }),
      fetch(`https://api.github.com/users/${username}/repos?per_page=100`, { headers }),
    ]);

    if (!userResp.ok) throw new Error('User fetch failed');
    if (!reposResp.ok) throw new Error('Repos fetch failed');

    const user = await userResp.json();
    const repos = await reposResp.json();

    // Aggregate stats
    let stars = 0;
    const languageCount = {};
    repos.forEach((r) => {
      stars += r.stargazers_count || 0;
      if (r.language) {
        languageCount[r.language] = (languageCount[r.language] || 0) + 1;
      }
    });

    const topLanguages = Object.entries(languageCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Simple SVG layout
    const width = 500;
    const height = 170 + topLanguages.length * 22;
    const title = `${username} • GitHub Stats`;

    const langLines = topLanguages
      .map(([lang, count], i) => {
        const y = 140 + i * 22;
        return `<text x='20' y='${y}' font-size='14' fill='#444'>${lang}: ${count}</text>`;
      })
      .join('\n');

    const svg = `<?xml version='1.0' encoding='UTF-8'?>\n<svg width='${width}' height='${height}' viewBox='0 0 ${width} ${height}' xmlns='http://www.w3.org/2000/svg' role='img'>\n  <title>${title}</title>\n  <style>text{font-family:Segoe UI,Verdana,sans-serif}</style>\n  <rect width='100%' height='100%' fill='#fafafa' stroke='#eaeaea'/>\n  <text x='20' y='40' font-size='24' font-weight='600' fill='#222'>${title}</text>\n  <text x='20' y='75' font-size='14' fill='#444'>Repositórios Públicos: ${
      user.public_repos
    }</text>\n  <text x='20' y='95' font-size='14' fill='#444'>Followers: ${
      user.followers
    }</text>\n  <text x='20' y='115' font-size='14' fill='#444'>Stars Totais: ${stars}</text>\n  <text x='20' y='135' font-size='14' fill='#222' font-weight='600'>Top Linguagens:</text>\n  ${langLines}\n  <text x='20' y='${
      height - 10
    }' font-size='10' fill='#888'>Atualizado: ${new Date().toISOString().split('T')[0]}</text>\n</svg>`;

    if (debug) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ username, stars, public_repos: user.public_repos, followers: user.followers, topLanguages }, null, 2));
      return;
    }

    // Cache 5 minutos
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.end(svg);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Error: ' + e.message);
  }
}
