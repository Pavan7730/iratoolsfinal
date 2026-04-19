/* =========================================================
   HEAD TO HEAD — YouTube Compare Tool v2
   Data strategy (no API key):
   1. oEmbed (direct, CORS-enabled) — title, channel, thumbnail
   2. Invidious public API (direct, CORS-enabled) — viewCount,
      likeCount, lengthSeconds, publishDate, description, keywords
   3. Fallback: page scrape via proxy if Invidious is down
   ========================================================= */

(() => {
  'use strict';

  /* ---------- Invidious public instances ----------
     These are community-run YouTube frontends with public APIs.
     Tried in order; first successful response is used.            */
  const INVIDIOUS = [
    'https://inv.nadeko.net',
    'https://iv.datura.network',
    'https://invidious.privacydev.net',
    'https://yt.artemislena.eu',
    'https://invidious.lunar.icu',
    'https://invidious.nerdvpn.de',
  ];

  /* ---------- Fallback CORS proxies (page scrape) ---------- */
  const PROXIES = [
    (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  ];

  // ---------- DOM ----------
  const $urlA  = document.getElementById('url-a');
  const $urlB  = document.getElementById('url-b');
  const $btn   = document.getElementById('compare-btn');
  const $err   = document.getElementById('error-msg');
  const $load  = document.getElementById('loader');
  const $ltxt  = document.getElementById('loader-text');
  const $res   = document.getElementById('results');
  const $toast = document.getElementById('toast');

  // ---------- Helpers ----------
  const showError = (m) => {
    $err.textContent = m;
    $err.classList.add('show');
    setTimeout(() => $err.classList.remove('show'), 8000);
  };
  const toast = (m, t = '') => {
    $toast.className = 'toast show ' + t;
    $toast.textContent = m;
    setTimeout(() => $toast.classList.remove('show'), 3000);
  };
  const stage = (t) => { $ltxt.textContent = t; };

  const extractId = (raw) => {
    if (!raw) return null;
    raw = raw.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    const m = raw.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  };

  const fmt = (n) => {
    if (n == null || isNaN(n) || n < 0) return '—';
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
    if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  const fmtDur = (secs) => {
    if (!secs || isNaN(secs) || secs <= 0) return '—';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h) return `${h}h ${m}m`;
    return `${m}m ${String(s).padStart(2,'0')}s`;
  };

  const fmtDate = (ts) => {
    if (!ts) return '—';
    try {
      // ts can be unix seconds (number) or ISO string
      const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return '—'; }
  };

  const daysSince = (ts) => {
    if (!ts) return null;
    try {
      const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
      if (isNaN(d.getTime())) return null;
      return Math.max(1, Math.floor((Date.now() - d.getTime()) / 86400000));
    } catch { return null; }
  };

  // ---------- oEmbed — direct (YouTube is CORS-friendly here) ----------
  async function getOEmbed(id) {
    const url = `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${id}&format=json`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const d = await r.json();
        if (d?.title) return d;
      }
    } catch {}
    // Proxy fallback for oEmbed
    for (const p of PROXIES) {
      try {
        const r = await fetch(p(url), { signal: AbortSignal.timeout(8000) });
        if (!r.ok) continue;
        const ct = r.headers.get('content-type') || '';
        let txt = ct.includes('application/json')
          ? ((j) => j?.contents || JSON.stringify(j))(await r.json())
          : await r.text();
        if (!txt) continue;
        try {
          let p2 = JSON.parse(txt);
          if (p2?.contents) p2 = JSON.parse(p2.contents);
          if (p2?.title) return p2;
        } catch {}
      } catch {}
    }
    return null;
  }

  // ---------- Invidious API — primary data source ----------
  async function fetchInvidious(id) {
    for (const instance of INVIDIOUS) {
      try {
        const url = `${instance}/api/v1/videos/${id}?fields=title,videoId,author,viewCount,likeCount,published,publishedText,lengthSeconds,description,keywords,genre,subCountText,authorVerified`;
        const r = await fetch(url, {
          signal: AbortSignal.timeout(9000),
          headers: { 'Accept': 'application/json' },
        });
        if (!r.ok) continue;
        const d = await r.json();
        if (d && (d.viewCount !== undefined || d.lengthSeconds !== undefined)) {
          return {
            viewCount:         d.viewCount        ?? null,
            likeCount:         d.likeCount        ?? null,
            lengthSeconds:     d.lengthSeconds    ?? null,
            published:         d.published        ?? null,  // unix seconds
            publishedText:     d.publishedText    ?? '',
            descriptionLength: (d.description || '').length,
            descriptionText:   d.description     || '',
            keywordCount:      (d.keywords || []).length,
            genre:             d.genre            || '',
            source: instance,
          };
        }
      } catch {}
    }
    return null;
  }

  // ---------- Fallback: page scrape ----------
  async function scrapeYtPage(id) {
    const pageUrl = `https://www.youtube.com/watch?v=${id}`;
    for (const p of PROXIES) {
      try {
        const r = await fetch(p(pageUrl), { signal: AbortSignal.timeout(14000) });
        if (!r.ok) continue;
        const ct = r.headers.get('content-type') || '';
        let html = ct.includes('application/json')
          ? ((j) => j?.contents || '')(await r.json())
          : await r.text();
        if (!html || html.length < 500) continue;
        return parsePage(html);
      } catch {}
    }
    return {};
  }

  function parsePage(html) {
    const out = {};
    const num = (s) => s ? parseInt(s.replace(/,/g, ''), 10) : null;

    const vc = html.match(/"viewCount"\s*:\s*"(\d+)"/);
    if (vc) out.viewCount = parseInt(vc[1], 10);

    const ls = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
    if (ls) out.lengthSeconds = parseInt(ls[1], 10);

    const pd = html.match(/"publishDate"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/);
    if (pd) out.published = new Date(pd[1]).getTime() / 1000;

    const lc = html.match(/"likeCount"\s*:\s*"(\d+)"/);
    if (lc) out.likeCount = parseInt(lc[1], 10);

    const sd = html.match(/"shortDescription"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (sd) {
      const desc = sd[1].replace(/\\n/g,'\n').replace(/\\"/g,'"').replace(/\\\\/g,'\\');
      out.descriptionLength = desc.length;
      out.descriptionText   = desc;
    }

    const kw = html.match(/"keywords"\s*:\s*(\[[^\]]*\])/);
    if (kw) { try { out.keywordCount = JSON.parse(kw[1]).length; } catch {} }

    return out;
  }

  // ---------- Extract chapters from description ----------
  function countChapters(desc) {
    if (!desc) return 0;
    const re = /(?:^|\n)\s*\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?/gm;
    const m = desc.match(re) || [];
    return m.length >= 2 ? m.length : 0;
  }

  // ---------- Fetch all data for one video ----------
  async function fetchAll(id, label) {
    stage(`Loading ${label}…`);

    // 1. oEmbed (always needed for title/channel/thumb)
    const oembed = await getOEmbed(id);
    if (!oembed) throw new Error(`"${label}" could not be loaded — video may be private or the URL is invalid.`);

    // 2. Invidious (primary metrics source)
    stage(`Fetching metrics for ${label} via Invidious…`);
    let page = await fetchInvidious(id);

    // 3. Page scrape fallback if Invidious completely failed
    if (!page) {
      stage(`Invidious unavailable, trying fallback for ${label}…`);
      page = await scrapeYtPage(id);
    }

    page = page || {};
    page.chaptersCount = countChapters(page.descriptionText);

    return { id, oembed, page };
  }

  // ---------- Build one comparison row ----------
  function makeRow({ name, valA, valB, dispA, dispB, higherWins }) {
    const hasA = valA != null && !isNaN(valA) && valA >= 0;
    const hasB = valB != null && !isNaN(valB) && valB >= 0;

    // Skip row if both sides have no real data
    if (!hasA && !hasB) return null;
    // Skip if both are 0
    if (hasA && hasB && valA === 0 && valB === 0) return null;

    let winner = 'tie';
    if (hasA && hasB) {
      const maxV = Math.max(valA, valB);
      const margin = maxV > 0 ? Math.abs(valA - valB) / maxV : 0;
      if (margin >= 0.03) winner = (higherWins ? valA > valB : valA < valB) ? 'a' : 'b';
    } else if (hasA) { winner = 'a'; }
    else if (hasB)   { winner = 'b'; }

    const total = (hasA ? valA : 0) + (hasB ? valB : 0);
    const pctA  = total > 0 ? Math.round((hasA ? valA : 0) / total * 100) : 50;
    const pctB  = 100 - pctA;

    const dA = dispA || (hasA ? fmt(valA) : '—');
    const dB = dispB || (hasB ? fmt(valB) : '—');

    const tagA = winner === 'a' ? `<span class="win-tag win-sky">▲ Wins</span>`
               : winner === 'tie' ? `<span class="win-tag win-tie">≈ Tie</span>` : '';
    const tagB = winner === 'b' ? `<span class="win-tag win-rose">▲ Wins</span>`
               : winner === 'tie' ? `<span class="win-tag win-tie">≈ Tie</span>` : '';

    const bA = winner === 'a' ? 'bar-sky' : winner === 'tie' ? 'bar-tie' : 'bar-sky';
    const bB = winner === 'b' ? 'bar-rose' : winner === 'tie' ? 'bar-tie' : 'bar-rose';

    return {
      winner,
      html: `
        <div class="compare-row">
          <div class="compare-side">
            <div class="compare-value">${dA}</div>
            <div class="compare-bar-wrap">
              <div class="compare-bar ${bA}" style="width:0%" data-w="${pctA}"></div>
            </div>
            ${tagA}
          </div>
          <div class="metric-name">${name}</div>
          <div class="compare-side right">
            <div class="compare-value">${dB}</div>
            <div class="compare-bar-wrap">
              <div class="compare-bar ${bB}" style="width:0%" data-w="${pctB}"></div>
            </div>
            ${tagB}
          </div>
        </div>
      `,
    };
  }

  // ---------- Render ----------
  function render(a, b) {
    const $ = (id) => document.getElementById(id);

    // Thumbnails (use maxresdefault, fall back to hqdefault)
    const imgA = document.getElementById('thumb-a');
    const imgB = document.getElementById('thumb-b');
    imgA.src = `https://i.ytimg.com/vi/${a.id}/maxresdefault.jpg`;
    imgA.onerror = () => { imgA.src = `https://i.ytimg.com/vi/${a.id}/hqdefault.jpg`; };
    imgB.src = `https://i.ytimg.com/vi/${b.id}/maxresdefault.jpg`;
    imgB.onerror = () => { imgB.src = `https://i.ytimg.com/vi/${b.id}/hqdefault.jpg`; };

    const titleA = a.oembed.title || '—';
    const titleB = b.oembed.title || '—';
    $('vtitle-a').textContent  = titleA;
    $('vtitle-b').textContent  = titleB;
    $('channel-a').textContent = a.oembed.author_name || '—';
    $('channel-b').textContent = b.oembed.author_name || '—';

    // Daily avg
    const daysA  = daysSince(a.page.published);
    const daysB  = daysSince(b.page.published);
    const dailyA = (a.page.viewCount && daysA) ? Math.round(a.page.viewCount / daysA) : null;
    const dailyB = (b.page.viewCount && daysB) ? Math.round(b.page.viewCount / daysB) : null;

    // Quick stat pills
    $('views-a').textContent = fmt(a.page.viewCount);
    $('views-b').textContent = fmt(b.page.viewCount);
    $('daily-a').textContent = dailyA ? fmt(dailyA) + '/day' : '—';
    $('daily-b').textContent = dailyB ? fmt(dailyB) + '/day' : '—';
    $('dur-a').textContent   = fmtDur(a.page.lengthSeconds);
    $('dur-b').textContent   = fmtDur(b.page.lengthSeconds);
    $('pub-a').textContent   = fmtDate(a.page.published);
    $('pub-b').textContent   = fmtDate(b.page.published);

    // Build metric rows (filter nulls)
    const rows = [
      makeRow({ name:'Total Views',         valA: a.page.viewCount,       valB: b.page.viewCount,       higherWins: true }),
      makeRow({ name:'Daily Avg Views',     valA: dailyA,                 valB: dailyB,                 higherWins: true }),
      makeRow({ name:'Likes',               valA: a.page.likeCount,       valB: b.page.likeCount,       higherWins: true }),
      makeRow({ name:'Video Duration',      valA: a.page.lengthSeconds,   valB: b.page.lengthSeconds,   higherWins: false,
                dispA: fmtDur(a.page.lengthSeconds), dispB: fmtDur(b.page.lengthSeconds) }),
      makeRow({ name:'Video Age',           valA: daysA,                  valB: daysB,                  higherWins: false,
                dispA: daysA ? daysA.toLocaleString() + ' days' : '—', dispB: daysB ? daysB.toLocaleString() + ' days' : '—' }),
      makeRow({ name:'Tags & Keywords',     valA: a.page.keywordCount,    valB: b.page.keywordCount,    higherWins: true }),
      makeRow({ name:'Description Depth',   valA: a.page.descriptionLength, valB: b.page.descriptionLength, higherWins: true,
                dispA: a.page.descriptionLength ? a.page.descriptionLength.toLocaleString() + ' chars' : '—',
                dispB: b.page.descriptionLength ? b.page.descriptionLength.toLocaleString() + ' chars' : '—' }),
      makeRow({ name:'Chapters',            valA: a.page.chaptersCount,   valB: b.page.chaptersCount,   higherWins: true }),
      makeRow({ name:'Title Length',        valA: titleA.length,          valB: titleB.length,          higherWins: false,
                dispA: titleA.length + ' chars', dispB: titleB.length + ' chars' }),
    ].filter(Boolean);

    $('compare-table').innerHTML = rows.map(r => r.html).join('');

    // Animate bars
    requestAnimationFrame(() => setTimeout(() => {
      document.querySelectorAll('.compare-bar[data-w]').forEach(bar => {
        bar.style.width = bar.dataset.w + '%';
      });
    }, 120));

    // Tally
    let wA = 0, wB = 0, ties = 0;
    rows.forEach(r => {
      if (r.winner === 'a') wA++;
      else if (r.winner === 'b') wB++;
      else ties++;
    });

    $('wins-a').textContent   = wA;
    $('wins-b').textContent   = wB;
    $('wins-tie').textContent = `${ties} tie${ties !== 1 ? 's' : ''}`;

    // Verdict
    let trophy, vTitle, vDesc;
    if (wA === wB) {
      trophy = '🤝';
      vTitle = `It's a <em>draw.</em>`;
      vDesc  = `Both videos are evenly matched across ${rows.length} metrics. Audience targeting and content quality will decide the real winner.`;
    } else if (wA > wB) {
      trophy = '🏆';
      $('card-a').classList.add('winner-card');
      const pct = Math.round(wA / (wA + wB) * 100);
      vTitle = `<em>Your video</em> is winning.`;
      vDesc  = `Leading on ${wA} of ${rows.length} metrics (${pct}% dominance). ${
        dailyA && dailyB && dailyA > dailyB
          ? `Daily momentum is ${fmt(dailyA - dailyB)} views/day higher — a compounding advantage.`
          : 'Keep this format going and focus on improving where the competitor edges you out.'}`;
    } else {
      trophy = '📊';
      $('card-b').classList.add('winner-card');
      const pct = Math.round(wB / (wA + wB) * 100);
      vTitle = `Competitor leads on <em>${wB} metrics.</em>`;
      vDesc  = `They're winning ${pct}% of measured categories. ${
        dailyB && dailyA && dailyB > dailyA
          ? `Their daily average is ${fmt(dailyB - dailyA)} views/day higher — closing that gap should be the priority.`
          : 'Check their description depth, tag count, and chapter structure — those are fastest to close.'}`;
    }

    $('trophy').textContent      = trophy;
    $('verdict-title').innerHTML = vTitle;
    $('verdict-desc').textContent = vDesc;

    $res.classList.add('active');
    $res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Comparison ready ✓', 'success');
  }

  // ---------- Main ----------
  async function handleCompare() {
    const idA = extractId($urlA.value);
    const idB = extractId($urlB.value);

    if (!idA && !idB) { showError('Please paste both YouTube URLs.'); return; }
    if (!idA) { showError('Your Video URL is not a valid YouTube link.'); return; }
    if (!idB) { showError('Competitor URL is not a valid YouTube link.'); return; }
    if (idA === idB) { showError('Both URLs are the same video. Enter two different videos to compare.'); return; }

    $btn.disabled = true;
    const orig = $btn.innerHTML;
    $btn.innerHTML = '<span class="spinner"></span> Comparing…';
    $err.classList.remove('show');
    $res.classList.remove('active');
    $load.classList.add('active');
    document.getElementById('card-a').classList.remove('winner-card');
    document.getElementById('card-b').classList.remove('winner-card');

    try {
      // Run both in parallel for speed
      const [a, b] = await Promise.all([
        fetchAll(idA, 'Your Video'),
        fetchAll(idB, 'Competitor'),
      ]);

      $load.classList.remove('active');
      render(a, b);
    } catch (err) {
      console.error('[Compare]', err);
      $load.classList.remove('active');
      showError(err.message || 'Something went wrong. Please check the URLs and try again.');
      toast('Failed', 'error');
    } finally {
      $btn.disabled = false;
      $btn.innerHTML = orig;
    }
  }

  $btn.addEventListener('click', handleCompare);
  [$urlA, $urlB].forEach(el => {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleCompare(); });
  });
})();
