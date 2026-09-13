import { fetchPublicFarms, fetchPublicFarmStats } from './api.js?v=2';
import {
  deriveDisplayStatus,
  formatFarmId,
  formatRemaining,
  matchesSearch,
  sortFarms
} from './farm-logic.js?v=2';

const DATA_REFRESH_MS = 15_000;
const COUNTDOWN_REFRESH_MS = 1_000;

const state = {
  farms: [],
  query: '',
  filter: 'all',
  loading: true,
  error: null,
  lastUpdated: null,
  completedCount: 0
};

const elements = {
  search: document.querySelector('#farm-search'),
  filters: [...document.querySelectorAll('[data-filter]')],
  list: document.querySelector('#farm-list'),
  runningCount: document.querySelector('#running-count'),
  waitingCount: document.querySelector('#waiting-count'),
  completedCount: document.querySelector('#completed-count'),
  lastUpdated: document.querySelector('#last-updated'),
  statusPanel: document.querySelector('#status-panel'),
  statusMessage: document.querySelector('#status-message'),
  retryButton: document.querySelector('#retry-button')
};

function formatThaiDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function createTextElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function calculateProgress(farm, nowMs) {
  if (farm.status === 'completed') return 100;
  if (farm.status !== 'running') return 0;

  const startMs = Date.parse(farm.start_at ?? '');
  const endMs = Date.parse(farm.end_at ?? '');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;

  const progress = ((nowMs - startMs) / (endMs - startMs)) * 100;
  return Math.min(100, Math.max(0, progress));
}

function countdownText(farm, nowMs) {
  if (farm.status === 'waiting') return 'รอร้านเริ่มงาน';
  if (farm.status === 'completed') return 'เสร็จเรียบร้อย';
  if (farm.status === 'stopped') return 'หยุดฟาร์มแล้ว';

  const endMs = Date.parse(farm.end_at ?? '');
  if (!Number.isFinite(endMs)) return '-';
  if (endMs <= nowMs) return 'รอระบบยืนยัน';
  return formatRemaining(endMs - nowMs);
}

function makeDetail(label, value) {
  const item = document.createElement('div');
  item.className = 'detail-item';
  item.append(
    createTextElement('span', 'detail-label', label),
    createTextElement('span', 'detail-value', value)
  );
  return item;
}

function createFarmCard(farm, nowMs) {
  const displayStatus = deriveDisplayStatus(farm, nowMs);
  const card = document.createElement('article');
  card.className = 'farm-card';
  card.dataset.displayStatus = displayStatus.key;

  const top = document.createElement('div');
  top.className = 'card-top';

  const identity = document.createElement('div');
  identity.append(
    createTextElement('span', 'farm-number', formatFarmId(farm.id)),
    createTextElement('h3', 'roblox-name', farm.roblox || 'ยังไม่ได้ระบุชื่อ Roblox')
  );

  const badge = createTextElement('span', 'status-badge', displayStatus.label);
  top.append(identity, badge);

  const details = document.createElement('div');
  details.className = 'card-details';
  details.append(
    makeDetail('แพ็กเกจ', `${farm.hours ?? 0} ชั่วโมง`),
    makeDetail('เริ่มงาน', formatThaiDate(farm.start_at)),
    makeDetail('กำหนดเสร็จ', formatThaiDate(farm.end_at))
  );

  const countdown = document.createElement('div');
  countdown.className = 'countdown-wrap';

  const countdownRow = document.createElement('div');
  countdownRow.className = 'countdown-row';
  countdownRow.append(
    createTextElement('span', 'countdown-label', farm.status === 'running' ? 'เวลาคงเหลือ' : 'สถานะเวลา'),
    createTextElement('strong', 'countdown-value', countdownText(farm, nowMs))
  );

  const track = document.createElement('div');
  track.className = 'progress-track';
  track.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.style.width = `${calculateProgress(farm, nowMs).toFixed(1)}%`;
  track.append(fill);

  countdown.append(countdownRow, track);
  card.append(top, details, countdown);
  return card;
}

function filteredFarms() {
  return sortFarms(state.farms).filter((farm) => {
    const filterMatches = state.filter === 'all' || farm.status === state.filter;
    return filterMatches && matchesSearch(farm, state.query);
  });
}

function renderSummary() {
  elements.runningCount.textContent = String(state.farms.filter((farm) => farm.status === 'running').length);
  elements.waitingCount.textContent = String(state.farms.filter((farm) => farm.status === 'waiting').length);
  elements.completedCount.textContent = `${state.completedCount} งาน`;
}

function renderFarmList() {
  const nowMs = Date.now();
  const farms = filteredFarms();
  clearChildren(elements.list);
  elements.list.setAttribute('aria-busy', 'false');

  if (farms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.append(
      createTextElement('strong', '', state.query ? 'ไม่พบรายการที่ค้นหา' : 'ตอนนี้ยังไม่มีคิวฟาร์ม'),
      createTextElement('span', '', state.query ? 'ลองตรวจสอบชื่อ Roblox หรือหมายเลข FARM อีกครั้ง' : 'เมื่อร้านเริ่มรับงาน รายการจะปรากฏที่นี่')
    );
    elements.list.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const farm of farms) fragment.append(createFarmCard(farm, nowMs));
  elements.list.append(fragment);
}

function renderLoading() {
  clearChildren(elements.list);
  elements.list.setAttribute('aria-busy', 'true');
  for (let index = 0; index < 4; index += 1) {
    const card = document.createElement('div');
    card.className = 'farm-card loading-card';
    card.setAttribute('aria-hidden', 'true');
    elements.list.append(card);
  }
}

function renderMeta() {
  if (!state.lastUpdated) {
    elements.lastUpdated.textContent = 'กำลังโหลดข้อมูล...';
    return;
  }
  elements.lastUpdated.textContent = `อัปเดตล่าสุด ${formatThaiDate(state.lastUpdated)}`;
}

function renderError() {
  elements.statusPanel.hidden = !state.error;
  elements.statusMessage.textContent = state.error ?? '';
}

function render() {
  renderSummary();
  renderMeta();
  renderError();
  if (state.loading && state.farms.length === 0) renderLoading();
  else renderFarmList();
}

async function loadFarms({ quiet = false } = {}) {
  if (!quiet) state.loading = true;
  state.error = null;
  render();

  try {
    const [farms, stats] = await Promise.all([
      fetchPublicFarms(window.AXBIM_CONFIG ?? {}),
      fetchPublicFarmStats(window.AXBIM_CONFIG ?? {})
    ]);
    state.farms = farms;
    state.completedCount = stats.completedCount;
    state.lastUpdated = new Date().toISOString();
  } catch (error) {
    state.error = error instanceof Error
      ? error.message
      : 'ไม่สามารถโหลดสถานะได้ กรุณาลองใหม่อีกครั้ง';
  } finally {
    state.loading = false;
    render();
  }
}

elements.search.addEventListener('input', (event) => {
  state.query = event.target.value;
  renderFarmList();
});

for (const button of elements.filters) {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter ?? 'all';
    for (const item of elements.filters) {
      item.classList.toggle('is-active', item === button);
    }
    renderFarmList();
  });
}

elements.retryButton.addEventListener('click', () => loadFarms());

loadFarms();
setInterval(() => loadFarms({ quiet: true }), DATA_REFRESH_MS);
setInterval(() => {
  if (!state.loading && !state.error) renderFarmList();
}, COUNTDOWN_REFRESH_MS);
