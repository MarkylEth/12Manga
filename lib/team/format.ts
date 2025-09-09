// lib/team/format.ts

export function formatK(n: number): string {
    if (n >= 1000) {
      const k = (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace('.0', '');
      return `${k}K`;
    }
    return String(n);
  }