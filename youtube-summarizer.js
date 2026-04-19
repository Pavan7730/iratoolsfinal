/* =========================================================
   LONG VIDEO, SHORT ANSWER — YouTube Summarizer v3
   Key fixes:
   • oEmbed called DIRECTLY (YouTube supports CORS on that endpoint)
   • Page description scraped via proxy chain (best-effort, non-fatal)
   • We ALWAYS render the embed + title — never block on failed proxy
   • No mention of any paid features
   ========================================================= */

(() => {
  'use strict';

  // For the page scrape only (oEmbed doesn't need a proxy)
  const PROXIES = [
    (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  // ---------- DOM ----------
  const $input     = document.getElementById('yt-input');
  const $btn       = document.getElementById('yt-btn');
  const $error     = document.getElementById('yt-error');
  const $loader    = document.getElementById('yt-loader');
  const $stage     = document.getElementById('yt-stage');
  const $results   = document.getElementById('yt-results');
  const $embed     = document.getElementById('yt-embed');
  const $titleEl   = document.getElementById('yt-title');
  const $channelEl = document.getElementById('yt-channel');
  const $idEl      = document.getElementById('yt-id');
  const $chapCount = document.getElementById('yt-chapters-count');
  const $watchLink = document.getElementById('yt-watch-link');
  const $summary   = document.getElementById('yt-summary');
  const $sumSource = document.getElementById('summary-source');
  const $chapWrap  = document.getElementById('chapters-wrap');
  const $chapList  = document.getElementById('chapters-list');
  const $descEl    = document.getElementById('yt-description');
  const $toast     = document.getElementById('toast');

  // ---------- Utils ----------
  const showError = (msg) => {
    $error.textContent = msg;
    $error.classList.add('show');
    setTimeout(() => $error.classList.remove('show'), 7000);
  };

  const showToast = (msg, type = '') => {
    $toast.className = 'toast show ' + type;
    $toast.textContent = msg;
    setTimeout(() => $toast.classList.remove('show'), 3500);
  };

  const setStage = (t) => { $stage.textContent = t; };

  const esc = (s) => String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  // ---------- Video ID extractor ----------
  const extractId = (raw) => {
    if (!raw) return null;
    raw = raw.trim();
    // Raw 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    // All common YouTube URL patterns
    const m = raw.match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    return m ? m[1] : null;
  };

  // ---------- oEmbed — DIRECT call (YouTube supports CORS here) ----------
  async function fetchOEmbed(id) {
    const url = `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${id}&format=json`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        if (data?.title) return data;
      }
    } catch (e) {
      console.warn('[oEmbed direct]', e.message);
    }

    // Fallback: try through a proxy (in case direct is blocked in some regions)
    for (const proxy of PROXIES) {
      try {
        const res = await fetch(proxy(url), { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') || '';
        let text = '';
        if (ct.includes('application/json')) {
          const json = await res.json();
          text = json?.contents || (typeof json === 'string' ? json : JSON.stringify(json));
        } else {
          text = await res.text();
        }
        if (!text) continue;
        // text might be the raw oEmbed JSON or proxy-wrapped
        try {
          let parsed = JSON.parse(text);
          // allorigins wraps: { contents: "...", status: {...} }
          if (parsed?.contents) parsed = JSON.parse(parsed.contents);
          if (parsed?.title) return parsed;
        } catch {}
      } catch {}
    }
    return null;
  }

  // ---------- Page scrape for description (best-effort via proxy) ----------
  async function fetchDescription(id) {
    const pageUrl = `https://www.youtube.com/watch?v=${id}`;
    for (let i = 0; i < PROXIES.length; i++) {
      try {
        setStage(`Reading description (attempt ${i+1})…`);
        const res = await fetch(PROXIES[i](pageUrl), { signal: AbortSignal.timeout(12000) });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') || '';
        let html = '';
        if (ct.includes('application/json')) {
          const json = await res.json();
          html = json?.contents || '';
        } else {
          html = await res.text();
        }
        if (html && html.length > 500) {
          const desc = extractDesc(html);
          if (desc) return desc;
        }
      } catch {}
    }
    return ''; // Non-fatal — we render with whatever we have
  }

  // ---------- Description parser ----------
  function extractDesc(html) {
    // 1. shortDescription JSON field (most complete)
    const short = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
    if (short?.[1] && short[1].length > 20) return unescapeYT(short[1]);

    // 2. og:description
    const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,})["']/i)
            || html.match(/<meta[^>]+content=["']([^"']{20,})["'][^>]+property=["']og:description["']/i);
    if (og?.[1]) return decodeHtml(og[1]);

    // 3. name="description"
    const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,})["']/i)
              || html.match(/<meta[^>]+content=["']([^"']{20,})["'][^>]+name=["']description["']/i);
    if (meta?.[1]) return decodeHtml(meta[1]);

    return '';
  }

  function unescapeYT(s) {
    return s
      .replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, '\t')
      .replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\\\/g, '\\')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  function decodeHtml(s) {
    const t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  }

  // ---------- Chapter extraction ----------
  function extractChapters(desc) {
    if (!desc) return [];
    const re = /(?:^|\n)\s*(?:\d+[\.\)]\s*)?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:|.]?\s*(.+?)(?=\n|$)/gm;
    const chapters = [], seen = new Set();
    let m;
    while ((m = re.exec(desc)) !== null) {
      const ts    = m[1].trim();
      const label = m[2].trim().replace(/^[-–—:|.\s]+/, '').replace(/\s{2,}/, ' ');
      if (!ts || !label || label.length < 2 || label.length > 130) continue;
      if (seen.has(ts)) continue;
      seen.add(ts);
      chapters.push({ timestamp: ts, seconds: toSec(ts), label });
    }
    return chapters.length >= 2 ? chapters : [];
  }

  function toSec(ts) {
    const p = ts.split(':').map(Number);
    return p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1];
  }

  // ---------- Smart summary ----------
  function buildSummary(title, description, chapters, channel) {
    const cleaned = (description || '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/#\w+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Pull meaningful sentences
    const sentences = (cleaned.match(/[^.!?\n]{25,280}[.!?]/g) || [])
      .map(s => s.trim())
      .filter(s => !/^(subscribe|follow|like|comment|share|check out|visit|link|join|click|telegram|instagram|twitter|facebook|whatsapp)/i.test(s))
      .slice(0, 3);

    // Case 1: Chapters + good description
    if (chapters.length >= 3 && sentences.length > 0) {
      const labels = chapters.slice(0, 4).map(c => c.label).join(', ');
      return `<em>${esc(title)}</em> covers ${chapters.length} chapters — including <em>${esc(labels)}</em>. ${esc(sentences[0])}`;
    }

    // Case 2: Good description, no chapters
    if (sentences.length >= 2) {
      return sentences.map(s => esc(s)).join(' ');
    }
    if (sentences.length === 1) {
      return esc(sentences[0]);
    }

    // Case 3: Only title available — smart detection
    return buildFromTitle(title, channel);
  }

  function buildFromTitle(title, channel) {
    if (!title) return 'Open the video on YouTube to watch it.';
    const by = channel ? ` by <em>${esc(channel)}</em>` : '';
    const t   = title;

    if (/attack|war|conflict|crisis|breaking|killed|crash|protest|arrest|ban|sanction|flood|earthquake|explosion/i.test(t))
      return `<em>${esc(t)}</em> is a news report${by}. The creator has not published a written description — watch on YouTube for the full story.`;

    if (/how to|tutorial|guide|step.?by.?step|explained?|learn|course|tips|tricks|beginners?/i.test(t))
      return `<em>${esc(t)}</em> is a tutorial or how-to video${by}. No written description is available — follow along on YouTube.`;

    if (/review|reaction|rating|opinion|verdict|thoughts? on|watch.?along/i.test(t))
      return `<em>${esc(t)}</em> is a review or reaction video${by}. The creator's take is in the video — no description was published.`;

    if (/interview|conversation|podcast|talks? with|speaks? to|q\s*&\s*a|ama/i.test(t))
      return `<em>${esc(t)}</em> is a conversation or interview${by}. No written description is available.`;

    if (/vlog|day in|routine|week|travel|explored?|visited?/i.test(t))
      return `<em>${esc(t)}</em> is a vlog or documentary${by}. No written description was published by the creator.`;

    return `<em>${esc(t)}</em>${by}. No description was published for this video. Use the YouTube link above to watch it directly.`;
  }

  // ---------- Render ----------
  function renderResults({ id, oembed, description, chapters }) {
    const title   = oembed?.title       || 'Untitled Video';
    const channel = oembed?.author_name || 'Unknown channel';

    $embed.src        = `https://www.youtube.com/embed/${id}?rel=0`;
    $titleEl.textContent   = title;
    $channelEl.textContent = channel;
    $idEl.textContent      = id;
    $chapCount.textContent = chapters.length;
    $watchLink.href        = `https://www.youtube.com/watch?v=${id}`;

    // Summary
    $summary.innerHTML = buildSummary(title, description, chapters, channel);

    let sourceLabel = 'Generated from title';
    if (chapters.length >= 3 && description) sourceLabel = 'Chapters + description';
    else if (description && description.length > 80) sourceLabel = 'From description';
    else if (chapters.length > 0) sourceLabel = 'From chapters';
    $sumSource.textContent = sourceLabel;

    // Chapters
    $chapList.innerHTML = '';
    if (chapters.length > 0) {
      $chapWrap.style.display = '';
      chapters.forEach(ch => {
        const div = document.createElement('div');
        div.className = 'highlight-item';
        div.innerHTML = `
          <button class="timestamp-chip" data-sec="${ch.seconds}" title="Jump to ${ch.timestamp}">${ch.timestamp}</button>
          <div class="highlight-text">${esc(ch.label)}</div>
        `;
        div.querySelector('.timestamp-chip').addEventListener('click', () => {
          $embed.src = `https://www.youtube.com/embed/${id}?start=${ch.seconds}&autoplay=1&rel=0`;
          $embed.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        $chapList.appendChild(div);
      });
    } else {
      $chapWrap.style.display = 'none';
    }

    // Description text
    if (description?.trim()) {
      $descEl.textContent = description.trim();
      $descEl.classList.remove('empty');
    } else {
      $descEl.textContent = 'No public description was found for this video.';
      $descEl.classList.add('empty');
    }

    $results.classList.add('active');
    $results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Main ----------
  async function handleSummarize() {
    const id = extractId($input.value);
    if (!id) {
      showError('Please paste a valid YouTube URL or video ID.');
      return;
    }

    $btn.disabled = true;
    const orig = $btn.innerHTML;
    $btn.innerHTML = '<span class="spinner"></span> Loading…';
    $error.classList.remove('show');
    $results.classList.remove('active');
    $loader.classList.add('active');

    try {
      // Step 1: oEmbed (direct — no proxy needed, YouTube allows CORS on this)
      setStage('Fetching video info…');
      const oembed = await fetchOEmbed(id);

      // If oEmbed completely fails, the video is likely truly private/deleted
      if (!oembed) {
        $loader.classList.remove('active');
        showError('Could not load this video. It may be private, deleted, or not a valid YouTube link.');
        showToast('Video unavailable', 'error');
        $btn.disabled = false;
        $btn.innerHTML = orig;
        return;
      }

      // Step 2: Page description (best-effort, non-blocking)
      setStage('Fetching description…');
      const description = await fetchDescription(id);

      // Step 3: Chapters
      setStage('Detecting chapters…');
      const chapters = extractChapters(description);

      setStage('Done!');
      $loader.classList.remove('active');

      // Always render — even with no description
      renderResults({ id, oembed, description, chapters });
      showToast('Done ✓', 'success');

    } catch (err) {
      console.error('[YouTube]', err);
      $loader.classList.remove('active');
      showError('Something went wrong. Please try again.');
      showToast('Error', 'error');
    } finally {
      $btn.disabled = false;
      $btn.innerHTML = orig;
    }
  }

  $btn.addEventListener('click', handleSummarize);
  $input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSummarize(); });
})();
