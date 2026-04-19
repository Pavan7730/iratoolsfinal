/* =========================================================
   RESUME, HONESTLY — CV Analyzer v2
   Handles multi-column PDFs (section headers anywhere in text).
   pdf.js + mammoth.js — 100% client-side, nothing uploaded.
   ========================================================= */

(() => {
  'use strict';

  // ---------- Action verbs ----------
  const ACTION_VERBS = [
    'led','managed','spearheaded','directed','orchestrated','championed',
    'mentored','supervised','coordinated','headed','chaired','oversaw',
    'achieved','delivered','exceeded','surpassed','accomplished','secured',
    'attained','earned','won','reached',
    'created','built','designed','developed','engineered','architected',
    'launched','pioneered','established','founded','initiated','produced',
    'authored','crafted','constructed','formulated','implemented','deployed',
    'improved','enhanced','optimized','streamlined','refined','transformed',
    'accelerated','reduced','increased','boosted','upgraded','strengthened',
    'simplified','automated','modernized','scaled','generated','drove','grew',
    'expanded','acquired','closed','onboarded','retained','monetized',
    'analyzed','evaluated','identified','researched','investigated','assessed',
    'diagnosed','measured','forecasted','audited','presented','negotiated',
    'collaborated','facilitated','mediated','consulted','advised','persuaded',
    'influenced','partnered','programmed','coded','debugged','integrated',
    'migrated','refactored','tested','validated','configured','published',
    'drafted','reviewed','planned','executed','assigned','conducted',
    'monitored','handled','collaborated','suggested','identified',
  ];

  /*
   * SECTION DETECTION — v2
   * For multi-column PDFs, section headers appear anywhere in text (not at line
   * start). We search for keywords as standalone words anywhere in the text.
   * This fixes the issue where pdf.js merges column text.
   */
  const SECTIONS = [
    {
      key: 'contact',
      label: 'Contact Info',
      test: (text) =>
        /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text) ||   // email
        /\+?\d[\d\s().-]{7,}\d/.test(text) ||        // phone
        /linkedin\.com\/in\//i.test(text) ||
        /github\.com\//i.test(text),
    },
    {
      key: 'summary',
      label: 'Summary / Objective',
      test: (text) => /\b(summary|objective|profile|about\s*me|career\s*objective|professional\s*profile|personal\s*statement)\b/i.test(text),
    },
    {
      key: 'experience',
      label: 'Work Experience',
      test: (text) => /\b(experience|professional\s*experience|work\s*experience|employment|work\s*history|internship|internships|career)\b/i.test(text),
    },
    {
      key: 'education',
      label: 'Education',
      test: (text) => /\b(education|academic|qualifications|degree|university|college|school|b\.?tech|b\.?e\.|m\.?tech|bachelor|master|cgpa|percentage|gpa)\b/i.test(text),
    },
    {
      key: 'skills',
      label: 'Skills',
      test: (text) => /\b(skills|technical\s*skills|key\s*skills|core\s*competencies|expertise|technologies|competencies|proficiencies|tools|tech\s*stack)\b/i.test(text),
    },
    {
      key: 'projects',
      label: 'Projects',
      test: (text) => /\b(projects?|portfolio|key\s*projects?|personal\s*projects?|notable\s*projects?)\b/i.test(text),
    },
    {
      key: 'certifications',
      label: 'Certifications',
      test: (text) => /\b(certifications?|certificates?|licenses?|credentials?|coursera|udemy|aws\s*certified|google\s*certified)\b/i.test(text),
    },
    {
      key: 'awards',
      label: 'Awards',
      test: (text) => /\b(awards?|honors?|achievements?|recognition|accomplishments?|achievements?)\b/i.test(text),
    },
  ];

  // ---------- DOM ----------
  const $zone      = document.getElementById('upload-zone');
  const $file      = document.getElementById('resume-file');
  const $fileInfo  = document.getElementById('file-info');
  const $fileName  = document.getElementById('file-name');
  const $fileRemove= document.getElementById('file-remove');
  const $btn       = document.getElementById('analyze-btn');
  const $error     = document.getElementById('resume-error');
  const $loader    = document.getElementById('loader');
  const $stage     = document.getElementById('stage-text');
  const $results   = document.getElementById('results');
  const $toast     = document.getElementById('toast');

  let currentFile = null;

  // ---------- Utils ----------
  const showError = (msg) => {
    $error.textContent = msg;
    $error.classList.add('show');
    setTimeout(() => $error.classList.remove('show'), 8000);
  };

  const showToast = (msg, type = '') => {
    $toast.className = 'toast show ' + type;
    $toast.textContent = msg;
    setTimeout(() => $toast.classList.remove('show'), 3500);
  };

  const setStage = (t) => { $stage.textContent = t; };
  const formatBytes = (b) => b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';

  // ---------- Parsers ----------
  async function extractText(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'pdf' || file.type === 'application/pdf') {
      return await extractPdf(file);
    }
    if (ext === 'docx' || file.type.includes('wordprocessingml')) {
      return await extractDocx(file);
    }
    if (ext === 'txt' || file.type === 'text/plain') {
      const text = await file.text();
      return { text, pages: null };
    }
    throw new Error('Unsupported format. Please use PDF, DOCX, or TXT.');
  }

  async function extractPdf(file) {
    if (!window.pdfjsLib) throw new Error('PDF parser not loaded. Please refresh.');
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pageTexts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Sort items by vertical position then horizontal — helps with column order
      const items = content.items
        .filter(item => item.str.trim())
        .sort((a, b) => {
          const yDiff = Math.round(b.transform[5]) - Math.round(a.transform[5]); // descending Y
          if (Math.abs(yDiff) > 5) return yDiff; // different rows
          return a.transform[4] - b.transform[4]; // same row: left to right
        });
      pageTexts.push(items.map(i => i.str).join(' '));
    }
    return { text: pageTexts.join('\n\n'), pages: pdf.numPages };
  }

  async function extractDocx(file) {
    if (!window.mammoth) throw new Error('DOCX parser not loaded. Please refresh.');
    const buf = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return { text: result.value, pages: null };
  }

  // ---------- Analyzer ----------
  function analyzeResume(text, pages) {
    // Basic stats
    const words = text.match(/\b\w+\b/g) || [];
    const wordCount = words.length;
    const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 8);
    const sentenceCount = sentences.length;
    const avgSentLen = sentenceCount ? Math.round(wordCount / sentenceCount) : 0;

    // Section detection (searches anywhere in text — handles multi-column PDFs)
    const sections = {};
    for (const sec of SECTIONS) {
      sections[sec.key] = { present: sec.test(text), label: sec.label };
    }

    // Contact
    const hasEmail    = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text);
    const hasPhone    = /\+?\d[\d\s().-]{7,}\d/.test(text);
    const hasLinkedIn = /linkedin\.com\/in\//i.test(text);
    const hasGitHub   = /github\.com\//i.test(text);
    const contactSigs = [hasEmail, hasPhone, hasLinkedIn, hasGitHub].filter(Boolean).length;

    // Action verbs
    const verbData = countVerbs(text);

    // Quantifiable
    const quant = countQuant(text);

    // Scores
    const structScore  = scoreStructure(sections);
    const atsScore     = scoreATS({ text, sections, contactSigs, wordCount });
    const impactScore  = scoreImpact(verbData, quant, wordCount);
    const readScore    = scoreReadability(wordCount, avgSentLen);
    const overallScore = Math.round(
      structScore  * 0.30 +
      atsScore     * 0.25 +
      impactScore  * 0.30 +
      readScore    * 0.15
    );

    const insights = buildInsights({
      sections, verbData, quant, wordCount, avgSentLen,
      hasEmail, hasPhone, hasLinkedIn, contactSigs,
      structScore, atsScore, impactScore, readScore,
    });

    const estPages = pages || Math.max(1, Math.round(wordCount / 450));

    return {
      wordCount, sentenceCount, avgSentLen, estPages,
      sections, verbData, quant,
      hasEmail, hasPhone, hasLinkedIn, hasGitHub, contactSigs,
      structScore, atsScore, impactScore, readScore, overallScore, insights,
    };
  }

  function countVerbs(text) {
    const lower = text.toLowerCase();
    const found = [];
    let total = 0;
    for (const verb of ACTION_VERBS) {
      const re = new RegExp(`\\b${verb}(?:s|ed|ing|d)?\\b`, 'gi');
      const matches = lower.match(re);
      if (matches?.length) {
        found.push({ verb, count: matches.length });
        total += matches.length;
      }
    }
    found.sort((a, b) => b.count - a.count);
    return { total, unique: found.length, top: found.slice(0, 20) };
  }

  function countQuant(text) {
    const pct   = (text.match(/[+-]?\d+(?:\.\d+)?\s*%/g) || []).length;
    const money = (text.match(/(?:\$|USD|EUR|GBP|INR|₹|€|£)\s*\d[\d,.]*(?:\s*[KMBkm](?!\w))?/gi) || []).length;
    // Numbers 2+ digits, not pure year ranges, not phone-like
    const nums  = Math.max(0,
      (text.match(/(?<!\d)(\d{2,})(?!\d)/g) || []).filter(n => {
        const v = parseInt(n, 10);
        return v >= 10 && v !== 2019 && v !== 2020 && v !== 2021 && v !== 2022 && v !== 2023 && v !== 2024 && v !== 2025 && v !== 2026;
      }).length - pct - money
    );
    return { pct, money, nums: Math.max(0, nums), total: pct + money + Math.max(0, nums) };
  }

  function scoreStructure(sections) {
    let s = 0;
    const weights = { contact: 20, experience: 20, education: 15, skills: 15, summary: 12, projects: 10, certifications: 5, awards: 3 };
    for (const [key, w] of Object.entries(weights)) {
      if (sections[key]?.present) s += w;
    }
    return Math.min(100, s);
  }

  function scoreATS({ text, sections, contactSigs, wordCount }) {
    let s = 100;
    if (contactSigs === 0)                   s -= 30;
    else if (contactSigs === 1)              s -= 15;
    if (!sections.experience?.present)      s -= 20;
    if (!sections.education?.present)       s -= 10;
    if (!sections.skills?.present)          s -= 10;
    if (wordCount < 150)                    s -= 25;
    else if (wordCount < 300)               s -= 10;
    if (wordCount > 1600)                   s -= 10;
    const weirdChars = (text.match(/[\uE000-\uF8FF\u2022\u25A0-\u25FF]/g) || []).length;
    if (weirdChars > 20)                    s -= 10;
    return Math.max(0, Math.min(100, s));
  }

  function scoreImpact(vd, q, wc) {
    let s = 0;
    const density = wc ? (vd.total / (wc / 100)) : 0;
    s += Math.min(50, Math.round(density * 14));
    if (vd.unique >= 15) s += 20; else if (vd.unique >= 10) s += 14; else if (vd.unique >= 5) s += 7;
    if (q.total >= 10) s += 30; else if (q.total >= 5) s += 20; else if (q.total >= 2) s += 10;
    return Math.max(0, Math.min(100, s));
  }

  function scoreReadability(wc, avg) {
    let s = 100;
    if (wc < 200)      s -= 30;
    else if (wc < 350) s -= 15;
    if (wc > 1200)     s -= 10;
    if (wc > 1600)     s -= 15;
    if (avg > 28)      s -= 20;
    else if (avg > 22) s -= 10;
    else if (avg < 5)  s -= 10;
    return Math.max(0, Math.min(100, s));
  }

  function buildInsights(d) {
    const ins = [];
    // Positive
    if (d.structScore >= 85)   ins.push({ type:'good',    title:'Solid structure',          desc:`All key sections are present. Passes the recruiter's 6-second skim test.` });
    if (d.verbData.unique >= 15) ins.push({ type:'good',  title:'Strong action verb variety',desc:`${d.verbData.unique} distinct action verbs used. Variety signals range and capability.` });
    if (d.quant.total >= 8)    ins.push({ type:'good',    title:'You speak in numbers',      desc:`${d.quant.total} quantifiable results detected. Metrics always beat vague adjectives.` });

    // Missing essentials
    if (!d.sections.experience?.present)  ins.push({ type:'bad',  title:'Work Experience not detected', desc:'A "Professional Experience" or "Internships" section is critical. Make sure the heading is clear.' });
    if (!d.sections.education?.present)   ins.push({ type:'warn', title:'Education section unclear',    desc:'Add a clear "Education" heading. Include degree, institution, and year.' });
    if (!d.sections.skills?.present)      ins.push({ type:'warn', title:'Skills section missing',       desc:'ATS systems rely heavily on a Skills block to match job keywords. Add one explicitly.' });
    if (!d.sections.summary?.present)     ins.push({ type:'neutral', title:'No professional summary',   desc:'A 2–3 line summary at the top gives recruiters instant context about who you are.' });

    // Contact
    if (!d.hasEmail)    ins.push({ type:'bad',  title:'No email address found',  desc:'This is a dealbreaker — recruiters cannot contact you without an email.' });
    if (!d.hasPhone && d.hasEmail) ins.push({ type:'warn', title:'No phone number', desc:'A phone number speeds up recruiter responses significantly.' });
    if (!d.hasLinkedIn) ins.push({ type:'neutral', title:'No LinkedIn URL',      desc:'Recruiters cross-check LinkedIn before calling. Add your profile URL.' });

    // Impact
    if (d.verbData.total < 8) ins.push({ type:'warn', title:'Weak action verbs',         desc:'Replace "responsible for" or "worked on" with verbs like led, built, shipped, or scaled.' });
    if (d.quant.total < 3)   ins.push({ type:'warn', title:'Low on specific numbers',    desc:'Add team sizes, percentages, revenue numbers, or timeframes to prove impact.' });

    // Length
    if (d.wordCount < 200)   ins.push({ type:'bad',  title:'Resume too short',      desc:`Only ${d.wordCount} words. Most mid-level CVs need 400–700 words.` });
    if (d.wordCount > 1200)  ins.push({ type:'warn', title:'Resume is long',         desc:`${d.wordCount} words. Aim for 1–2 pages unless you have 15+ years of experience.` });
    if (d.avgSentLen > 25)   ins.push({ type:'warn', title:'Sentences are too long', desc:'Break dense paragraphs into punchy single-idea bullet points.' });

    if (ins.length === 0) ins.push({ type:'good', title:'Clean resume', desc:'No obvious issues. Tailor the content per job description and send it out.' });
    return ins;
  }

  // ---------- Render ----------
  function renderResults(data) {
    const $ = (id) => document.getElementById(id);

    // Animate number
    const animate = (el, target) => {
      let cur = 0;
      const fn = () => { if (cur < target) { cur = Math.min(target, cur + Math.ceil(target/28)); el.textContent = cur; requestAnimationFrame(fn); } };
      requestAnimationFrame(fn);
    };

    // Overall gauge
    const r = 80, circ = 2 * Math.PI * r;
    const offset = circ - (data.overallScore / 100) * circ;
    const fill = $('overall-fill');
    let gc = '#059669'; if (data.overallScore < 70) gc = '#D97706'; if (data.overallScore < 50) gc = '#E11D48';
    fill.style.stroke = gc;
    setTimeout(() => { fill.style.strokeDashoffset = offset; }, 100);
    animate($('overall-num'), data.overallScore);

    // Verdict
    const v = verdictFor(data.overallScore);
    $('overall-verdict').innerHTML = v.title;
    $('overall-desc').textContent = v.desc;

    // Sub-scores
    const setScore = (numId, barId, val) => {
      animate($(numId), val);
      setTimeout(() => { $(barId).style.width = val + '%'; }, 200);
    };
    setScore('struct-score','struct-bar',  data.structScore);
    setScore('ats-score',   'ats-bar',    data.atsScore);
    setScore('impact-score','impact-bar', data.impactScore);
    setScore('read-score',  'read-bar',   data.readScore);

    // Sections
    const $sg = $('sections-grid');
    $sg.innerHTML = '';
    for (const sec of SECTIONS) {
      const s = data.sections[sec.key];
      const div = document.createElement('div');
      div.className = 'section-item';
      div.innerHTML = `
        <span class="section-status ${s.present ? 'present' : 'missing'}">
          ${s.present
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'}
        </span>
        <span class="section-item-label">${sec.label}</span>
      `;
      $sg.appendChild(div);
    }

    // Verbs
    $('verb-count').textContent = data.verbData.total;
    $('unique-verb-count').textContent = data.verbData.unique;
    const $chips = $('verbs-chips');
    $chips.innerHTML = '';
    if (data.verbData.top.length === 0) {
      $chips.innerHTML = '<span class="score-note">No strong action verbs found. Add: led, built, delivered, managed, launched…</span>';
    } else {
      data.verbData.top.forEach(v => {
        const c = document.createElement('span');
        c.className = 'verb-chip';
        c.innerHTML = `${v.verb}<span class="count">${v.count}×</span>`;
        $chips.appendChild(c);
      });
    }

    // Quant
    $('pct-count').textContent   = data.quant.pct;
    $('money-count').textContent = data.quant.money;
    $('num-count').textContent   = data.quant.nums;
    $('quant-note').textContent  = data.quant.total >= 5
      ? '✓ Strong — you back your claims with numbers.'
      : data.quant.total >= 2
        ? '~ Some specifics present. Aim for 5+ quantified wins.'
        : '⚠ Almost no numbers. Add %, amounts, team sizes, timeframes.';

    // Meta
    $('meta-words').textContent     = data.wordCount;
    $('meta-sentences').textContent = data.sentenceCount;
    $('meta-avg').textContent       = data.avgSentLen;
    $('meta-pages').textContent     = data.estPages;

    // Insights
    const $ins = $('insights-list');
    $ins.innerHTML = '';
    const icons = {
      good:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      warn:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      bad:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      neutral: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };
    data.insights.forEach(ins => {
      const d = document.createElement('div');
      d.className = 'insight ' + ins.type;
      d.innerHTML = `
        <span class="insight-icon">${icons[ins.type]}</span>
        <div class="insight-body">
          <div class="insight-title">${ins.title}</div>
          <div class="insight-desc">${ins.desc}</div>
        </div>
      `;
      $ins.appendChild(d);
    });

    $results.classList.add('active');
    $results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function verdictFor(s) {
    if (s >= 90) return { title: 'This resume is <em>sharp.</em>',        desc: 'Strong structure, good impact, clean readability. Tailor per role and send it.' };
    if (s >= 75) return { title: 'Good resume, minor polish needed.',      desc: 'The fundamentals are solid. A few tweaks will push it to excellent.' };
    if (s >= 60) return { title: 'Decent base, but <em>gaps show.</em>',  desc: 'Focus on the lowest-scoring category below — that single fix moves the needle most.' };
    if (s >= 40) return { title: 'Needs meaningful work.',                 desc: 'Several issues are dragging this down. Work through the insights below.' };
    return { title: 'This resume <em>won\'t get calls.</em>',            desc: 'Core elements are missing. Start with the red flags below and rebuild.' };
  }

  // ---------- File handling ----------
  const onFile = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showError('File too large (max 5 MB).'); return; }
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf','docx','txt'].includes(ext)) { showError('Unsupported format. Use PDF, DOCX, or TXT.'); return; }
    currentFile = file;
    $fileName.textContent = `${file.name} · ${formatBytes(file.size)}`;
    $fileInfo.classList.add('show');
    $btn.disabled = false;
    $error.classList.remove('show');
  };

  $file.addEventListener('change', (e) => onFile(e.target.files?.[0]));

  ['dragenter','dragover'].forEach(ev => {
    $zone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); $zone.classList.add('dragover'); });
  });
  ['dragleave','drop'].forEach(ev => {
    $zone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); $zone.classList.remove('dragover'); });
  });
  $zone.addEventListener('drop', (e) => onFile(e.dataTransfer?.files?.[0]));

  $fileRemove.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    currentFile = null; $file.value = '';
    $fileInfo.classList.remove('show'); $btn.disabled = true;
  });

  $btn.addEventListener('click', async () => {
    if (!currentFile) return;
    $btn.disabled = true;
    const orig = $btn.innerHTML;
    $btn.innerHTML = '<span class="spinner"></span> Analyzing…';
    $error.classList.remove('show');
    $results.classList.remove('active');
    $loader.classList.add('active');

    try {
      setStage('Reading file…');
      const { text, pages } = await extractText(currentFile);

      if (!text || text.trim().length < 50) {
        throw new Error('Not enough text extracted. The file may be a scanned image. Try a text-based PDF or DOCX.');
      }

      setStage('Detecting sections…');
      await new Promise(r => setTimeout(r, 180));

      setStage('Scoring structure, ATS, impact…');
      await new Promise(r => setTimeout(r, 220));
      const result = analyzeResume(text, pages);

      setStage('Writing insights…');
      await new Promise(r => setTimeout(r, 200));

      $loader.classList.remove('active');
      renderResults(result);
      showToast('Analysis complete', 'success');
    } catch (err) {
      console.error('[Resume]', err);
      $loader.classList.remove('active');
      showError(err.message || 'Could not analyze. Try converting to a simpler format.');
      showToast('Analysis failed', 'error');
    } finally {
      $btn.disabled = false;
      $btn.innerHTML = orig;
    }
  });
})();
