(() => {
  const metaEl = document.getElementById("articles-meta");
  const tbody = document.getElementById("articles-table-body");
  const statusEl = document.getElementById("articles-status");

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"]/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    }[ch]));
  }

  function normalizeTitle(value) {
    return String(value || "").trim().toLowerCase();
  }

  function compareArticleId(a, b) {
    const left = String(a || "");
    const right = String(b || "");
    const lm = left.match(/^([A-Za-z]+)(\d+)$/);
    const rm = right.match(/^([A-Za-z]+)(\d+)$/);
    if (lm && rm) {
      const prefix = lm[1].localeCompare(rm[1], undefined, { sensitivity: "base" });
      if (prefix !== 0) return prefix;
      return Number(lm[2]) - Number(rm[2]);
    }
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  }

  function getRecordId(record) {
    if (!record || typeof record !== "object") return "";
    return String(record.article_id || record.id || "").trim();
  }

  function getEnglishTitle(record) {
    if (!record || typeof record !== "object") return "";
    const meta = record.meta && typeof record.meta === "object" ? record.meta : null;
    const original = String(record.title || "").trim();
    const originalNorm = normalizeTitle(original);
    const candidates = [
      record["english-title"],
      record.english_title,
      record.title_en,
      record.titleEnglish,
      record.translated_title,
      record.translation_en,
      meta && meta["english-title"],
      meta && meta.english_title,
      meta && meta.title_en,
      meta && meta.title_english,
      meta && meta["English title"],
      meta && meta["English Title"],
      meta && meta["Title (English)"],
      meta && meta.translated_title,
      meta && meta["Translated title"],
      meta && meta["Translated Title"],
    ];
    for (const candidate of candidates) {
      const text = String(candidate || "").trim();
      if (!text) continue;
      if (originalNorm && normalizeTitle(text) === originalNorm) continue;
      return text;
    }
    return "";
  }

  function getOriginalTitle(record, englishTitle) {
    const original = String(record && record.title ? record.title : "").trim();
    if (!original) return "—";
    if (!englishTitle) return "—";
    if (normalizeTitle(original) === normalizeTitle(englishTitle)) return "—";
    return original;
  }

  function getPublisher(record, sourceMeta) {
    const meta = record && record.meta && typeof record.meta === "object" ? record.meta : null;
    const candidates = [
      record && record.news_org,
      sourceMeta && sourceMeta.news_org,
      meta && meta["News-outlet"],
      meta && meta["News outlet"],
      meta && meta["News org"],
    ];
    for (const candidate of candidates) {
      const text = String(candidate || "").trim();
      if (text) return text;
    }
    return "—";
  }

  function getDate(record) {
    const meta = record && record.meta && typeof record.meta === "object" ? record.meta : null;
    const candidates = [
      meta && meta.Date,
      meta && meta.date,
      record && record.date,
      record && record.publication_date,
    ];
    for (const candidate of candidates) {
      const text = String(candidate || "").trim();
      if (text) return text;
    }
    return "—";
  }

  function getUrl(record, sourceMeta) {
    const meta = record && record.meta && typeof record.meta === "object" ? record.meta : null;
    const candidates = [
      record && record.original_url,
      sourceMeta && sourceMeta.url,
      record && record.URL,
      record && record.url,
      meta && meta.URL,
      meta && meta.url,
    ];
    for (const candidate of candidates) {
      const text = String(candidate || "").trim();
      if (/^https?:\/\//i.test(text)) return text;
    }
    return "";
  }

  function rowHtml(record, sourceMeta) {
    const articleId = getRecordId(record);
    const englishTitle = getEnglishTitle(record) || String(record && record.title ? record.title : "").trim() || "—";
    const originalTitle = getOriginalTitle(record, englishTitle);
    const publisher = getPublisher(record, sourceMeta);
    const date = getDate(record);
    const url = getUrl(record, sourceMeta);

    const idCell = url
      ? '<a class="id-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer"><code>' + escapeHtml(articleId || "—") + '</code><span class="id-link-icon" aria-hidden="true">↗</span></a>'
      : '<code>' + escapeHtml(articleId || "—") + '</code>';

    return '<tr>'
      + '<td>' + idCell + '</td>'
      + '<td>' + escapeHtml(englishTitle) + '</td>'
      + '<td>' + escapeHtml(originalTitle) + '</td>'
      + '<td>' + escapeHtml(publisher) + '</td>'
      + '<td>' + escapeHtml(date) + '</td>'
      + '</tr>';
  }

  async function loadStories() {
    const paths = [
      "./data/stories.json",
      "./stories.json",
    ];
    for (const path of paths) {
      try {
        const res = await fetch(path);
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data)) return data;
      } catch (_) {}
    }
    throw new Error("Failed to load stories.json");
  }

  async function loadArticleSources() {
    try {
      const res = await fetch("./article-sources.json");
      if (!res.ok) return {};
      const data = await res.json();
      return data && typeof data === "object" ? data : {};
    } catch (_) {
      return {};
    }
  }

  async function bootstrap() {
    if (!metaEl || !tbody) return;
    try {
      const [records, sourceMap] = await Promise.all([loadStories(), loadArticleSources()]);
      const sorted = records
        .filter((entry) => entry && typeof entry === "object")
        .slice()
        .sort((a, b) => compareArticleId(getRecordId(a), getRecordId(b)));

      tbody.innerHTML = sorted
        .map((record) => rowHtml(record, sourceMap[getRecordId(record)] || null))
        .join("");
      metaEl.textContent = "Mapping from paper article IDs to source publications (" + sorted.length + " stories).";
      if (statusEl) statusEl.hidden = true;
    } catch (error) {
      tbody.innerHTML = '<tr><td colspan="5">Unable to load story data.</td></tr>';
      metaEl.textContent = "Mapping from paper article IDs to source publications.";
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = "Error: " + String(error && error.message ? error.message : error);
      }
    }
  }

  bootstrap();
})();
