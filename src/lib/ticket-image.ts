const WIDTH = 1950;
const HEIGHT = 810;
const RED = "#A30D1B";
const NAVY = "#0B1B4A";
const TITLE_Y = 290;
const STUB_X = 1440;
const SPLIT_X = 1424;
const FONT = "Poppins, Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

export interface TicketImageInput {
  title: string;
  date: string;
  time: string;
  location?: string;
  badge: string;
  bookingRef: string;
  qrDataUrl: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Shrinks the font until `text` fits `maxWidth`, so long event titles don't
// overflow the ticket.
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  startSize: number,
  maxWidth: number,
) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${FONT}`;
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size > 28);
}

// Greedy word wrap into at most `maxLines`; the last line is truncated with an
// ellipsis if the text still doesn't fit.
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  maxWidth: number,
  maxLines: number,
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`;
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

export async function renderTicketPng(input: TicketImageInput): Promise<Blob> {
  const [logo, qr] = await Promise.all([
    loadImage("/ticket-logos.png"),
    loadImage(input.qrDataUrl),
  ]);
  if (document.fonts?.ready) await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");

  // Ticket shape: rounded card with semicircular notches at the perforation.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  roundRect(ctx, 38, 42, WIDTH - 76, HEIGHT - 84, 44);
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#F7F7F9";
  ctx.fillRect(STUB_X - 16, 0, WIDTH, HEIGHT);

  // Soft sun disc behind the content, kept inside the main panel.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, SPLIT_X - 14, HEIGHT);
  ctx.clip();
  ctx.fillStyle = "#FDF0EB";
  ctx.beginPath();
  ctx.arc(1230, 470, 270, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Top-right corner stripes.
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(1180, 42);
  ctx.lineTo(1290, 42);
  ctx.lineTo(1375, 150);
  ctx.lineTo(1345, 175);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.moveTo(1300, 42);
  ctx.lineTo(1395, 42);
  ctx.lineTo(1395, 140);
  ctx.closePath();
  ctx.fill();

  // Bottom red wave with the tagline.
  ctx.fillStyle = "rgba(163,13,27,0.15)";
  ctx.beginPath();
  ctx.moveTo(38, 560);
  ctx.bezierCurveTo(500, 500, 800, 680, 1410, 690);
  ctx.lineTo(1410, 760);
  ctx.lineTo(38, 760);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(38, 600);
  ctx.bezierCurveTo(450, 520, 850, 690, 1410, 650);
  ctx.lineTo(1410, 760);
  ctx.lineTo(38, 760);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `500 25px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText(
    "NETWORK   |   LEARN   |   COLLABORATE   |   BUILD   |   GROW",
    112,
    709,
  );

  // Logo.
  const logoW = 480;
  const logoH = (logo.height / logo.width) * logoW;
  ctx.drawImage(logo, 100, 60, logoW, logoH);

  // Title wraps to at most two lines; first word red, remainder navy.
  ctx.textBaseline = "alphabetic";
  const maxTitleW = 1220;
  // Largest size at which the whole title fits in three lines.
  const title = input.title.trim();
  let titleSize = 64;
  let lines = wrapText(ctx, title, 800, titleSize, maxTitleW, 3);
  while (lines[lines.length - 1].endsWith("…") && titleSize > 34) {
    titleSize -= 2;
    lines = wrapText(ctx, title, 800, titleSize, maxTitleW, 3);
  }
  const lineHeight = titleSize * 1.15;
  lines.forEach((line, i) => {
    const y = TITLE_Y + i * lineHeight;
    ctx.font = `800 ${titleSize}px ${FONT}`;
    if (i === 0) {
      const [first, ...others] = line.split(" ");
      const head = first + (others.length ? " " : "");
      ctx.fillStyle = RED;
      ctx.fillText(first, 102, y);
      ctx.fillStyle = NAVY;
      ctx.fillText(others.join(" "), 102 + ctx.measureText(head).width, y);
    } else {
      ctx.fillStyle = NAVY;
      ctx.fillText(line, 102, y);
    }
  });
  const lastBase = TITLE_Y + (lines.length - 1) * lineHeight;
  ctx.fillStyle = RED;
  roundRect(ctx, 104, lastBase + 26, 150, 7, 4);
  ctx.fill();

  // Backend-provided details.
  const dateY = lastBase + 86;
  ctx.fillStyle = NAVY;
  ctx.font = `500 36px ${FONT}`;
  ctx.fillText(`${input.date}  ·  ${input.time}`, 104, dateY);
  if (input.location) {
    ctx.fillStyle = RED;
    fitFont(ctx, input.location, 600, 32, maxTitleW);
    ctx.fillText(input.location, 104, dateY + 46);
  }
  ctx.restore();

  // Perforation.
  ctx.save();
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(SPLIT_X, 80);
  ctx.lineTo(SPLIT_X, HEIGHT - 80);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#FFFFFF";
  for (const y of [42, HEIGHT - 42]) {
    ctx.beginPath();
    ctx.arc(SPLIT_X, y, 36, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stub: badge + QR.
  ctx.fillStyle = RED;
  roundRect(ctx, STUB_X, 42, 470, 190, 30);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  const badge = input.badge.toUpperCase();
  fitFont(ctx, badge, 800, 76, 400);
  ctx.fillText(badge, STUB_X + 235, 160);
  ctx.fillRect(STUB_X + 130, 186, 210, 4);

  const qrSize = 260;
  const qrX = STUB_X + (470 - qrSize) / 2;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(qrX - 12, 282, qrSize + 24, qrSize + 24);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, qrX, 294, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = NAVY;
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText(input.bookingRef, STUB_X + 235, 650);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
      "image/png",
    ),
  );
}
