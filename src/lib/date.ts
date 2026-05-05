function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function todayIso(): string {
  return toIso(new Date());
}

export function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIso(d);
}

export function parseUserDate(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  if (s === "today") return todayIso();
  if (s === "yesterday") return daysAgoIso(1);

  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (isValidYmd(y, m, d)) return `${y}-${pad(m)}-${pad(d)}`;
    return null;
  }

  const md = s.match(/^(\d{1,2})[-\/](\d{1,2})$/);
  if (md) {
    const y = new Date().getFullYear();
    const m = Number(md[1]);
    const d = Number(md[2]);
    if (isValidYmd(y, m, d)) return `${y}-${pad(m)}-${pad(d)}`;
    return null;
  }

  return null;
}

export function formatDateLabel(iso: string): string {
  const today = todayIso();
  const yesterday = daysAgoIso(1);
  if (iso === today) return `Today (${iso})`;
  if (iso === yesterday) return `Yesterday (${iso})`;
  return iso;
}
