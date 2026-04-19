/* =========================================================
   HEAD TO HEAD — YouTube Compare Tool
   Data sources (no API key needed):
   • oEmbed endpoint (CORS-enabled, direct)
   • YouTube page scrape via proxy (viewCount, duration, date, likes)
   ========================================================= */

(() => {
  'use strict';

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

  // ---------- Utils ----------
  const showError = (m) => { $err.textContent = m; $err.classList.add('show'); setTimeout(() => $err.classList.remove('show'), 8000); };
  const toast     = (m, t='') => { $toast.className='toast show '+t; $toast.textContent=m; setTimeout(()=>$toast.classList.remove('show'),3000); };
  const stage     = (t) => { $ltxt.textContent = t; };

  const extractId = (raw) => {
    if (!raw) return null;
    raw = raw.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    const m = raw.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  };

  const fmt = (n) => {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
    if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  };

  const fmtDur = (secs) => {
    if (!secs || isNaN(secs)) return '—';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
    } catch { return iso; }
  };

  const daysSince = (iso) => {
    if (!iso) return null;
    try {
      const diff = Date.now() - new Date(iso).getTime();
      return Math.max(1, Math.floor(diff / 86400000));
    } catch { return null; }
  };

  // ---------- oEmbed (direct — CORS allowed) ----------
  async function getOEmbed(id) {
    const url = `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${id}&format=json`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const d = await r.json();
        if (d?.title) return d;
      }
    } catch {}
    // Proxy fallback
    for (const p of PROXIES) {
      try {
        const r = await fetch(p(url), { signal: AbortSignal.timeout(8000) });
        if (!r.ok) continue;
        const ct = r.headers.get('content-type') || '';
        let txt = ct.includes('application/json')
          ? ((d) => d?.contents || JSON.stringify(d))(await r.json())
          : await r.text();
        let parsed = JSON.parse(txt);
        if (parsed?.contents) parsed = JSON.parse(parsed.contents);
        if (parsed?.title) return parsed;
      } catch {}
    }
    return null;
  }

  // ---------- Page scrape for rich data ----------
  async function scrapeVideo(id) {
    const pageUrl = `https://www.youtube.com/watch?v=${id}`;
    for (const p of PROXIES) {
      try {
        const r = await fetch(p(pageUrl), { signal: AbortSignal.timeout(14000) });
        if (!r.ok) continue;
        const ct = r.headers.get('content-type') || '';
        let html = ct.includes('application/json')
          ? ((d) => d?.contents || '')(await r.json())
          : await r.text();
        if (html && html.length > 500) {
          const data = parsePageData(html);
          if (data.viewCount || data.lengthSeconds) return data;
        }
      } catch {}
    }
    return {};
  }

  function parsePageData(html) {
    const result = {};

    // --- viewCount ---
    const vcMatch = html.match(/"viewCount":\s*"?(\d+)"?/);
    if (vcMatch) result.viewCount = parseInt(vcMatch[1], 10);

    // --- lengthSeconds ---
    const lsMatch = html.match(/"lengthSeconds":\s*"?(\d+)"?/);
    if (lsMatch) result.lengthSeconds = parseInt(lsMatch[1], 10);

    // --- publishDate / uploadDate ---
    const pdMatch = html.match(/"publishDate":\s*"([^"]+)"/)
                 || html.match(/"uploadDate":\s*"([^"]+)"/);
    if (pdMatch) result.publishDate = pdMatch[1];

    // --- dateText (approx upload from microformat) ---
    const dtMatch = html.match(/"dateText":\s*\{"simpleText":\s*"([^"]+)"\}/);
    if (dtMatch && !result.publishDate) result.publishDate = dtMatch[1];

    // --- likeCount (sometimes exposed) ---
    const lcMatch = html.match(/"likeCount":\s*"?(\d+)"?/)
                 || html.match(/"defaultText":\s*\{"accessibility".*?"(\d[\d,]+)"\s*}/);
    if (lcMatch) result.likeCount = parseInt(lcMatch[1].replace(/,/g, ''), 10);

    // --- commentCount ---
    const ccMatch = html.match(/"commentCount":\s*"?(\d+)"?/);
    if (ccMatch) result.commentCount = parseInt(ccMatch[1], 10);

    // --- keywords/tags count ---
    const kwMatch = html.match(/"keywords":\s*(\[[^\]]*\])/);
    if (kwMatch) {
      try { result.keywordCount = JSON.parse(kwMatch[1]).length; } catch {}
    }

    // --- description length ---
    const sdMatch = html.match(/"shortDescription":\s*"((?:\\.|[^"\\])*)"/);
    if (sdMatch) {
      const desc = sdMatch[1]
        .replace(/\\n/g,'\n').replace(/\\"/g,'"').replace(/\\\\/g,'\\');
      result.descriptionLength = desc.length;
      result.descriptionText   = desc;
    }

    // --- chapters count ---
    if (result.descriptionText) {
      const chRe = /(?:^|\n)\s*\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?/gm;
      const matches = result.descriptionText.match(chRe) || [];
      result.chaptersCount = matches.length >= 2 ? matches.length : 0;
    }

    // --- title from page ---
    const tMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (tMatch) result.pageTitle = tMatch[1].replace(/ - YouTube$/, '').trim();

    return result;
  }

  // ---------- Fetch all data for one video ----------
  async function fetchVideo(id, label) {
    stage(`Fetching ${label} via oEmbed…`);
    const oembed = await getOEmbed(id);
    if (!oembed) throw new Error(`Could not load "${label}". The video may be private or the link invalid.`);

    stage(`Scraping ${label} page…`);
    const page = await scrapeVideo(id);

    return { id, oembed, page };
  }

  // ---------- Build metric row ----------
  function makeRow({ name, valA, valB, fmtA, fmtB, higherWins, unit = '' }) {
    // Determine winner
    let winner = 'tie';
    if (valA != null && valB != null && !isNaN(valA) && !isNaN(valB)) {
      const margin = Math.abs(valA - valB) / (Math.max(valA, valB) || 1);
      if (margin < 0.03) winner = 'tie'; // within 3% = tie
      else if (higherWins) winner = valA > valB ? 'a' : 'b';
      else                 winner = valA < valB ? 'a' : 'b'; // lowerWins
    } else if (valA != null && valB == null) winner = 'a';
    else if (valB != null && valA == null) winner = 'b';

    const pctA = (valA != null && valB != null && (valA + valB) > 0)
      ? Math.round((valA / (valA + valB)) * 100) : 50;
    const pctB = 100 - pctA;

    const displayA = fmtA || (valA != null ? fmt(valA) + (unit ? ' '+unit : '') : '—');
    const displayB = fmtB || (valB != null ? fmt(valB) + (unit ? ' '+unit : '') : '—');

    const winTagA = winner === 'a' ? '<span class="win-tag win-sky">▲ Wins</span>' : winner === 'tie' ? '<span class="win-tag win-tie">≈ Tie</span>' : '';
    const winTagB = winner === 'b' ? '<span class="win-tag win-rose">▲ Wins</span>' : winner === 'tie' ? '<span class="win-tag win-tie">≈ Tie</span>' : '';

    const barClsA = winner === 'a' ? 'bar-sky' : winner === 'tie' ? 'bar-tie' : 'bar-sky';
    const barClsB = winner === 'b' ? 'bar-rose' : winner === 'tie' ? 'bar-tie' : 'bar-rose';

    return {
      html: `
        <div class="compare-row">
          <div class="compare-side">
            <div class="compare-value">${displayA}</div>
            <div class="compare-bar-wrap">
              <div class="compare-bar ${barClsA}" style="width:0%" data-w="${pctA}"></div>
            </div>
            ${winTagA}
          </div>
          <div class="metric-name">${name}</div>
          <div class="compare-side right">
            <div class="compare-value">${displayB}</div>
            <div class="compare-bar-wrap">
              <div class="compare-bar ${barClsB}" style="width:0%" data-w="${pctB}"></div>
            </div>
            ${winTagB}
          </div>
        </div>
      `,
      winner,
    };
  }

  // ---------- Render all ----------
  function render(a, b) {
    const $ = (id) => document.getElementById(id);

    // --- Video cards ---
    $('thumb-a').src = `https://i.ytimg.com/vi/${a.id}/hqdefault.jpg`;
    $('thumb-b').src = `https://i.ytimg.com/vi/${b.id}/hqdefault.jpg`;

    const titleA = a.oembed.title || a.page.pageTitle || 'Untitled';
    const titleB = b.oembed.title || b.page.pageTitle || 'Untitled';

    $('vtitle-a').textContent  = titleA;
    $('vtitle-b').textContent  = titleB;
    $('channel-a').textContent = a.oembed.author_name || '—';
    $('channel-b').textContent = b.oembed.author_name || '—';

    const daysA    = daysSince(a.page.publishDate);
    const daysB    = daysSince(b.page.publishDate);
    const dailyA   = (a.page.viewCount && daysA) ? Math.round(a.page.viewCount / daysA) : null;
    const dailyB   = (b.page.viewCount && daysB) ? Math.round(b.page.viewCount / daysB) : null;

    $('views-a').textContent = fmt(a.page.viewCount);
    $('views-b').textContent = fmt(b.page.viewCount);
    $('daily-a').textContent = dailyA ? fmt(dailyA) + '/day' : '—';
    $('daily-b').textContent = dailyB ? fmt(dailyB) + '/day' : '—';
    $('dur-a').textContent   = fmtDur(a.page.lengthSeconds);
    $('dur-b').textContent   = fmtDur(b.page.lengthSeconds);
    $('pub-a').textContent   = fmtDate(a.page.publishDate);
    $('pub-b').textContent   = fmtDate(b.page.publishDate);

    // --- Metrics ---
    const metrics = [
      makeRow({ name: 'Total Views',       valA: a.page.viewCount,      valB: b.page.viewCount,      higherWins: true }),
      makeRow({ name: 'Daily Avg Views',   valA: dailyA,                valB: dailyB,                higherWins: true }),
      makeRow({ name: 'Video Duration',    valA: a.page.lengthSeconds,  valB: b.page.lengthSeconds,  higherWins: false, fmtA: fmtDur(a.page.lengthSeconds), fmtB: fmtDur(b.page.lengthSeconds) }),
      makeRow({ name: 'Likes',             valA: a.page.likeCount,      valB: b.page.likeCount,      higherWins: true }),
      makeRow({ name: 'Comments',          valA: a.page.commentCount,   valB: b.page.commentCount,   higherWins: true }),
      makeRow({ name: 'Video Age (days)',  valA: daysA,                 valB: daysB,                 higherWins: false, fmtA: daysA ? daysA.toLocaleString() + 'd' : '—', fmtB: daysB ? daysB.toLocaleString() + 'd' : '—' }),
      makeRow({ name: 'Tags / Keywords',   valA: a.page.keywordCount,   valB: b.page.keywordCount,   higherWins: true }),
      makeRow({ name: 'Description Depth', valA: a.page.descriptionLength, valB: b.page.descriptionLength, higherWins: true, fmtA: a.page.descriptionLength ? a.page.descriptionLength + ' chars' : '—', fmtB: b.page.descriptionLength ? b.page.descriptionLength + ' chars' : '—' }),
      makeRow({ name: 'Chapters',          valA: a.page.chaptersCount || 0, valB: b.page.chaptersCount || 0, higherWins: true }),
      makeRow({ name: 'Title Length',      valA: titleA.length,         valB: titleB.length,         higherWins: false, fmtA: titleA.length + ' chars', fmtB: titleB.length + ' chars' }),
    ];

    // Only include rows where at least one side has data
    const visibleMetrics = metrics.filter(m => {
      const row = document.createElement('div');
      row.innerHTML = m.html;
      const vals = row.querySelectorAll('.compare-value');
      return !([...vals].every(v => v.textContent.trim() === '—'));
    });

    $('compare-table').innerHTML = visibleMetrics.map(m => m.html).join('');

    // Animate bars after paint
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.querySelectorAll('.compare-bar[data-w]').forEach(bar => {
          bar.style.width = bar.dataset.w + '%';
        });
      }, 100);
    });

    // --- Tally wins ---
    let winsA = 0, winsB = 0, ties = 0;
    visibleMetrics.forEach(m => {
      if (m.winner === 'a') winsA++;
      else if (m.winner === 'b') winsB++;
      else ties++;
    });

    $('wins-a').textContent = winsA;
    $('wins-b').textContent = winsB;
    $('wins-tie').textContent = `${ties} tie${ties !== 1 ? 's' : ''}`;

    // --- Verdict ---
    const totalDecisive = winsA + winsB;
    let verdictTitle, verdictDesc, trophy;

    if (winsA === winsB) {
      trophy = '🤝';
      verdictTitle = `It's a <em>draw.</em>`;
      verdictDesc  = `Both videos are evenly matched across ${visibleMetrics.length} metrics. The gap is so tight that content quality and audience targeting will decide the real winner.`;
    } else if (winsA > winsB) {
      const margin = totalDecisive > 0 ? Math.round((winsA / totalDecisive) * 100) : 0;
      trophy = '🏆';
      $('card-a').classList.add('winner-card');
      verdictTitle = `<em>Your video</em> is ahead.`;
      verdictDesc  = `Winning ${winsA} of ${visibleMetrics.length} measured metrics (${margin}% dominance). ${
        dailyA && dailyB && dailyA > dailyB
          ? `Particularly strong on daily average views — ${fmt(dailyA - dailyB)} more views per day.`
          : winsA >= 6
            ? 'A clear lead across multiple dimensions. Keep publishing with this format.'
            : 'Ahead, but the competitor is close on some metrics. Focus on the ones you lost.'
      }`;
    } else {
      const margin = totalDecisive > 0 ? Math.round((winsB / totalDecisive) * 100) : 0;
      trophy = '📊';
      $('card-b').classList.add('winner-card');
      verdictTitle = `Competitor leads on <em>${winsB} metrics.</em>`;
      verdictDesc  = `They're winning ${margin}% of the measurable categories. ${
        dailyB && dailyA && dailyB > dailyA
          ? `Their daily average is ${fmt(dailyB - dailyA)} views/day higher — a strong ongoing velocity gap.`
          : 'Study their title structure, description depth, and chapter organisation. Those are often the easiest gaps to close.'
      }`;
    }

    $('trophy').textContent    = trophy;
    $('verdict-title').innerHTML = verdictTitle;
    $('verdict-desc').textContent = verdictDesc;

    $res.classList.add('active');
    $res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Comparison ready ✓', 'success');
  }

  // ---------- Main ----------
  async function handleCompare() {
    const idA = extractId($urlA.value);
    const idB = extractId($urlB.value);

    if (!idA && !idB) { showError('Please paste both YouTube URLs.'); return; }
    if (!idA) { showError('Your Video URL is invalid.'); return; }
    if (!idB) { showError('Competitor URL is invalid.'); return; }
    if (idA === idB) { showError('Both URLs point to the same video — enter two different videos.'); return; }

    $btn.disabled = true;
    const orig = $btn.innerHTML;
    $btn.innerHTML = '<span class="spinner"></span> Comparing…';
    $err.classList.remove('show');
    $res.classList.remove('active');
    $load.classList.add('active');

    // Reset winner borders
    document.getElementById('card-a').classList.remove('winner-card');
    document.getElementById('card-b').classList.remove('winner-card');

    try {
      // Fetch both videos in parallel
      const [a, b] = await Promise.all([
        fetchVideo(idA, 'Your Video'),
        fetchVideo(idB, 'Competitor'),
      ]);

      $load.classList.remove('active');
      render(a, b);
    } catch (err) {
      console.error('[Compare]', err);
      $load.classList.remove('active');
      showError(err.message || 'Something went wrong. Please try again.');
      toast('Failed', 'error');
    } finally {
      $btn.disabled = false;
      $btn.innerHTML = orig;
    }
  }

  $btn.addEventListener('click', handleCompare);
  [$urlA, $urlB].forEach($el => {
    $el.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleCompare(); });
  });
})();
