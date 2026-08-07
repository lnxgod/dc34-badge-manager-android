const jobButtons = [...document.querySelectorAll('.job')];
const siteBasePath = document.documentElement.dataset.siteBasePath || '';
const jobTitle = document.querySelector('#job-title');
const jobCopy = document.querySelector('#job-copy');
const jobPanel = document.querySelector('#job-panel');
const startJob = document.querySelector('#start-job');
const jobSteps = [
  document.querySelector('#job-step-1'),
  document.querySelector('#job-step-2'),
  document.querySelector('#job-step-3'),
];

function selectJob(button) {
  jobButtons.forEach((candidate) => {
    const selected = candidate === button;
    candidate.classList.toggle('active', selected);
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
  });

  jobTitle.textContent = button.dataset.title;
  jobCopy.textContent = button.dataset.copy;
  jobPanel.setAttribute('aria-labelledby', button.id);
  startJob.href = `${siteBasePath}/workbench/index.html#${button.dataset.hash}`;
  button.dataset.steps.split('|').forEach((step, index) => {
    jobSteps[index].textContent = step;
  });
}

jobButtons.forEach((button, index) => {
  button.addEventListener('click', () => selectJob(button));
  button.addEventListener('keydown', (event) => {
    let nextIndex = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % jobButtons.length;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (index - 1 + jobButtons.length) % jobButtons.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = jobButtons.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectJob(jobButtons[nextIndex]);
    jobButtons[nextIndex].focus();
  });
});

const serialSupport = document.querySelector('#serial-support');
if (window.isSecureContext && 'serial' in navigator) {
  serialSupport.textContent = 'Web Serial is ready in this browser.';
} else {
  serialSupport.textContent = 'Use desktop Chrome or Edge for USB. Image and QR previews still work here.';
}

document.querySelector('#year').textContent = String(new Date().getFullYear());

const mobileNavigation = document.querySelector('.mobile-nav');
mobileNavigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) mobileNavigation.open = false;
});

const canvas = document.querySelector('#hero-badge');
const context = canvas.getContext('2d');
context.imageSmoothingEnabled = false;
context.fillStyle = '#050706';
context.fillRect(0, 0, canvas.width, canvas.height);

const glyphs = {
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['10010', '10010', '10010', '11111', '00010', '00010', '00010'],
};

function drawGlyph(glyph, x, y, scale) {
  context.fillStyle = '#f4faf7';
  glyph.forEach((row, rowIndex) => {
    [...row].forEach((pixel, columnIndex) => {
      if (pixel === '1') context.fillRect(x + columnIndex * scale, y + rowIndex * scale, scale, scale);
    });
  });
}

drawGlyph(glyphs.D, 12, 11, 3);
drawGlyph(glyphs.C, 33, 11, 3);
drawGlyph(glyphs[3], 71, 11, 3);
drawGlyph(glyphs[4], 92, 11, 3);

context.fillStyle = '#f4faf7';
context.fillRect(38, 48, 52, 36);
context.fillRect(44, 42, 40, 8);
context.fillRect(47, 82, 7, 10);
context.fillRect(59, 82, 7, 13);
context.fillRect(72, 82, 7, 10);
context.fillStyle = '#050706';
context.fillRect(48, 59, 11, 11);
context.fillRect(69, 59, 11, 11);
context.fillRect(62, 72, 5, 7);

context.fillStyle = '#79ffb0';
context.fillRect(18, 104, 92, 3);
context.fillRect(26, 113, 76, 3);
context.fillRect(34, 121, 60, 3);
