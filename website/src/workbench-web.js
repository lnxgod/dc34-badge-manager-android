const workbenchTabs = document.querySelector('.tabs');
const workbenchTabButtons = [...document.querySelectorAll('.tab')];
const compactWorkbench = window.matchMedia('(max-width: 920px)');

function updateTabOrientation() {
  workbenchTabs.setAttribute('aria-orientation', compactWorkbench.matches ? 'horizontal' : 'vertical');
}

updateTabOrientation();
compactWorkbench.addEventListener('change', updateTabOrientation);

workbenchTabs.addEventListener('keydown', (event) => {
  if (compactWorkbench.matches || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;

  const currentIndex = workbenchTabButtons.indexOf(document.activeElement);
  if (currentIndex === -1) return;
  const direction = event.key === 'ArrowDown' ? 1 : -1;
  const nextIndex = (currentIndex + direction + workbenchTabButtons.length) % workbenchTabButtons.length;

  event.preventDefault();
  workbenchTabButtons[nextIndex].click();
  workbenchTabButtons[nextIndex].focus();
});

workbenchTabs.addEventListener('click', (event) => {
  event.target.closest('.tab')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});

const connectionLabel = document.querySelector('#connection-label');
const conciseConnectionLabels = new Map([
  ['device disconnected', 'Disconnected'],
  ['badge connected', 'Connected'],
  ['Web Serial unavailable', 'USB unavailable'],
]);

function shortenConnectionLabel() {
  const concise = conciseConnectionLabels.get(connectionLabel.textContent);
  if (concise) connectionLabel.textContent = concise;
}

shortenConnectionLabel();
new MutationObserver(shortenConnectionLabel).observe(connectionLabel, { childList: true });
