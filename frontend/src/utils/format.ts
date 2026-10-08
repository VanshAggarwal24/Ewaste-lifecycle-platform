export const format = {
  datetime: (s: string | null | undefined) => {
    if (!s) return '—';
    return new Date(s).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  },
  date: (s: string | null | undefined) => {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  },
  weight: (kg: number | null | undefined) => {
    if (kg == null) return '—';
    return `${kg.toFixed(2)} kg`;
  },
};
