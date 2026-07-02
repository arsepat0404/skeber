import jsPDF from "jspdf";

interface PlayerLite { id: string; nickname: string; }
interface StepLite {
  id: string; chain_owner_id: string; author_id: string;
  step_index: number; kind: string;
  text_content: string | null; drawing_data: string | null;
}

function authorName(players: PlayerLite[], id: string) {
  return players.find((p) => p.id === id)?.nickname ?? "?";
}

function stepLabel(kind: string) {
  if (kind === "sentence") return "Kalimat";
  if (kind === "drawing") return "Gambar";
  return "Tebakan";
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Render one chain to a single PNG data URL with player names + step order */
export async function renderChainPng(
  chainOwner: PlayerLite,
  chainSteps: StepLite[],
  players: PlayerLite[]
): Promise<string> {
  const W = 900;
  const cardH = 320;
  const headerH = 110;
  const padding = 24;
  const H = headerH + chainSteps.length * (cardH + padding) + padding;

  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const ctx = cvs.getContext("2d")!;

  // Background
  ctx.fillStyle = "#1B4332";
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = "#FFFF00";
  ctx.font = "bold 36px sans-serif";
  ctx.fillText("SkeBer", padding, 50);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "20px sans-serif";
  ctx.fillText(`Cerita milik ${chainOwner.nickname}`, padding, 85);

  let y = headerH;
  for (let i = 0; i < chainSteps.length; i++) {
    const s = chainSteps[i];
    // Card
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(padding, y, W - padding * 2, cardH);

    // Label
    ctx.fillStyle = "#1B4332";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(`#${i + 1} · ${stepLabel(s.kind)} oleh ${authorName(players, s.author_id)}`, padding + 16, y + 30);

    if (s.drawing_data) {
      try {
        const img = await loadImage(s.drawing_data);
        const maxH = cardH - 60;
        const ratio = Math.min((W - padding * 2 - 32) / img.width, maxH / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        ctx.drawImage(img, padding + (W - padding * 2 - w) / 2, y + 50, w, h);
      } catch {}
    } else if (s.text_content) {
      ctx.fillStyle = "#1B4332";
      ctx.font = "italic 26px serif";
      const text = `"${s.text_content}"`;
      // Word-wrap
      const maxWidth = W - padding * 2 - 32;
      const words = text.split(" ");
      let line = "";
      let ty = y + 100;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxWidth) {
          ctx.fillText(line, padding + 16, ty);
          ty += 36;
          line = w;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, padding + 16, ty);
    }

    y += cardH + padding;
  }

  return cvs.toDataURL("image/png");
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Build a PDF containing every chain (one chain per page section). */
export async function exportGalleryPdf(
  players: PlayerLite[],
  steps: StepLite[],
  filename = "SkeBer-Galeri.pdf"
) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < players.length; i++) {
    const owner = players[i];
    const chainSteps = steps
      .filter((s) => s.chain_owner_id === owner.id)
      .sort((a, b) => a.step_index - b.step_index);
    if (chainSteps.length === 0) continue;

    const png = await renderChainPng(owner, chainSteps, players);
    if (i > 0) pdf.addPage();

    // Fit the rendered image into the page
    const img = await loadImage(png);
    const ratio = Math.min(pageW / img.width, pageH / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    pdf.addImage(png, "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);
  }

  pdf.save(filename);
}
