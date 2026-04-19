/* =========================================================
   COMPETE ORGANIC — SEO Analyzer v2
   Five CORS proxy fallbacks + HTML paste mode
   No API keys required.
   ========================================================= */

(() => {
  'use strict';

  // ---------- CORS Proxy chain — tries all in order ----------
  const PROXIES = [
    (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
    (url) => `https://yacdn.org/serve/${url}`,
  ];

  const GOOGLE_FACTS = [
    { text: "Google processes over <em>8.5 billion</em> searches every day — that's roughly <em>99,000 searches</em> per second.", source: "Internet Live Stats, 2024" },
    { text: "Around <em>15%</em> of all Google searches each day have <em>never been searched before</em> in Google's history.", source: "Google, Think with Google" },
    { text: "Google updates its algorithm an estimated <em>500–600 times</em> every year — more than once a day on average.", source: "Moz, Google Algorithm Change History" },
    { text: "The #1 result on Google captures roughly <em>27.6%</em> of all clicks, while position #10 gets under <em>2.4%</em>.", source: "Backlinko CTR Study" },
    { text: "The average first-page result contains <em>1,447 words</em> — depth still wins over thin content.", source: "Backlinko, 1.9M search results studied" },
    { text: "Google's <em>PageRank</em> algorithm was named after co-founder Larry <em>Page</em>, not after web pages.", source: "Stanford Digital Library, 1998" },
    { text: "<em>93%</em> of online experiences begin with a search engine. Google holds roughly <em>91%</em> of that market.", source: "BrightEdge Research, Statcounter" },
    { text: "Google's <em>BERT</em> update (2019) improved understanding of about <em>1 in 10</em> English queries using NLP.", source: "Google AI Blog, 2019" },
    { text: "Pages loading in <em>1 second</em> have a <em>3× higher</em> conversion rate than pages taking 5 seconds.", source: "Portent Page Speed Report, 2022" },
    { text: "Featured snippets steal around <em>35.1%</em> of all clicks when they appear at position zero.", source: "Ahrefs SERP Study" },
    { text: "Google moved to <em>mobile-first indexing</em> for all new websites in July <em>2019</em>.", source: "Google Search Central" },
    { text: "<em>E-E-A-T</em> (Experience, Expertise, Authoritativeness, Trust) — the first 'E' for Experience was added in <em>December 2022</em>.", source: "Google Quality Rater Guidelines" },
    { text: "<em>RankBrain</em>, Google's ML-based signal, is reportedly the <em>3rd most important</em> factor out of 200+.", source: "Google via Bloomberg, 2015" },
    { text: "Schema markup can increase click-through rates by up to <em>30%</em>, yet only <em>33%</em> of websites use any.", source: "Search Engine Journal" },
    { text: "Google's <em>Core Web Vitals</em> (LCP, INP, CLS) became official ranking factors in <em>June 2021</em>.", source: "Google Search Central" },
    { text: "Long-tail keywords account for around <em>70%</em> of all web search traffic despite low individual volume.", source: "Ahrefs, Moz" },
    { text: "Google's index holds over <em>100 million gigabytes</em> of data, yet returns results in under <em>0.5 seconds</em>.", source: "Google, How Search Works" },
    { text: "A high bounce-back rate to SERP is one of Google's strongest <em>negative</em> engagement signals.", source: "Google patents on SERP interaction" },
    { text: "Pages with at least one video are <em>53×</em> more likely to rank on the first page of Google.", source: "Forrester Research" },
    { text: "Only <em>0.63%</em> of Google users click through to the second page of search results.", source: "Backlinko" },
  ];

  // ---------- DOM ----------
  const $input    = document.getElementById('url-input');
  const $btn      = document.getElementById('analyze-btn');
  const $error    = document.getElementById('error-msg');
  const $loader   = document.getElementById('loader');
  const $stageText= document.getElementById('stage-text');
  const $results  = document.getElementById('results');
  const $toast    = document.getElementById('toast');
  const $factCycle= document.getElementById('fact-cycle');

  let currentFactIndex = 0;

  // ---------- Utils ----------
  const normalizeUrl = (raw) => {
    raw = (raw || '').trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    try { return new URL(raw).href; } catch { return null; }
  };

  const showError = (msg) => {
    $error.innerHTML = msg;
    $error.classList.add('show');
    setTimeout(() => $error.classList.remove('show'), 8000);
  };

  const showToast = (msg, type = '') => {
    $toast.className = 'toast show ' + type;
    $toast.textContent = msg;
    setTimeout(() => $toast.classList.remove('show'), 3500);
  };

  const setStage = (t) => { $stageText.textContent = t; };

  // ---------- Fetch with proxy chain ----------
  async function fetchPage(url) {
    const errors = [];

    for (let i = 0; i < PROXIES.length; i++) {
      const proxyUrl = PROXIES[i](url);
      try {
        setStage(`Trying proxy ${i + 1}/${PROXIES.length}…`);
        const res = await fetch(proxyUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json, text/html, */*' },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) { errors.push(`Proxy ${i+1}: HTTP ${res.status}`); continue; }

        const ct = res.headers.get('content-type') || '';
        let html = '';
        let resHeaders = {};

        if (ct.includes('application/json')) {
          const data = await res.json();
          // allorigins format
          if (data && data.contents) {
            html = data.contents;
            resHeaders = (data.status && data.status.http_headers) || {};
          } else if (typeof data === 'string') {
            html = data;
          } else {
            // codetabs returns raw text in body — try text()
            errors.push(`Proxy ${i+1}: unexpected JSON format`);
            continue;
          }
        } else {
          html = await res.text();
        }

        if (!html || html.trim().length < 200) {
          errors.push(`Proxy ${i+1}: response too short (${html.length} chars)`);
          continue;
        }

        const elapsed = performance.now();
        return { html, headers: resHeaders, proxyIndex: i };

      } catch (e) {
        errors.push(`Proxy ${i+1}: ${e.message || 'network error'}`);
      }
    }

    // All proxies failed
    throw new Error(`All ${PROXIES.length} proxies failed. Details: ${errors.join(' | ')}`);
  }

  // ---------- HTML Analyzer ----------
  function analyzeHTML(html, url, headers) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Title
    const titleEl  = doc.querySelector('title');
    const ogTitle  = doc.querySelector('meta[property="og:title"]');
    const title = (titleEl?.textContent?.trim()) || (ogTitle?.getAttribute('content')?.trim()) || '';

    // Description
    const descMeta = doc.querySelector('meta[name="description"], meta[name="Description"]');
    const ogDesc   = doc.querySelector('meta[property="og:description"]');
    const description = (descMeta?.getAttribute('content')?.trim()) || (ogDesc?.getAttribute('content')?.trim()) || '';

    // Canonical
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';

    // Last modified — check multiple sources
    const modSources = [
      doc.querySelector('meta[http-equiv="last-modified"]')?.getAttribute('content'),
      doc.querySelector('meta[property="article:modified_time"]')?.getAttribute('content'),
      doc.querySelector('meta[property="og:updated_time"]')?.getAttribute('content'),
      doc.querySelector('meta[name="last-modified"]')?.getAttribute('content'),
      doc.querySelector('meta[name="date"]')?.getAttribute('content'),
      doc.querySelector('time[datetime]')?.getAttribute('datetime'),
      headers['last-modified'],
      headers['Last-Modified'],
    ].filter(Boolean);
    const lastModified = modSources[0] || null;

    // Word count — clone body, remove nav/footer/script/style
    const bodyClone = doc.body?.cloneNode(true) || document.createElement('div');
    bodyClone.querySelectorAll('script, style, noscript, nav, footer, header, aside, svg').forEach(n => n.remove());
    const bodyText = (bodyClone.textContent || '').replace(/\s+/g, ' ').trim();
    const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;

    // Headings
    const h1Count = doc.querySelectorAll('h1').length;
    const h2Count = doc.querySelectorAll('h2').length;
    const h3Count = doc.querySelectorAll('h3').length;

    // Schema markup
    const schemas = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        const raw = s.textContent.trim();
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed
                    : parsed['@graph'] ? parsed['@graph']
                    : [parsed];
        items.forEach(item => {
          if (item?.['@type']) {
            const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
            types.forEach(t => schemas.push(t));
          }
        });
      } catch {}
    });
    doc.querySelectorAll('[itemtype]').forEach(el => {
      const m = el.getAttribute('itemtype')?.match(/schema\.org\/(\w+)/);
      if (m) schemas.push(m[1] + ' (microdata)');
    });

    // Resources
    const cssCount  = doc.querySelectorAll('link[rel="stylesheet"]').length;
    const jsCount   = doc.querySelectorAll('script[src]').length;
    const imgEls    = doc.querySelectorAll('img');
    const imgCount  = imgEls.length;
    const linkCount = doc.querySelectorAll('a[href]').length;

    // Alt text
    let altPresent = 0;
    imgEls.forEach(img => {
      const alt = img.getAttribute('alt');
      if (alt !== null && alt.trim().length > 0) altPresent++;
    });
    const altRatio = imgCount ? Math.round((altPresent / imgCount) * 100) : 100;

    return {
      url, title, description, canonical, lastModified, wordCount,
      schemas: [...new Set(schemas)],
      h1Count, h2Count, h3Count,
      cssCount, jsCount, imgCount, linkCount,
      altPresent, altRatio,
      htmlSize: html.length,
    };
  }

  // ---------- Speed estimator ----------
  function calcSpeedScore(data, fetchMs) {
    let score = 100;
    const flags = [];
    if (fetchMs > 3000)      { score -= 25; flags.push('Slow response time'); }
    else if (fetchMs > 1500) { score -= 12; flags.push('Moderate server delay'); }
    const kb = data.htmlSize / 1024;
    if (kb > 500)            { score -= 15; flags.push('Large HTML document'); }
    else if (kb > 200)       { score -= 6; }
    if (data.cssCount > 8)   { score -= 8;  flags.push('Many CSS files'); }
    if (data.jsCount > 15)   { score -= 15; flags.push('Heavy JavaScript payload'); }
    else if (data.jsCount > 8) { score -= 6; }
    if (data.imgCount > 80)  { score -= 10; flags.push('Many images'); }
    return { score: Math.max(0, Math.min(100, Math.round(score))), flags, sizeKb: kb.toFixed(1), fetchMs: Math.round(fetchMs) };
  }

  // ---------- Badge helpers ----------
  const badge = (cls, label) => ({ cls, label });
  const titleBadge = (l) => {
    if (!l)              return badge('badge-bad',  'Missing');
    if (l < 30)          return badge('badge-warn', 'Too short');
    if (l >= 50 && l <= 60) return badge('badge-good', 'Optimal');
    if (l > 60 && l <= 70)  return badge('badge-warn', 'A bit long');
    if (l > 70)          return badge('badge-bad',  'Too long');
    return badge('badge-warn', 'Short');
  };
  const descBadge = (l) => {
    if (!l)                 return badge('badge-bad',  'Missing');
    if (l < 70)             return badge('badge-warn', 'Too short');
    if (l >= 120 && l <= 160) return badge('badge-good', 'Optimal');
    if (l > 160 && l <= 180)  return badge('badge-warn', 'A bit long');
    if (l > 180)            return badge('badge-bad',  'Too long');
    return badge('badge-warn', 'Short');
  };
  const wcBadge  = (w) => w < 300 ? badge('badge-bad','Thin') : w < 800 ? badge('badge-warn','Light') : badge('badge-good','Healthy');
  const altBadge = (r) => r >= 90 ? badge('badge-good','Excellent') : r >= 70 ? badge('badge-warn','Fair') : badge('badge-bad','Needs work');
  const speedBadge = (s) => s >= 90 ? badge('badge-good','Excellent') : s >= 70 ? badge('badge-warn','Good') : s >= 50 ? badge('badge-warn','Needs work') : badge('badge-bad','Poor');

  // ---------- Render ----------
  function renderResults(data, speed) {
    const $ = (id) => document.getElementById(id);

    $('result-url').textContent = data.url;
    $('result-timestamp').textContent = `Scanned · ${new Date().toLocaleString()}`;

    // Title
    const tLen = data.title.length;
    $('title-value').textContent = data.title || '— not found —';
    $('title-sub').textContent = tLen ? `${tLen} characters` : 'No <title> tag found';
    const tb = titleBadge(tLen);
    const $tb = $('title-badge');
    $tb.className = 'metric-badge ' + tb.cls;
    $tb.textContent = `${tLen}ch · ${tb.label}`;

    // Description
    const dLen = data.description.length;
    $('desc-value').textContent = data.description || '— not found —';
    $('desc-sub').textContent = dLen ? `${dLen} characters` : 'No meta description found';
    const db = descBadge(dLen);
    const $db = $('desc-badge');
    $db.className = 'metric-badge ' + db.cls;
    $db.textContent = `${dLen}ch · ${db.label}`;

    // Word count
    $('wc-value').textContent = data.wordCount.toLocaleString();
    const wb = wcBadge(data.wordCount);
    const $wb = $('wc-badge');
    $wb.className = 'metric-badge ' + wb.cls;
    $wb.textContent = wb.label;
    $('wc-sub').textContent = 'Visible body text (scripts, nav, footer excluded)';

    // Last updated
    let luText = '— not specified —';
    let luSub  = 'No date metadata found on this page';
    if (data.lastModified) {
      const d = new Date(data.lastModified);
      if (!isNaN(d)) {
        luText = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        const daysAgo = Math.floor((Date.now() - d) / 86400000);
        luSub = daysAgo >= 0 ? `${daysAgo.toLocaleString()} days ago` : 'Future-dated';
      } else {
        luText = data.lastModified;
        luSub = 'As reported by page metadata';
      }
    }
    $('updated-value').textContent = luText;
    $('updated-sub').textContent = luSub;

    // Headings
    $('h1-count').textContent = data.h1Count;
    $('h2-count').textContent = data.h2Count;
    $('h3-count').textContent = data.h3Count;
    let hSub = 'Good heading structure';
    if (data.h1Count === 0)     hSub = '⚠ No H1 found — every page should have exactly one';
    else if (data.h1Count > 1)  hSub = `⚠ ${data.h1Count} H1 tags — aim for exactly one`;
    else if (data.h2Count === 0 && data.wordCount > 400) hSub = 'Consider adding H2 sub-headings';
    $('heading-sub').textContent = hSub;

    // Schema
    const $sList = $('schema-list');
    $sList.innerHTML = '';
    if (data.schemas.length === 0) {
      $sList.innerHTML = '<span class="schema-pill none">No structured data detected</span>';
      const $sb = $('schema-badge');
      $sb.className = 'metric-badge badge-bad';
      $sb.textContent = 'None found';
    } else {
      data.schemas.forEach(s => {
        const p = document.createElement('span');
        p.className = 'schema-pill';
        p.textContent = s;
        $sList.appendChild(p);
      });
      const $sb = $('schema-badge');
      $sb.className = 'metric-badge badge-good';
      $sb.textContent = `${data.schemas.length} type${data.schemas.length > 1 ? 's' : ''}`;
    }

    // Resources
    $('css-count').textContent  = data.cssCount;
    $('js-count').textContent   = data.jsCount;
    $('img-count').textContent  = data.imgCount;
    $('link-count').textContent = data.linkCount;

    // Alt text
    $('alt-ratio').textContent   = `${data.altPresent} / ${data.imgCount}`;
    $('alt-percent').textContent = `(${data.altRatio}%)`;
    const ab = altBadge(data.altRatio);
    const $ab = $('alt-badge');
    $ab.className = 'metric-badge ' + ab.cls;
    $ab.textContent = ab.label;
    $('alt-sub').textContent = data.imgCount === 0
      ? 'No images found on this page'
      : `${data.altPresent} of ${data.imgCount} images have descriptive alt text`;

    // Speed gauge
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (speed.score / 100) * circumference;
    const fillEl = $('gauge-fill');
    let color = '#059669';
    if (speed.score < 70) color = '#D97706';
    if (speed.score < 50) color = '#E11D48';
    fillEl.style.stroke = color;
    setTimeout(() => { fillEl.style.strokeDashoffset = offset; }, 60);

    const labelEl = $('gauge-label');
    let cur = 0;
    const step = () => {
      if (cur < speed.score) {
        cur = Math.min(speed.score, cur + Math.ceil(speed.score / 28));
        labelEl.textContent = cur;
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);

    const sb = speedBadge(speed.score);
    const $spb = $('speed-badge');
    $spb.className = 'metric-badge ' + sb.cls;
    $spb.textContent = sb.label;
    $('speed-desc').textContent = speed.flags.length
      ? 'Flags: ' + speed.flags.join(', ') + '.'
      : 'No major issues detected in the HTML.';
    $('speed-details').innerHTML = `
      <div>Proxy TTFB:<br><strong>${speed.fetchMs} ms</strong></div>
      <div>HTML size:<br><strong>${speed.sizeKb} KB</strong></div>
    `;

    $results.classList.add('active');
    $results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    renderFact();
  }

  // ---------- Facts ----------
  function renderFact() {
    const fact = GOOGLE_FACTS[currentFactIndex];
    const $t = document.getElementById('fact-text');
    const $s = document.getElementById('fact-source');
    $t.style.opacity = '0'; $s.style.opacity = '0';
    setTimeout(() => {
      $t.innerHTML = fact.text;
      $s.textContent = '— ' + fact.source;
      $t.style.transition = 'opacity .35s'; $s.style.transition = 'opacity .35s';
      $t.style.opacity = '1'; $s.style.opacity = '1';
    }, 150);
  }

  $factCycle.addEventListener('click', () => {
    currentFactIndex = (currentFactIndex + 1) % GOOGLE_FACTS.length;
    renderFact();
  });

  // ---------- Main ----------
  async function handleAnalyze() {
    const url = normalizeUrl($input.value);
    if (!url) {
      showError('Please enter a valid URL, e.g. <strong>https://example.com</strong>');
      return;
    }

    $btn.disabled = true;
    const orig = $btn.innerHTML;
    $btn.innerHTML = '<span class="spinner"></span> Analyzing…';
    $error.classList.remove('show');
    $results.classList.remove('active');
    $loader.classList.add('active');

    const startTime = performance.now();

    try {
      const { html, headers } = await fetchPage(url);
      const fetchMs = performance.now() - startTime;

      setStage('Parsing HTML…');
      await new Promise(r => setTimeout(r, 120));
      const data = analyzeHTML(html, url, headers);

      setStage('Calculating scores…');
      await new Promise(r => setTimeout(r, 180));
      const speed = calcSpeedScore(data, fetchMs);

      $loader.classList.remove('active');
      renderResults(data, speed);
      showToast('Analysis complete', 'success');

    } catch (err) {
      console.error('[SEO]', err);
      $loader.classList.remove('active');
      showError(
        `<strong>Could not fetch this URL.</strong><br>` +
        `All CORS proxies were blocked. This usually happens with:<br>` +
        `• Sites that block external requests (Google, Facebook, etc.)<br>` +
        `• Sites requiring login or CAPTCHA<br><br>` +
        `Try a public blog, Wikipedia page, or your own website.`
      );
      showToast('Fetch failed — try another URL', 'error');
    } finally {
      $btn.disabled = false;
      $btn.innerHTML = orig;
    }
  }

  $btn.addEventListener('click', handleAnalyze);
  $input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAnalyze(); });

  // Init fact
  document.getElementById('fact-text').innerHTML = GOOGLE_FACTS[0].text;
  document.getElementById('fact-source').textContent = '— ' + GOOGLE_FACTS[0].source;
})();
