const $ = (sel) => document.querySelector(sel);
const loadingScreen = $('#loading-screen');
const noBookScreen = $('#no-book-screen');
const bookScreen = $('#book-screen');
const closedBookOverlay = $('#closed-book-overlay');
const closedBook = $('#closed-book');
const flipbookArea = $('#flipbook-area');
const flipbookEl = $('#flipbook');
const controlsBar = $('#controls-bar');
const prevBtn = $('#prev-btn');
const nextBtn = $('#next-btn');
const pageInfo = $('#page-info');
const coverTitle = $('#cover-title');
const loadingText = $('#loading-text');
const closedCoverImg = $('#closed-cover-img');

let bookActive = false;
let coverImageSrc = null;
let totalContentPages = 0;
let bookFormat = 'pdf';
let epubChapters = null;
let currentFontSize = 16;

const PAGE_RATIO = 6 / 9;
const CONTROLS_HEIGHT = 100; // extra room for font controls

function isMobile() {
  return window.innerWidth <= 768;
}

// On load, fetch book data from API
async function init() {
  try {
    const res = await fetch('/api/book');
    const data = await res.json();

    if (!data.exists) {
      showScreen('no-book');
      return;
    }

    coverImageSrc = data.coverUrl || null;
    bookFormat = data.format || 'pdf';
    const title = data.title;

    coverTitle.textContent = title;

    if (bookFormat === 'epub') {
      loadingText.textContent = 'Loading chapters...';
      const chapRes = await fetch(data.chaptersUrl);
      epubChapters = await chapRes.json();

      if (!epubChapters || epubChapters.length === 0) {
        showScreen('no-book');
        return;
      }

      // Show font size controls
      const fontControls = $('#font-controls');
      if (fontControls) fontControls.classList.remove('hidden');

      buildEpubBook(epubChapters, title);
    } else {
      const pageUrls = data.pageUrls;
      if (!pageUrls || pageUrls.length === 0) {
        showScreen('no-book');
        return;
      }
      buildPdfBook(pageUrls, title);
    }

    showScreen('book');
  } catch (err) {
    console.error('Error loading book:', err);
    showScreen('no-book');
  }
}

function calcPageSize() {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const mobile = isMobile();

  const availH = vh - CONTROLS_HEIGHT;
  const availW = vw;

  let pageW, pageH;

  if (mobile) {
    pageW = availW - 16;
    pageH = Math.floor(pageW / PAGE_RATIO);
    if (pageH > availH - 8) {
      pageH = availH - 8;
      pageW = Math.floor(pageH * PAGE_RATIO);
    }
  } else {
    pageH = availH - 20;
    pageW = Math.floor(pageH * PAGE_RATIO);

    if (pageW * 2 > availW - 40) {
      pageW = Math.floor((availW - 40) / 2);
      pageH = Math.floor(pageW / PAGE_RATIO);
    }
  }

  return { pageW, pageH };
}

// ── PDF book (image pages) ──
function buildPdfBook(pageUrls, title) {
  if (bookActive) {
    jQuery('#flipbook').turn('destroy');
    bookActive = false;
  }
  flipbookEl.innerHTML = '';

  const { pageW, pageH } = calcPageSize();
  const mobile = isMobile();

  setClosedBookSize(pageW, pageH);

  // Front cover
  flipbookEl.appendChild(makeCoverPage(title));

  // Content pages
  totalContentPages = pageUrls.length;
  pageUrls.forEach((url, i) => {
    const div = makePageDiv('');
    div.innerHTML = `<img class="page-image" src="${escapeAttr(url)}" alt="Page ${i + 1}" loading="lazy" />`;
    const side = (i % 2 === 0) ? 'left' : 'right';
    div.innerHTML += `<span class="page-number ${side}">${i + 1}</span>`;
    flipbookEl.appendChild(div);
  });

  if ((pageUrls.length + 2) % 2 !== 0) {
    flipbookEl.appendChild(makePageDiv(''));
  }

  flipbookEl.appendChild(makePageDiv('hard back-cover'));
  setupClosedBookCover(title);
  window._turnConfig = { pageW, pageH, mobile };
}

