/**
 * Shared invoice PDF generator.
 * Pass the #invoice-print-area HTMLElement (from any page or iframe).
 * Returns a Blob or null on failure.
 */
async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateInvoicePdfBlob(el: HTMLElement): Promise<Blob | null> {
  try {
    const [html2canvasModule, jspdfModule, logoDataUrl] = await Promise.all([
      import("html2canvas").then(m => m.default),
      import("jspdf"),
      fetchLogoDataUrl(),
    ]);
    const html2canvas = html2canvasModule;
    const { jsPDF } = jspdfModule;
    const A4_PX = 794;
    const SCALE = 2;

    // Temporarily resize to A4 width to measure exact row boundary positions
    const prevW = el.style.width, prevMin = el.style.minWidth, prevMax = el.style.maxWidth;
    el.style.width = `${A4_PX}px`;
    el.style.minWidth = `${A4_PX}px`;
    el.style.maxWidth = `${A4_PX}px`;
    el.getBoundingClientRect(); // force reflow
    const elRect = el.getBoundingClientRect();
    const elTop = elRect.top;

    // Measure TAX INVOICE banner (thead) — repeated at top of every page after page 1
    const theadRowEl = el.querySelector("thead tr") as HTMLElement | null;
    const theadTop = theadRowEl ? Math.round((theadRowEl.getBoundingClientRect().top - elTop) * SCALE) : 0;
    const theadH   = theadRowEl ? Math.round(theadRowEl.getBoundingClientRect().height * SCALE) : 0;

    // Measure footer row (tfoot) — appended at bottom of every non-last page
    const tfootRowEl = el.querySelector("tfoot tr") as HTMLElement | null;
    const tfootTop = tfootRowEl ? Math.round((tfootRowEl.getBoundingClientRect().top - elTop) * SCALE) : 0;
    const tfootH   = tfootRowEl ? Math.round(tfootRowEl.getBoundingClientRect().height * SCALE) : 0;

    // tbody row bottoms — safe split boundaries (tfoot is NOT a split point)
    const tbodySplitPoints = Array.from(el.querySelectorAll("tbody tr")).map(
      (row) => Math.round(((row as HTMLElement).getBoundingClientRect().bottom - elTop) * SCALE)
    );
    const lastTbodyBottom = tbodySplitPoints[tbodySplitPoints.length - 1] ?? 0;

    el.style.width = prevW;
    el.style.minWidth = prevMin;
    el.style.maxWidth = prevMax;

    const canvas = await html2canvas(el, {
      scale: SCALE, useCORS: true, backgroundColor: "#fff",
      width: A4_PX, windowWidth: A4_PX,
      onclone: (clonedDoc) => {
        clonedDoc.documentElement.classList.remove("dark");
        const printEl = clonedDoc.getElementById("invoice-print-area");
        if (!printEl) return;
        printEl.style.width = `${A4_PX}px`;
        printEl.style.minWidth = `${A4_PX}px`;
        printEl.style.maxWidth = `${A4_PX}px`;

        // Replace Next.js optimized img src with a plain data URL so
        // html2canvas can load it reliably on all devices (incl. mobile).
        if (logoDataUrl) {
          printEl.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
            if (img.src.includes("logo") || img.getAttribute("alt")?.toLowerCase().includes("logo")) {
              img.src = logoDataUrl;
              img.style.width = "36px";
              img.style.height = "36px";
              img.style.objectFit = "contain";
              img.style.flexShrink = "0";
            }
          });
        }

        // Border color — matches the @media print override in the invoice detail page CSS
        const BD = "#64748b";

        // Fix borders: switch to separate+0 spacing with single-side borders so
        // html2canvas never doubles them and CSS vars resolve to a real color.
        printEl.querySelectorAll<HTMLElement>("table").forEach((t) => {
          t.style.borderCollapse = "separate";
          t.style.borderSpacing = "0";
        });
        // All cells: right + bottom only
        printEl.querySelectorAll<HTMLElement>("td, th").forEach((c) => {
          if (c.style.border || c.style.borderTop || c.style.borderLeft || c.style.borderRight || c.style.borderBottom) {
            c.style.border = "none";
            c.style.borderRight = `1px solid ${BD}`;
            c.style.borderBottom = `1px solid ${BD}`;
          }
        });
        // First row in each table → add top border
        printEl.querySelectorAll<HTMLElement>("table").forEach((t) => {
          const firstRow = t.querySelector("tr");
          if (firstRow) {
            firstRow.querySelectorAll<HTMLElement>("td, th").forEach((c) => {
              if (c.style.borderRight) c.style.borderTop = `1px solid ${BD}`;
            });
          }
        });
        // Only add left border to cells that start at visual column 0.
        // rowSpan cells must not bleed across thead/tbody/tfoot section boundaries.
        const occupied: Record<string, boolean> = {};
        const colStartMap = new WeakMap<HTMLElement, number>();
        const sectionRowCounters: Record<string, number> = {};
        const sections = Array.from(printEl.querySelectorAll("thead,tbody,tfoot"));
        printEl.querySelectorAll<HTMLElement>("tr").forEach((row) => {
          const section = row.parentElement as HTMLElement;
          const sectionKey = section.tagName + "_" + sections.indexOf(section);
          if (sectionRowCounters[sectionKey] === undefined) sectionRowCounters[sectionKey] = 0;
          const rIdx = sectionRowCounters[sectionKey];
          const key = (r: number, c: number) => `${sectionKey}_${r},${c}`;
          let col = 0;
          row.querySelectorAll<HTMLElement>(":scope > td, :scope > th").forEach((cell) => {
            while (occupied[key(rIdx, col)]) col++;
            colStartMap.set(cell, col);
            const rs = (cell as HTMLTableCellElement).rowSpan || 1;
            const cs = (cell as HTMLTableCellElement).colSpan || 1;
            for (let r = 0; r < rs; r++)
              for (let c = 0; c < cs; c++)
                occupied[key(rIdx + r, col + c)] = true;
            col += cs;
          });
          sectionRowCounters[sectionKey]++;
        });
        printEl.querySelectorAll<HTMLElement>("td, th").forEach((cell) => {
          if (colStartMap.get(cell) === 0 && cell.style.borderRight)
            cell.style.borderLeft = `1px solid ${BD}`;
        });
      },
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const M = 0.8; // ~3px margin all sides
    const contentW = pageW - M * 2;
    const contentH = pageH - M * 2;
    const mmPerPx = contentW / canvas.width;
    const pageHeightPx = Math.floor(contentH / mmPerPx);
    const page2HeightPx = pageHeightPx - theadH; // pages 2+ have the TAX INVOICE banner

    // Slice a strip from the canvas. Optionally prepend header and/or append footer.
    const slicePage = (startPx: number, endPx: number, withHeader: boolean, appendFooter: boolean) => {
      const sliceH = endPx - startPx;
      const hdrH  = withHeader   ? theadH : 0;
      const ftrH  = appendFooter ? tfootH : 0;
      const totalH = hdrH + sliceH + ftrH;
      const pc = document.createElement("canvas");
      pc.width  = canvas.width;
      pc.height = totalH;
      const ctx = pc.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, totalH);
      let y = 0;
      if (withHeader) {
        ctx.drawImage(canvas, 0, theadTop, canvas.width, theadH, 0, y, canvas.width, theadH);
        y += theadH;
      }
      ctx.drawImage(canvas, 0, startPx, canvas.width, sliceH, 0, y, canvas.width, sliceH);
      y += sliceH;
      if (appendFooter && tfootH > 0) {
        ctx.drawImage(canvas, 0, tfootTop, canvas.width, tfootH, 0, y, canvas.width, tfootH);
      }
      return { dataUrl: pc.toDataURL("image/jpeg", 0.95), totalH };
    };

    if (canvas.height <= pageHeightPx) {
      const { dataUrl, totalH } = slicePage(0, canvas.height, false, false);
      pdf.addImage(dataUrl, "JPEG", M, M, contentW, totalH * mmPerPx);
    } else {
      // Pass 1: compute split points, reserving tfootH on every non-last page
      const pageSplits: number[] = [];
      {
        let start = 0, pNum = 0;
        while (start < canvas.height) {
          const fullAvail    = pNum === 0 ? pageHeightPx : page2HeightPx;
          const contentAvail = fullAvail - tfootH;
          const idealEnd = Math.min(start + contentAvail, canvas.height);
          let splitAt = idealEnd;
          if (idealEnd < canvas.height) {
            const safe = tbodySplitPoints.filter(b => b > start && b <= idealEnd);
            splitAt = safe.length > 0 ? safe[safe.length - 1] : idealEnd;
            if (splitAt >= lastTbodyBottom) {
              if (canvas.height - start <= fullAvail) {
                splitAt = canvas.height;
              } else {
                const prev = tbodySplitPoints.filter(b => b > start && b < lastTbodyBottom);
                if (prev.length > 0) splitAt = prev[prev.length - 1];
              }
            }
          }
          pageSplits.push(splitAt);
          start = splitAt;
          pNum++;
        }
      }

      // Pass 2: render — append footer on all pages except the last
      let start = 0;
      pageSplits.forEach((splitAt, i) => {
        const isLast       = i === pageSplits.length - 1;
        const withHeader   = i > 0;
        const appendFooter = !isLast && tfootH > 0;
        if (i > 0) pdf.addPage();
        const { dataUrl, totalH } = slicePage(start, splitAt, withHeader, appendFooter);
        pdf.addImage(dataUrl, "JPEG", M, M, contentW, totalH * mmPerPx);
        start = splitAt;
      });
    }

    return pdf.output("blob");
  } catch {
    return null;
  }
}
