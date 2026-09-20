export const choices = (rows: { id: string; name: string }[]) =>
  rows.map((r) => ({ value: r.id, label: r.name }));
