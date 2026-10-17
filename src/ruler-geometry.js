// Righello: geometria pura condivisa tra orientamento e guida Pencil.
// Adattamento al rettangolo visibile basato sul righello di Note Marco 0.1.85.
export const RULER_MARGIN_PX = 12;
export const RULER_BODY_HEIGHT_PX = 76;
export const RULER_INK_CAPTURE_PX = 42;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function fitRulerToWritableArea(screenWidth, writableHeight, angleDeg, margin = RULER_MARGIN_PX) {
  const w = Math.max(1, Number(screenWidth) || 1);
  const h = Math.max(1, Number(writableHeight) || 1);
  const inset = Math.max(0, Math.min(margin, (Math.min(w, h) - 1) / 2));
  const usableW = w - 2 * inset;
  const usableH = h - 2 * inset;
  const height = Math.min(RULER_BODY_HEIGHT_PX, usableW, usableH);
  const rad = (Number(angleDeg) || 0) * Math.PI / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const limitX = c > 1e-8 ? (usableW - s * height) / c : Infinity;
  const limitY = s > 1e-8 ? (usableH - c * height) / s : Infinity;
  // Nessun limite fisso da 720 px: il righello occupa la lunghezza massima
  // consentita dalla sua inclinazione e dall'area realmente visibile.
  const width = Math.max(1, Math.min(Math.hypot(usableW, usableH), limitX, limitY));
  return {
    width, height, margin: inset,
    boundingWidth: c * width + s * height,
    boundingHeight: s * width + c * height
  };
}

/**
 * Proietta un contatto della Pencil su uno dei due bordi graduati.
 * edge='auto' acquisisce la guida solo vicino al righello; durante il movimento
 * si riusa il medesimo bordo e non si cambia lato a metà del tratto.
 */
export function snapPointToRulerEdge(clientX, clientY, geometry, edge = 'auto') {
  const { rect, centerX, centerY, angleDeg, width, height } = geometry;
  if (!rect?.width || !rect?.height || !width || !height) return null;
  const rad = (Number(angleDeg) || 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = clientX - (rect.left + centerX);
  const dy = clientY - (rect.top + centerY);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  // La parte terminale destra ospita il comando di rotazione.
  const minX = -width / 2 + 12;
  const maxX = Math.max(minX, width / 2 - 54);
  const topY = -height / 2 + 6;
  const bottomY = height / 2 - 6;
  const side = edge === 'top' || edge === 'bottom'
    ? edge : Math.abs(localY - topY) <= Math.abs(localY - bottomY) ? 'top' : 'bottom';
  const borderY = side === 'top' ? topY : bottomY;
  if (edge === 'auto' && (
    localX < minX - RULER_INK_CAPTURE_PX ||
    localX > maxX + RULER_INK_CAPTURE_PX ||
    Math.abs(localY - borderY) > RULER_INK_CAPTURE_PX
  )) return null;
  const borderX = clamp(localX, minX, maxX);
  const paperX = centerX + cos * borderX - sin * borderY;
  const paperY = centerY + sin * borderX + cos * borderY;
  return {
    edge:side,
    point:{
      x:clamp(paperX / rect.width, 0, 1),
      y:clamp(paperY / rect.height, 0, 1)
    }
  };
}

/**
 * Area di controllo tattile del righello. La decisione dipende dall'asse LOCALE
 * del righello (non dalla direzione dello schermo), quindi resta corretta dopo
 * ogni rotazione. Il 20% di ciascuna estremita' e' dedicato alla rotazione;
 * su righelli lunghi la zona non supera 110 px per evitare tocchi involontari.
 * La Pencil resta gestita esclusivamente da snapPointToRulerEdge.
 */
export function rulerTouchAction(clientX, clientY, geometry) {
  const { rect, centerX, centerY, angleDeg, width } = geometry;
  if (!rect || !Number.isFinite(width) || width <= 0) return 'move';
  const rad = (Number(angleDeg) || 0) * Math.PI / 180;
  const dx = clientX - (rect.left + centerX);
  const dy = clientY - (rect.top + centerY);
  const localX = dx * Math.cos(rad) + dy * Math.sin(rad);
  const terminalZone = Math.min(width * 0.20, 110);
  return Math.abs(localX) >= width / 2 - terminalZone ? 'rotate' : 'move';
}

/** Differenza angolare minima: gestisce correttamente -180/+180 e il lato sinistro. */
export function rulerSignedAngleDelta(previousDeg, currentDeg) {
  return ((currentDeg - previousDeg + 540) % 360) - 180;
}