// ── EPUB book (HTML text pages) ──
function buildEpubBook(chapters, title) {
  if (bookActive) {
    jQuery('#flipbook').turn('destroy');
    bookActive = false;
  }
  flipbookEl.innerHTML = '';

  const { pageW, pageH } = calcPageSize();
  const mobile = isMobile();

  setClosedBookSize(pageW, pageH);

  // Front cover
  flipbookEl.appendChild(makeCoverPage(title));

  // Paginate chapters into pages
  // Padding: 36px top/sides, extra bottom for page numbers + safety margin
  const contentPadding = 36;
  const bottomExtra = 50;
  const usableHeight = pageH - contentPadding - contentPadding - bottomExtra;
  const allPages = paginateChapters(chapters, pageW - contentPadding * 2, usableHeight, currentFontSize);

  totalContentPages = allPages.length;
  allPages.forEach((page, i) => {
    const div = makePageDiv('');
    const content = document.createElement('div');
    content.className = 'page-text-content';
    content.style.fontSize = currentFontSize + 'px';
    content.innerHTML = page.html;
    div.appendChild(content);

    const side = (i % 2 === 0) ? 'left' : 'right';
    const num = document.createElement('span');
    num.className = 'page-number ' + side;
    num.textContent = i + 1;
    div.appendChild(num);
    flipbookEl.appendChild(div);
  });

  if ((allPages.length + 2) % 2 !== 0) {
    flipbookEl.appendChild(makePageDiv(''));
  }

  flipbookEl.appendChild(makePageDiv('hard back-cover'));
  setupClosedBookCover(title);
  window._turnConfig = { pageW, pageH, mobile };
}

// Flatten nested HTML into top-level block elements for pagination
function flattenToBlocks(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const blocks = [];
  const blockTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'BLOCKQUOTE', 'UL', 'OL', 'HR', 'PRE', 'TABLE', 'FIGURE']);

  function walk(node) {
    for (const child of Array.from(node.children)) {
      if (blockTags.has(child.tagName)) {
        // Check if this block contains nested blocks (like a wrapper div)
        const hasNestedBlocks = Array.from(child.children).some(c => blockTags.has(c.tagName));
        if (hasNestedBlocks && child.tagName === 'DIV') {
          // Unwrap: recurse into children
          walk(child);
        } else {
          blocks.push(child.outerHTML);
        }
      } else if (child.tagName === 'IMG') {
        // Treat standalone images as blocks
        blocks.push(child.outerHTML);
      }
    }
  }

  walk(temp);

  // If nothing was extracted (e.g., plain text nodes), wrap in <p> tags
  if (blocks.length === 0 && temp.textContent.trim()) {
    blocks.push('<p>' + temp.innerHTML + '</p>');
  }

  return blocks;
}

// Paginate EPUB chapters into fixed-height pages
function paginateChapters(chapters, width, height, fontSize) {
  const pages = [];

  // Create a hidden measuring container with matching text styles
  const measurer = document.createElement('div');
  measurer.className = 'page-text-measurer';
  measurer.style.cssText = `
    position: absolute; visibility: hidden; overflow: hidden;
    width: ${width}px;
    font-size: ${fontSize}px;
    line-height: 1.7;
    font-family: Georgia, serif;
    padding: 0;
  `;
  document.body.appendChild(measurer);

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapter = chapters[ci];

    // Flatten chapter HTML into individual block elements
    const blocks = flattenToBlocks(chapter.html);

    let currentPageHTML = '';
    let currentHeight = 0;

    // Each chapter starts on a new page
    // If not the first chapter, add blank page if needed so chapter starts on right page
    if (ci > 0 && pages.length > 0) {
      if (pages.length % 2 !== 0) {
        pages.push({ html: '' });
      }
    }

    for (let bi = 0; bi < blocks.length; bi++) {
      const blockHTML = blocks[bi];

      measurer.innerHTML = blockHTML;
      const elHeight = measurer.offsetHeight;

      // If this single element is taller than a page, add what we have and put it on its own page
      if (elHeight > height) {
        if (currentPageHTML) {
          pages.push({ html: currentPageHTML });
          currentPageHTML = '';
          currentHeight = 0;
        }
        pages.push({ html: blockHTML });
        continue;
      }

      // Would this element overflow the current page?
      if (currentHeight + elHeight > height && currentPageHTML) {
        pages.push({ html: currentPageHTML });
        currentPageHTML = '';
        currentHeight = 0;
      }

      currentPageHTML += blockHTML;
      currentHeight += elHeight;
    }

    if (currentPageHTML) {
      pages.push({ html: currentPageHTML });
    }
  }

  document.body.removeChild(measurer);
  return pages;
}

// ── Shared helpers ──

