/* =========================================================
   LONG VIDEO, SHORT ANSWER — YouTube Summarizer v2
   Extracts metadata, chapters, description.
   Falls back to a smart title-based summary when description
   is unavailable. NO mention of Ira AI Pro.
   ========================================================= */

(() => {
  'use strict';

  const PROXIES = [
    (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];

  // ---------- DOM ----------
  const $input   = document.getElementById('yt-input');
  const $btn     = document.getElementById('yt-btn');
  const $error   = document.getElementById('yt-error');
  const $loader  = document.getElementById('yt-loader');
  const $stage   = document.getElementById('yt-stage');
  const $results = document.getElementById('yt-results');
  const $embed   = document.getElementById('yt-embed');
  const $title   = document.getElementById('yt-title');
  const $channel = document.getElementById('yt-channel');
  const $idEl    = document.getElementById('yt-id');
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

  // ---------- ID extraction ----------
  const extractId = (raw) => {
    if (!raw) return null;
    raw = raw.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    const m = raw.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  };

  // ---------- Proxy fetch ----------
  async function proxyFetch(url) {
    for (let i = 0; i < PROXIES.length; i++) {
      try {
        setStage(`Fetching via proxy ${i+1}…`);
        const res = await fetch(PROXIES[i](url), {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = await res.json();
          if (data?.contents) return data.contents;
          if (typeof data === 'string') return data;
        }
        const text = await res.text();
        if (text && text.length > 200) return text;
      } catch {}
    }
    return null;
  }

  // ---------- oEmbed (title + channel) ----------
  async function fetchOEmbed(id) {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
    try {
      const raw = await proxyFetch(url);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data?.title) return data;
    } catch {}
    return null;
  }

  // ---------- YouTube page scrape ----------
  async function fetchYtPage(id) {
    return proxyFetch(`https://www.youtube.com/watch?v=${id}`);
  }

  // ---------- Extract description from page HTML ----------
  function extractDesc(html) {
    if (!html) return '';

    // 1. shortDescription JSON field (most reliable)
    const short = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
    if (short?.[1]) return unescape(short[1]);

    // 2. og:description meta
    const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{10,})["']/i);
    if (og?.[1]) return decodeHtml(og[1]);

    // 3. name="description"
    const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,})["']/i);
    if (meta?.[1]) return decodeHtml(meta[1]);

    return '';
  }

  function unescape(s) {
    return s
      .replace(/\\n/g,'\n').replace(/\\r/g,'').replace(/\\t/g,'\t')
      .replace(/\\"/g,'"').replace(/\\\//g,'/').replace(/\\\\/g,'\\')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_,h) => String.fromCharCode(parseInt(h,16)));
  }

  function decodeHtml(s) {
    const t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  }

  // ---------- Chapter extraction ----------
  function extractChapters(desc) {
    if (!desc) return [];
    const re = /(?:^|\n)\s*(?:\d+[\.\)]?\s*)?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:|.]?\s*(.+?)(?=\n|$)/gm;
    const chapters = [], seen = new Set();
    let m;
    while ((m = re.exec(desc)) !== null) {
      const ts = m[1].trim();
      const label = m[2].trim().replace(/^[-–—:|.\s]+/, '').replace(/\s{2,}/g,' ');
      if (!ts || !label || label.length < 2 || label.length > 120) continue;
      if (seen.has(ts)) continue;
      seen.add(ts);
      chapters.push({ timestamp: ts, seconds: toSec(ts), label });
    }
    return chapters.length >= 2 ? chapters : [];
  }

  function toSec(ts) {
    const parts = ts.split(':').map(Number);
    return parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2] : parts[0]*60+parts[1];
  }

  // ---------- Smart summary builder ----------
  function buildSummary(title, description, chapters, channelName) {
    const cleaned = (description || '').replace(/https?:\/\/\S+/g,'').replace(/#\w+/g,'').replace(/\s{2,}/g,' ').trim();

    // Extract opening sentences (genuine content, not just promo)
    const sentences = (cleaned.match(/[^.!?\n]{20,250}[.!?]/g) || [])
      .map(s => s.trim())
      .filter(s => !s.match(/^(subscribe|follow|like|comment|share|check out|visit|link|telegram|instagram|twitter|facebook|whatsapp)/i))
      .slice(0, 3);

    // --- Case 1: Rich description + chapters ---
    if (chapters.length >= 3 && sentences.length > 0) {
      const topLabels = chapters.slice(0, 4).map(c => c.label).join(', ');
      return `<em>${esc(title)}</em> covers ${chapters.length} sections including <em>${esc(topLabels)}</em>. ${esc(sentences[0])} Scroll to any chapter below to jump directly to that moment in the video.`;
    }

    // --- Case 2: Description available but no chapters ---
    if (sentences.length >= 2) {
      return sentences.map(s => esc(s)).join(' ');
    }

    if (sentences.length === 1) {
      return `${esc(sentences[0])} Watch the full video on YouTube for the complete context.`;
    }

    // --- Case 3: No description — generate from title (smart NLP-lite approach) ---
    return buildTitleBasedSummary(title, channelName);
  }

  function buildTitleBasedSummary(title, channel) {
    if (!title) return 'Video metadata could not be retrieved. Open it on YouTube to watch.';

    const t = title.toLowerCase();

    // Detect topic patterns from title
    const isNews       = /attack|war|conflict|crisis|breaking|blast|protest|election|killed|crash|died|arrested|ban|sanction/i.test(title);
    const isExplainer  = /explain|how to|what is|why|guide|tutorial|course|learn|tips|tricks/i.test(title);
    const isAnalysis   = /analysis|review|reaction|opinion|discuss|debate|prediction|forecast/i.test(title);
    const isInterview  = /interview|conversation|podcast|talks? with|speaks? to/i.test(title);

    const by = channel ? ` by <em>${esc(channel)}</em>` : '';

    if (isNews) {
      return `This is a news report${by} covering <em>${esc(title)}</em>. The creator has not published a text description for this video — watch it on YouTube for the full story and live updates.`;
    }
    if (isExplainer) {
      return `<em>${esc(title)}</em> is an educational video${by} that walks through the topic step by step. No text description was found, but you can watch the full breakdown on YouTube.`;
    }
    if (isAnalysis) {
      return `<em>${esc(title)}</em> is an analysis or opinion piece${by}. No description was published by the creator — the full commentary is in the video.`;
    }
    if (isInterview) {
      return `<em>${esc(title)}</em> is a conversation or interview video${by}. No text description is available — watch on YouTube for the full discussion.`;
    }

    // Generic fallback
    return `<em>${esc(title)}</em>${by}. The creator has not added a public description for this video. You can watch it directly on YouTube using the link above.`;
  }

  // ---------- Render ----------
  function renderResults({ id, oembed, description, chapters }) {
    $embed.src = `https://www.youtube.com/embed/${id}?rel=0`;
    $title.textContent   = oembed?.title || '—';
    $channel.textContent = oembed?.author_name || 'Unknown channel';
    $idEl.textContent    = id;
    $chapCount.textContent = chapters.length;
    $watchLink.href = `https://www.youtube.com/watch?v=${id}`;

    // Summary
    $summary.innerHTML = buildSummary(oembed?.title || '', description, chapters, oembed?.author_name);

    // Source label
    let sourceLabel = 'From title';
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

    // Description
    if (description?.trim()) {
      $descEl.textContent = description.trim();
      $descEl.classList.remove('empty');
    } else {
      $descEl.textContent = 'No description was published by the creator for this video.';
      $descEl.classList.add('empty');
    }

    $results.classList.add('active');
    $results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Main ----------
  async function handleSummarize() {
    const id = extractId($input.value);
    if (!id) {
      showError('Please paste a valid YouTube URL (e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ)');
      return;
    }

    $btn.disabled = true;
    const orig = $btn.innerHTML;
    $btn.innerHTML = '<span class="spinner"></span> Loading…';
    $error.classList.remove('show');
    $results.classList.remove('active');
    $loader.classList.add('active');

    try {
      setStage('Fetching video info…');
      const oembed = await fetchOEmbed(id);

      setStage('Reading video page…');
      const pageHtml = await fetchYtPage(id);

      setStage('Extracting description…');
      const description = extractDesc(pageHtml);

      setStage('Detecting chapters…');
      const chapters = extractChapters(description);

      setStage('Building summary…');
      await new Promise(r => setTimeout(r, 200));

      $loader.classList.remove('active');

      if (!oembed && !description) {
        showError('This video appears to be private, deleted, or region-locked. Try a different video.');
        showToast('Could not load video', 'error');
        return;
      }

      renderResults({ id, oembed, description, chapters });
      showToast('Done', 'success');

    } catch (err) {
      console.error('[YouTube]', err);
      $loader.classList.remove('active');
      showError('Could not load this video. It may be private, age-restricted, or region-locked.');
      showToast('Failed', 'error');
    } finally {
      $btn.disabled = false;
      $btn.innerHTML = orig;
    }
  }

  $btn.addEventListener('click', handleSummarize);
  $input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSummarize(); });
})();
