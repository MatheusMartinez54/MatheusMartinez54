// Serverless Function para Vercel: /api/stats
// Gera um SVG com estatísticas básicas do GitHub.
// Usa fetch nativo do Node 18.

module.exports = async function handler(req, res) {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');

    // Parâmetros básicos
    const username = searchParams.get('username') || process.env.GITHUB_USERNAME || 'MatheusMartinez54';
    const debug = searchParams.get('debug');

    // Parâmetros de customização
    const theme = (searchParams.get('theme') || 'light').toLowerCase();
    const limitLangs = Math.max(0, Math.min(15, Number(searchParams.get('langs') || 5)));
    const radius = Math.max(0, Math.min(24, Number(searchParams.get('radius') || 10)));
    const hideBorder = searchParams.get('hideBorder') === '1';
    const fontSize = Math.max(10, Math.min(24, Number(searchParams.get('font') || 14)));

    const THEMES = {
      light: { bg: '#fafafa', border: '#eaeaea', title: '#222', text: '#444', accent: '#5865F2' },
      dark: { bg: '#0d1117', border: '#30363d', title: '#e6edf3', text: '#c9d1d9', accent: '#58a6ff' },
      midnight: { bg: '#0b1220', border: '#17223a', title: '#e2e8f0', text: '#cbd5e1', accent: '#7aa2f7' },
    };
    const hex = (s, fallback) => {
      if (!s) return fallback;
      const v = s.startsWith('#') ? s : `#${s}`;
      return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : fallback;
    };
    const preset = THEMES[theme] || THEMES.light;
    const colors = {
      bg: hex(searchParams.get('bg'), preset.bg),
      border: hex(searchParams.get('border'), preset.border),
      title: hex(searchParams.get('titleColor'), preset.title),
      text: hex(searchParams.get('textColor'), preset.text),
      accent: hex(searchParams.get('accent'), preset.accent),
    };

    const token = process.env.GITHUB_TOKEN;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    // Fetch user e repos
    const [userResp, reposResp] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { headers }),
      fetch(`https://api.github.com/users/${username}/repos?per_page=100`, { headers }),
    ]);
    if (!userResp.ok) throw new Error('User fetch failed');
    if (!reposResp.ok) throw new Error('Repos fetch failed');
    const user = await userResp.json();
    const repos = await reposResp.json();

    // Agregar estatísticas
    let stars = 0;
    for (const r of repos) stars += r.stargazers_count || 0;

    // Bytes por linguagem (para % real)
    const langBytes = {};
    const limitedRepos = repos.slice(0, 25);
    for (const r of limitedRepos) {
      const owner = r.owner && r.owner.login ? r.owner.login : username;
      const lr = await fetch(`https://api.github.com/repos/${owner}/${r.name}/languages`, { headers });
      if (!lr.ok) continue;
      const data = await lr.json();
      for (const [lang, bytes] of Object.entries(data)) {
        langBytes[lang] = (langBytes[lang] || 0) + (bytes || 0);
      }
    }
    const totalBytes = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1;
    const languagePercent = Object.entries(langBytes)
      .map(([lang, bytes]) => [lang, bytes, Math.round((bytes / totalBytes) * 1000) / 10])
      .sort((a, b) => b[1] - a[1])
      .slice(0, limitLangs || 5);

    // Contar commits por repositório (rápido via Link header)
    async function countCommitsAll() {
      let total = 0;
      for (const r of limitedRepos) {
        const owner = r.owner && r.owner.login ? r.owner.login : username;
        const cr = await fetch(`https://api.github.com/repos/${owner}/${r.name}/commits?author=${username}&per_page=1`, { headers });
        if (!cr.ok) continue;
        const link = cr.headers.get('link');
        if (link && link.includes('rel="last"')) {
          const m = link.match(/[&?]page=(\d+)>; rel="last"/);
          total += m ? parseInt(m[1], 10) : 1;
        } else {
          const arr = await cr.json();
          total += Array.isArray(arr) && arr.length > 0 ? arr.length : 0;
        }
      }
      return total;
    }
    const commits = await countCommitsAll();

    // Layout com espaçamentos melhores
    const width = 560;
    const baseY = 50; // posição do título
    const line = Math.round(fontSize * 1.4);
    const headBlock = baseY + line * 5; // espaço para métricas principais + commits
    const langsStart = headBlock + Math.round(line * 0.8); // separação antes do bloco de linguagens
    const height = langsStart + (languagePercent.length + 1) * line + 36; // +rodapé
    const title = `${username} • GitHub Stats`;

    const ICONS = {
      JavaScript: '🟨',
      TypeScript: '🟦',
      Python: '🐍',
      PHP: '🐘',
      Java: '☕',
      HTML: '🟧',
      CSS: '🟦',
      C: '🔵',
      'C++': '🔷',
      'C#': '🟣',
      Go: '🟡',
      Shell: '💚',
      Vue: '🟢',
      Swift: '🟠',
      Kotlin: '🟪',
      Rust: '🦀',
    };
    const barX = 170;
    const barW = width - barX - 24;
    const langLines = languagePercent
      .map(([lang, _bytes, pct], i) => {
        const y = langsStart + (i + 1) * line;
        const w = Math.max(2, Math.round((pct / 100) * barW));
        const icon = ICONS[lang] || '🔹';
        return `<text x='20' y='${y}' font-size='${fontSize}' fill='${colors.text}'>${icon} ${lang} (${pct}%)</text>\n<rect x='${barX}' y='${
          y - Math.round(fontSize * 0.9)
        }' width='${w}' height='${Math.round(fontSize * 0.8)}' fill='${colors.accent}' rx='4' />`;
      })
      .join('\n');

    if (debug) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({ endpoint: 'stats', username, stars, public_repos: user.public_repos, followers: user.followers, topLanguages }, null, 2),
      );
      return;
    }

    const borderAttrs = hideBorder ? '' : `stroke='${colors.border}'`;
    const svg = `<?xml version='1.0' encoding='UTF-8'?>\n<svg width='${width}' height='${height}' viewBox='0 0 ${width} ${height}' xmlns='http://www.w3.org/2000/svg' role='img'>\n  <title>${title}</title>\n  <style>text{font-family:Segoe UI,Ubuntu,Helvetica,Arial,sans-serif}</style>\n  <rect width='100%' height='100%' fill='${
      colors.bg
    }' ${borderAttrs} rx='${radius}'/>\n  <text x='20' y='${baseY}' font-size='${Math.round(fontSize * 1.7)}' font-weight='600' fill='${
      colors.title
    }'>${title}</text>\n  <text x='20' y='${baseY + line}' font-size='${fontSize}' fill='${colors.text}'>Repositórios Públicos: ${
      user.public_repos
    }</text>\n  <text x='20' y='${baseY + line * 2}' font-size='${fontSize}' fill='${colors.text}'>Followers: ${
      user.followers
    }</text>\n  <text x='20' y='${baseY + line * 3}' font-size='${fontSize}' fill='${colors.text}'>Stars Totais: ${stars}</text>\n  <text x='20' y='${
      baseY + line * 4
    }' font-size='${fontSize}' fill='${
      colors.text
    }'>Commits (públicos): ${commits}</text>\n  <text x='20' y='${langsStart}' font-size='${fontSize}' fill='${
      colors.title
    }' font-weight='600'>Linguagens por uso (%)</text>\n  ${langLines}\n  <text x='20' y='${height - 12}' font-size='${Math.max(
      9,
      Math.round(fontSize * 0.75),
    )}' fill='${colors.text}' opacity='0.6'>Atualizado: ${new Date().toISOString().split('T')[0]}</text>\n</svg>`;

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
};
