const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function formatFarmId(id) {
  const numericId = Number(id);
  const safeId = Number.isFinite(numericId) ? Math.trunc(numericId) : 0;
  return `FARM-${String(safeId).padStart(3, '0')}`;
}

export function formatRemaining(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');

  return days > 0 ? `${days} วัน ${clock}` : clock;
}

export function deriveDisplayStatus(farm, nowMs = Date.now()) {
  const status = farm?.status ?? 'waiting';

  if (status === 'running') {
    const endMs = Date.parse(farm?.end_at ?? '');

    if (Number.isFinite(endMs)) {
      const remaining = endMs - nowMs;
      if (remaining <= 0) {
        return { key: 'pending', label: '⏳ รอระบบยืนยัน' };
      }
      if (remaining <= HOUR_MS) {
        return { key: 'ending', label: '🟠 ใกล้หมดเวลา' };
      }
    }

    return { key: 'running', label: '🔵 กำลังฟาร์ม' };
  }

  if (status === 'completed') {
    return { key: 'completed', label: '✅ เสร็จแล้ว' };
  }

  if (status === 'stopped') {
    return { key: 'stopped', label: '🔴 หยุดฟาร์ม' };
  }

  return { key: 'waiting', label: '🟡 รอเริ่ม' };
}

export function matchesSearch(farm, query) {
  const normalized = String(query ?? '').trim().toLowerCase();
  if (!normalized) return true;

  const username = String(farm?.roblox ?? '').toLowerCase();
  const id = String(farm?.id ?? '');
  const farmId = formatFarmId(farm?.id).toLowerCase();

  return username.includes(normalized)
    || id === normalized
    || farmId.includes(normalized);
}

function timeValue(value, fallback) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sortFarms(farms) {
  const priority = {
    running: 0,
    waiting: 1,
    completed: 2,
    stopped: 3
  };

  return [...(farms ?? [])].sort((a, b) => {
    const aPriority = priority[a?.status] ?? 4;
    const bPriority = priority[b?.status] ?? 4;

    if (aPriority !== bPriority) return aPriority - bPriority;

    if (a?.status === 'running') {
      return timeValue(a.end_at, Number.POSITIVE_INFINITY)
        - timeValue(b.end_at, Number.POSITIVE_INFINITY)
        || Number(a.id) - Number(b.id);
    }

    if (a?.status === 'waiting') {
      return Number(a.id) - Number(b.id);
    }

    if (a?.status === 'completed' || a?.status === 'stopped') {
      return timeValue(b.end_at ?? b.start_at, Number.NEGATIVE_INFINITY)
        - timeValue(a.end_at ?? a.start_at, Number.NEGATIVE_INFINITY)
        || Number(b.id) - Number(a.id);
    }

    return Number(a.id) - Number(b.id);
  });
}
