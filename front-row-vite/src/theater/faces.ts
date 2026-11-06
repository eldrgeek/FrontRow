// A guest's default face: their initials on a playbill card. A seat always
// shows who is sitting there; a camera photo is the guest's choice.
export function initialsFace(name: string, size = 256): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() || '')
    .join('') || '?';
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (!g) return '';
    g.fillStyle = '#f4ead3';
    g.fillRect(0, 0, size, size);
    g.strokeStyle = '#d4af37';
    g.lineWidth = size * 0.05;
    g.strokeRect(size * 0.06, size * 0.06, size * 0.88, size * 0.88);
    g.fillStyle = '#2a0812';
    g.font = `700 ${Math.round(size * (initials.length > 1 ? 0.38 : 0.46))}px "Playfair Display", Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(initials, size / 2, size * 0.53);
    return c.toDataURL('image/png');
  } catch {
    return '';
  }
}
