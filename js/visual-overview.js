(() => {
  const metaEl = document.getElementById("overview-meta");
  const statusEl = document.getElementById("overview-status");
  const gallery = document.getElementById("gallery-cards");
  const top = document.getElementById("gallery-scroll-top");
  const track = document.getElementById("gallery-scroll-track");

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

  function cardHtml(record) {
    const articleId = getRecordId(record);
    const assetId = String(record && (record.asset_id || record.article_id || record.id) ? (record.asset_id || record.article_id || record.id) : "").trim();
    const title = getEnglishTitle(record) || String(record && record.title ? record.title : "").trim() || "Untitled";

    return '<a class="overview-card" href="./index.html?article=' + encodeURIComponent(articleId) + '" title="' + escapeHtml(articleId + " - " + title) + '">'
      + '<div class="card-head">'
      + '<code>' + escapeHtml(articleId || "—") + '</code>'
      + '<span>' + escapeHtml(title) + '</span>'
      + '</div>'
      + '<div class="card-svg-wrap">'
      + '<img src="./svg-vertical/' + encodeURIComponent(assetId) + '.svg" alt="Visual representation for ' + escapeHtml(articleId) + '" loading="lazy">'
      + '</div>'
      + '</a>';
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

  function setupTopScrollbar() {
    if (!top || !track || !gallery) return;

    let syncing = false;

    const syncTrackWidth = () => {
      track.style.width = gallery.scrollWidth + "px";
    };

    const syncTopFromGallery = () => {
      if (syncing) return;
      syncing = true;
      top.scrollLeft = gallery.scrollLeft;
      syncing = false;
    };

    const syncGalleryFromTop = () => {
      if (syncing) return;
      syncing = true;
      gallery.scrollLeft = top.scrollLeft;
      syncing = false;
    };

    top.addEventListener("scroll", syncGalleryFromTop, { passive: true });
    gallery.addEventListener("scroll", syncTopFromGallery, { passive: true });
    window.addEventListener("resize", () => {
      syncTrackWidth();
      syncTopFromGallery();
    });

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        syncTrackWidth();
        syncTopFromGallery();
      });
      ro.observe(gallery);
    }

    syncTrackWidth();
    syncTopFromGallery();
  }

  async function bootstrap() {
    if (!metaEl || !gallery) return;
    setupTopScrollbar();

    try {
      const records = await loadStories();
      const sorted = records
        .filter((entry) => entry && typeof entry === "object")
        .slice()
        .sort((a, b) => compareArticleId(getRecordId(a), getRecordId(b)));

      gallery.innerHTML = sorted.map((record) => cardHtml(record)).join("");
      metaEl.textContent = "All visual representations sorted by article ID (" + sorted.length + " stories).";
      if (statusEl) statusEl.hidden = true;
    } catch (error) {
      gallery.innerHTML = "";
      metaEl.textContent = "All visual representations sorted by article ID.";
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = "Error: " + String(error && error.message ? error.message : error);
      }
    }
  }

  bootstrap();
})();
