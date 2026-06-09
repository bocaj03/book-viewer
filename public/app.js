pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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

const PAGE_RATIO = 6 / 9;
const CONTROLS_HEIGHT = 76;

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
    const title = data.title;
    const pdfUrl = data.pdfUrl;

    coverTitle.textContent = title;
    loadingText.textContent = 'Loading document...';

    // Fetch and render the PDF
    const pages = await processPDFFromUrl(pdfUrl);

    if (pages.length === 0) {
      showScreen('no-book');
      return;
    }

    buildBook(pages, title);
    showScreen('book');
  } catch (err) {
    console.error('Error loading book:', err);
    showScreen('no-book');
  }
}

async function processPDFFromUrl(url) {
  const pdf = await pdfjsLib.getDocument(url).promise;
  const pages = [];
  const scale = 2;

  for (let i = 1; i <= pdf.numPages; i++) {
    loadingText.textContent = `Rendering page ${i} of ${pdf.numPages}...`;
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({ type: 'image', src: canvas.toDataURL('image/jpeg', 0.92) });
  }

  return pages;
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

function buildBook(pages, title) {
  if (bookActive) {
    jQuery('#flipbook').turn('destroy');
    bookActive = false;
  }
  flipbookEl.innerHTML = '';

  const { pageW, pageH } = calcPageSize();
  const mobile = isMobile();

  // Set closed book size
  const closedBookInner = $('#closed-book-inner');
  closedBookInner.style.width = pageW + 'px';
  closedBookInner.style.height = pageH + 'px';

  // Front cover (hard)
  const frontCover = makePageDiv('hard');
  if (coverImageSrc) {
    frontCover.classList.add('has-cover-image');
    frontCover.innerHTML = `<img class="cover-img" src="${escapeAttr(coverImageSrc)}" alt="Cover" />`;
  } else {
    frontCover.innerHTML = `<div class="page-cover-content"><h2>${escapeHTML(title)}</h2></div>`;
  }
  flipbookEl.appendChild(frontCover);

  // Content pages — PDF page 1 is the first interior page
  totalContentPages = pages.length;
  pages.forEach((page, i) => {
    const div = makePageDiv('');
    if (page.type === 'image') {
      div.innerHTML = `<img class="page-image" src="${page.src}" alt="Page ${i + 1}" />`;
    } else {
      div.innerHTML = `<div class="page-content">${page.content}</div>`;
    }
    const side = (i % 2 === 0) ? 'left' : 'right';
    div.innerHTML += `<span class="page-number ${side}">${i + 1}</span>`;
    flipbookEl.appendChild(div);
  });

  // Pad to even total (cover + content pages + back cover must be even for turn.js)
  // Cover = 1 page, content = pages.length, back cover = 1
  // Total = pages.length + 2. If odd, add a blank.
  if ((pages.length + 2) % 2 !== 0) {
    flipbookEl.appendChild(makePageDiv(''));
  }

  // Back cover (hard)
  const backCover = makePageDiv('hard back-cover');
  flipbookEl.appendChild(backCover);

  // Closed book cover
  if (coverImageSrc) {
    closedCoverImg.src = coverImageSrc;
    closedCoverImg.classList.remove('hidden');
  } else {
    closedCoverImg.classList.add('hidden');
  }
  coverTitle.textContent = title;

  window._turnConfig = { pageW, pageH, mobile };
}

function makePageDiv(extraClasses) {
  const div = document.createElement('div');
  div.className = 'page' + (extraClasses ? ' ' + extraClasses : '');
  return div;
}

function initTurnJs() {
  const { pageW, pageH, mobile } = window._turnConfig;

  jQuery('#flipbook').turn({
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
  updatePageInfo(1);
}

function updatePageInfo(page) {
  const totalTurnPages = jQuery('#flipbook').turn('pages');

  if (page <= 1) {
    pageInfo.textContent = 'Cover';
  } else if (page >= totalTurnPages) {
    pageInfo.textContent = 'Back cover';
  } else {
    // Page 1 = cover, so content starts at page 2
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