function setClosedBookSize(pageW, pageH) {
  const closedBookInner = $('#closed-book-inner');
  closedBookInner.style.width = pageW + 'px';
  closedBookInner.style.height = pageH + 'px';
}

function makeCoverPage(title) {
  const frontCover = makePageDiv('hard');
  if (coverImageSrc) {
    frontCover.classList.add('has-cover-image');
    frontCover.innerHTML = `<img class="cover-img" src="${escapeAttr(coverImageSrc)}" alt="Cover" />`;
  } else {
    frontCover.innerHTML = `<div class="page-cover-content"><h2>${escapeHTML(title)}</h2></div>`;
  }
  return frontCover;
}

function setupClosedBookCover(title) {
  if (coverImageSrc) {
    closedCoverImg.src = coverImageSrc;
    closedCoverImg.classList.remove('hidden');
  } else {
    closedCoverImg.classList.add('hidden');
  }
  coverTitle.textContent = title;
}

function makePageDiv(extraClasses) {
  const div = document.createElement('div');
  div.className = 'page' + (extraClasses ? ' ' + extraClasses : '');
  return div;
}

function initTurnJs(startPage) {
  const { pageW, pageH, mobile } = window._turnConfig;

  jQuery('#flipbook').turn({
    page: startPage || 1,
    width: mobile ? pageW : pageW * 2,
    height: pageH,
    autoCenter: true,
    display: mobile ? 'single' : 'double',
    acceleration: true,
    elevation: 50,
    gradients: true,
    duration: 800,
    when: {
      turned: function (event, page) {
        updatePageInfo(page);
      }
    }
  });

  bookActive = true;
  updatePageInfo(startPage || 1);
}

function updatePageInfo(page) {
  const totalTurnPages = jQuery('#flipbook').turn('pages');

  if (page <= 1) {
    pageInfo.textContent = 'Cover';
  } else if (page >= totalTurnPages) {
    pageInfo.textContent = 'Back cover';
  } else {
    const contentPage = page - 1;
    pageInfo.textContent = `Page ${contentPage} of ${totalContentPages}`;
  }
}

// Open the closed book
closedBook.addEventListener('click', () => {
  closedBookOverlay.classList.add('hidden');
  flipbookArea.classList.remove('hidden');
  controlsBar.classList.remove('hidden');

  requestAnimationFrame(() => {
    initTurnJs();
  });
});

// Navigation
prevBtn.addEventListener('click', () => {
  if (bookActive) jQuery('#flipbook').turn('previous');
});

nextBtn.addEventListener('click', () => {
  if (bookActive) jQuery('#flipbook').turn('next');
});

document.addEventListener('keydown', (e) => {
  if (!bookActive || bookScreen.classList.contains('hidden')) return;
  if (!closedBookOverlay.classList.contains('hidden')) {
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
      closedBook.click();
    }
    return;
  }
  if (e.key === 'ArrowLeft') jQuery('#flipbook').turn('previous');
  if (e.key === 'ArrowRight') jQuery('#flipbook').turn('next');
});

// Font size controls (EPUB only)
function changeFontSize(delta) {
  if (bookFormat !== 'epub' || !epubChapters) return;

  let wasPage = 2; // default to first content page (page 1 is cover)
  if (bookActive) {
    try { wasPage = jQuery('#flipbook').turn('page'); } catch(e) {}
    try { jQuery('#flipbook').turn('destroy'); } catch(e) {}
    bookActive = false;
  }

  currentFontSize = Math.max(10, Math.min(28, currentFontSize + delta));

  const label = $('#font-size-label');
  if (label) label.textContent = currentFontSize + 'px';

  // Rebuild the book with new font size
  const title = coverTitle.textContent;
  buildEpubBook(epubChapters, title);

  // Re-init turn.js and restore page position
  requestAnimationFrame(() => {
    const targetPage = Math.max(2, wasPage);
    initTurnJs(targetPage);
  });
}

// Expose globally for inline handlers
window.changeFontSize = changeFontSize;

function showScreen(screen) {
  loadingScreen.classList.toggle('hidden', screen !== 'loading');
  noBookScreen.classList.toggle('hidden', screen !== 'no-book');
  bookScreen.classList.toggle('hidden', screen !== 'book');

  if (screen === 'book') {
    closedBookOverlay.classList.remove('hidden');
    flipbookArea.classList.add('hidden');
    controlsBar.classList.add('hidden');
  }
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Start
init();
