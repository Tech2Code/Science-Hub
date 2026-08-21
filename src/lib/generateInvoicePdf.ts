/**
 * Shared invoice PDF generator — pass the #invoice-print-area element, returns a Blob or null on failure.
 * `copyLabels` concatenates multiple labeled copies (e.g. ORIGINAL/DUPLICATE) into one PDF, each with its
 * own independent "Page No. X of Y" count (not a grand total across copies).
 */
// Border color — matches the @media print override in the invoice detail page CSS
const BD = "#64748b";

async function fetchLogoDataUrl(logoUrl?: string): Promise<string | null> {
  try {
    const res = await fetch(logoUrl || "/logo.png");
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

export async function generateInvoicePdfBlob(
  el: HTMLElement,
  options?: { copyLabels?: string[]; logoUrl?: string }
): Promise<Blob | null> {
  const copyLabels = options?.copyLabels?.length ? options.copyLabels : [null];
  try {
    const [html2canvasModule, jspdfModule, logoDataUrl] = await Promise.all([
      import("html2canvas").then(m => m.default),
      import("jspdf"),
      fetchLogoDataUrl(options?.logoUrl),
    ]);
    const html2canvas = html2canvasModule;
    const { jsPDF } = jspdfModule;
    const A4_PX = 794;
    const SCALE = 2;
    // Cushion for live-DOM row measurements vs. the actual html2canvas capture (font metrics/rounding),
    // so the footer never ends up pinned right at/past the page edge.
    const FOOTER_MARGIN_PX = 6 * SCALE;
    // Extra slack for the last body row on a page — guards against a borderline-width cell wrapping
    // to an extra line in the actual capture that it didn't in the live measurement.
    const ROW_SAFETY_MARGIN_PX = Math.round(9 * 1.3 * SCALE);

    // Temporarily resize to A4 width to measure exact row boundaries — identical across copies since
    // the copy-label badge is an absolutely positioned overlay that doesn't affect flow.
    const prevW = el.style.width, prevMin = el.style.minWidth, prevMax = el.style.maxWidth;
    el.style.width = `${A4_PX}px`;
    el.style.minWidth = `${A4_PX}px`;
    el.style.maxWidth = `${A4_PX}px`;
    el.getBoundingClientRect(); // force reflow
    const elRect = el.getBoundingClientRect();
    const elTop = elRect.top;
    const elLeft = elRect.left;

    // Measure the outer table's left/right edges, so the pinned-footer
    // render can draw connecting border lines through the blank gap above it.
    const tableEl = el.querySelector("table") as HTMLElement | null;
    const tableRect = tableEl?.getBoundingClientRect();
    const tableLeftPx  = tableRect ? Math.round((tableRect.left  - elLeft) * SCALE) : 0;
    const tableRightPx = tableRect ? Math.round((tableRect.right - elLeft) * SCALE) : 0;

    // Measure TAX INVOICE banner (thead) — repeated at top of every page after page 1
    const theadRowEl = el.querySelector("thead tr") as HTMLElement | null;
    const theadTop = theadRowEl ? Math.round((theadRowEl.getBoundingClientRect().top - elTop) * SCALE) : 0;
    const theadH   = theadRowEl ? Math.round(theadRowEl.getBoundingClientRect().height * SCALE) : 0;

    // Measure footer row (tfoot) — appended at bottom of every non-last page
    const tfootRowEl = el.querySelector("tfoot tr") as HTMLElement | null;
    const tfootTop = tfootRowEl ? Math.round((tfootRowEl.getBoundingClientRect().top - elTop) * SCALE) : 0;
    const tfootOwnBottom = tfootRowEl ? Math.round((tfootRowEl.getBoundingClientRect().bottom - elTop) * SCALE) : 0;

    // "Page No. X of Y" marker band below the tfoot — deliberately not a DOM element (which would
    // either show stale numbers on-screen or desync measurements if hidden); it's blank canvas
    // background until stampPageMarker draws into it. MARKER_GAP_PX matches the copy badge's 4px padding.
    const MARKER_GAP_PX = 4 * SCALE;
    // Must stay >= MARKER_GAP_PX + the font's rendered glyph height, or text clips into the next page.
    const MARKER_ROW_H = 14 * SCALE;
    const MARKER_RIGHT_PAD_PX = 6 * SCALE; // inset from the table's own right border
    const tfootH = tfootRowEl ? (tfootOwnBottom - tfootTop) + MARKER_ROW_H : 0;
    const pmRightPx     = tableRightPx;
    const pmOffsetTopPx = tfootOwnBottom - tfootTop; // band starts right after the tfoot's real content
    const pmWidthPx     = tableRightPx - tableLeftPx;
    const pmHeightPx    = MARKER_ROW_H;

    // tbody row bottoms — safe split boundaries (tfoot is NOT a split point)
    let tbodySplitPoints = Array.from(el.querySelectorAll("tbody tr")).map(
      (row) => Math.round(((row as HTMLElement).getBoundingClientRect().bottom - elTop) * SCALE)
    );
    const lastTbodyBottom = tbodySplitPoints[tbodySplitPoints.length - 1] ?? 0;

    // The closing Totals/Bank/Terms/Signature block shares one rowSpan'd cell across several <tr>s —
    // slicing between them would crop that cell's content dead. Drop interior boundaries so the block
    // only splits at its start (pushed whole to the next page) or not at all; scoped to its own <tbody>.
    const summaryStartRowEl = el.querySelector('tbody tr[data-invoice-summary-start]') as HTMLElement | null;
    if (summaryStartRowEl) {
      const summaryStartTop = Math.round((summaryStartRowEl.getBoundingClientRect().top - elTop) * SCALE);
      const summaryTbody = summaryStartRowEl.closest("tbody");
      const summaryTbodyRows = summaryTbody ? Array.from(summaryTbody.querySelectorAll("tr")) : [];
      const summaryEndBottom = summaryTbodyRows.length
        ? Math.round((summaryTbodyRows[summaryTbodyRows.length - 1].getBoundingClientRect().bottom - elTop) * SCALE)
        : lastTbodyBottom;
      tbodySplitPoints = tbodySplitPoints.filter(b => b <= summaryStartTop || b >= summaryEndBottom);
    }

    el.style.width = prevW;
    el.style.minWidth = prevMin;
    el.style.maxWidth = prevMax;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const M = 5; // 5mm margin all sides
    const contentW = pageW - M * 2;
    const contentH = pageH - M * 2;

    let isFirstPageOverall = true;
    const addPageBreakIfNeeded = () => {
      if (!isFirstPageOverall) pdf.addPage();
      isFirstPageOverall = false;
    };

    for (const copyLabel of copyLabels) {
      const canvas = await html2canvas(el, {
        scale: SCALE, useCORS: true, backgroundColor: "#fff",
        width: A4_PX, windowWidth: A4_PX,
        onclone: (clonedDoc) => {
          clonedDoc.documentElement.classList.remove("dark");
          const printEl = el.id ? clonedDoc.getElementById(el.id) : null;
          if (!printEl) return;
          printEl.style.width = `${A4_PX}px`;
          printEl.style.minWidth = `${A4_PX}px`;
          printEl.style.maxWidth = `${A4_PX}px`;

          // Stamp the copy-label badge. Uses visibility not display, so the row keeps the layout space
          // measured above — display:none would shrink it and desync tfootTop/tbodySplitPoints.
          const badge = printEl.querySelector<HTMLElement>("#invoice-copy-badge");
          if (badge) {
            if (copyLabel) {
              badge.textContent = copyLabel;
              badge.style.visibility = "visible";
            } else {
              badge.style.visibility = "hidden";
            }
          }

          // Receiver Signature: only the Duplicate Copy needs it signed. Uses visibility not display,
          // same reasoning as the badge above — toggling display used to desync page counts between copies.
          const receiverSignature = printEl.querySelector<HTMLElement>("#invoice-receiver-signature");
          if (receiverSignature) {
            receiverSignature.style.visibility = copyLabel === "DUPLICATE COPY" ? "visible" : "hidden";
          }

          // Replace Next.js optimized img src with a plain data URL so
          // html2canvas can load it reliably on all devices (incl. mobile).
          if (logoDataUrl) {
            printEl.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
              if (img.src.includes("logo") || img.getAttribute("alt")?.toLowerCase().includes("logo")) {
                img.src = logoDataUrl;
                // Cap to natural dimensions rather than a hardcoded size, so the logo is never clipped.
                img.style.width = "auto";
                img.style.height = "auto";
                img.style.maxWidth = "56px";
                img.style.maxHeight = "56px";
                img.style.objectFit = "contain";
                img.style.objectPosition = "left center";
                img.style.display = "block";
                img.style.flexShrink = "0";
                // Ensure the parent container doesn't clip the image
                const parent = img.parentElement;
                if (parent) {
                  parent.style.overflow = "visible";
                  parent.style.flexShrink = "0";
                }
              }
            });
          }

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
          // First row in each table gets a top border. tfoot is excluded — it sits right after tbody's
          // last row pre-capture, so a top border here would double up and grow the row past its
          // measured height; the pinned-footer renderer draws that border itself on the canvas instead.
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

      const mmPerPx = contentW / canvas.width;
      const pageHeightPx = Math.floor(contentH / mmPerPx);
      const page2HeightPx = pageHeightPx - theadH; // pages 2+ have the TAX INVOICE banner

      // Computes this copy's split points using tbody row bottoms as safe break points, reserving
      // footer room on every page and packing page 1 with as many items as actually fit.
      const pageSplits: number[] = [];
      {
        let start = 0, pNum = 0;
        while (start < canvas.height) {
          const fullAvail    = pNum === 0 ? pageHeightPx : page2HeightPx;
          const contentAvail = fullAvail - tfootH - FOOTER_MARGIN_PX - ROW_SAFETY_MARGIN_PX;
          const idealEnd = Math.min(start + contentAvail, canvas.height);
          let splitAt = idealEnd;
          if (idealEnd < canvas.height) {
            const safe = tbodySplitPoints.filter(b => b > start && b <= idealEnd);
            splitAt = safe.length > 0 ? safe[safe.length - 1] : idealEnd;
            if (splitAt >= lastTbodyBottom) {
              if (canvas.height - start <= fullAvail - FOOTER_MARGIN_PX - ROW_SAFETY_MARGIN_PX) {
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

      // Draws "Page No. X of Y" into the reserved band below the tfoot. `footerY` is where the footer's
      // top landed on this page's composited canvas — pass null when this page has no footer.
      const stampPageMarker = (ctx: CanvasRenderingContext2D, footerY: number | null, pageNum: number, totalPages: number) => {
        if (!pmWidthPx || !pmHeightPx || footerY == null || totalPages <= 1) return;
        const y = footerY + pmOffsetTopPx;
        const text = `Page No. ${pageNum} of ${totalPages}`;
        ctx.fillStyle = BD;
        ctx.font = `${9 * SCALE}px Arial, sans-serif`;
        ctx.textAlign = "right";
        // "top" baseline sits at the font's em-box top, not the glyph's visible top (Arial's internal
        // leading) — actualBoundingBoxAscent gets the real ink-top offset so MARKER_GAP_PX is exact.
        ctx.textBaseline = "alphabetic";
        const ascent = ctx.measureText(text).actualBoundingBoxAscent || 9 * SCALE;
        ctx.fillText(text, pmRightPx - MARKER_RIGHT_PAD_PX, y + MARKER_GAP_PX + ascent);
      };

      // Signals to the reader that the table continues past this page break (no other visual cue exists).
      const CONTINUED_NOTE_H = 10 * SCALE;
      const CONTINUED_NOTE_GAP_PX = 3 * SCALE;
      const stampContinuedNote = (ctx: CanvasRenderingContext2D, xRight: number, yTop: number) => {
        ctx.fillStyle = BD;
        ctx.font = `italic ${8 * SCALE}px Arial, sans-serif`;
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText("Contd. on next page...", xRight, yTop);
      };

      // Slice a strip from the canvas. Optionally prepend header and/or append footer.
      const slicePage = (startPx: number, endPx: number, withHeader: boolean, appendFooter: boolean, pageNum: number, totalPages: number) => {
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
        let footerY: number | null = null;
        if (appendFooter && tfootH > 0) {
          ctx.drawImage(canvas, 0, tfootTop, canvas.width, tfootH, 0, y, canvas.width, tfootH);
          footerY = y;
        } else if (tfootH > 0 && startPx <= tfootTop && endPx >= tfootTop + tfootH) {
          // Footer wasn't explicitly appended, but this slice already covers it (e.g. a single-page copy) at its natural offset.
          footerY = hdrH + (tfootTop - startPx);
        }
        stampPageMarker(ctx, footerY, pageNum, totalPages);
        return { dataUrl: pc.toDataURL("image/jpeg", 0.95), totalH };
      };

      // Renders a full page-height canvas with the footer pinned to the very bottom, not floating
      // under the last content row. The blank gap above it gets its own canvas-stroked border lines
      // (drawImage-stretching a captured border row was tried and rejected — it smeared cell content).
      const slicePagePinned = (startPx: number, endPx: number, withHeader: boolean, pageNum: number, totalPages: number) => {
        const pc = document.createElement("canvas");
        pc.width = canvas.width;
        pc.height = pageHeightPx;
        const ctx = pc.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, pageHeightPx);
        let y = 0;
        if (withHeader) {
          ctx.drawImage(canvas, 0, theadTop, canvas.width, theadH, 0, y, canvas.width, theadH);
          y += theadH;
        }
        // Pinned flush to the bottom — FOOTER_MARGIN_PX is only a cushion for the fit calculation
        // above, not a gap to leave here (subtracting it too used to leave the footer short of the page edge).
        const footerTop = pageHeightPx - (tfootH > 0 ? tfootH : 0);
        const bodyEndPx = Math.min(tfootTop, endPx);
        // Capped at footerTop so a stale row-height measurement can never push body content past the footer band.
        const bodySliceH = Math.max(0, Math.min(bodyEndPx - startPx, footerTop - y));
        if (bodySliceH > 0) {
          ctx.drawImage(canvas, 0, startPx, canvas.width, bodySliceH, 0, y, canvas.width, bodySliceH);
        }
        y += bodySliceH;
        if (pageNum < totalPages && footerTop - y >= CONTINUED_NOTE_GAP_PX + CONTINUED_NOTE_H) {
          stampContinuedNote(ctx, tableRightPx - MARKER_RIGHT_PAD_PX, y + CONTINUED_NOTE_GAP_PX);
        }
        const hasGap = footerTop > y && tableRightPx > tableLeftPx;
        // Matches the table's real CSS border (1px, scaled) exactly, at full
        // strength — not a fainter/thicker guess — so nothing needs eyeballing.
        const BORDER_W = SCALE;
        if (hasGap) {
          ctx.strokeStyle = BD;
          ctx.lineWidth = BORDER_W;
          // A CSS border sits inside the box edge; a canvas stroke centers on its coordinate, so
          // offset the left line inward (+) and the right line inward (-) by half the width to match.
          [tableLeftPx + BORDER_W / 2, tableRightPx - BORDER_W / 2].forEach((x) => {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, footerTop);
            ctx.stroke();
          });
        }
        if (tfootH > 0) {
          ctx.drawImage(canvas, 0, tfootTop, canvas.width, tfootH, 0, footerTop, canvas.width, tfootH);
        }
        // Drawn last so it paints over the footer image; not baked into the DOM (would double up with the row's own bottom border).
        if (hasGap) {
          ctx.strokeStyle = BD;
          ctx.lineWidth = BORDER_W;
          ctx.beginPath();
          ctx.moveTo(tableLeftPx, footerTop + BORDER_W / 2);
          ctx.lineTo(tableRightPx, footerTop + BORDER_W / 2);
          ctx.stroke();
        }
        stampPageMarker(ctx, tfootH > 0 ? footerTop : null, pageNum, totalPages);
        return { dataUrl: pc.toDataURL("image/jpeg", 0.95), totalH: pageHeightPx };
      };

      // Render — footer is pinned to the bottom of every page that shows it. pageNum/totalPages are scoped to this copy only (see header comment).
      let start = 0;
      pageSplits.forEach((splitAt, i) => {
        const withHeader = i > 0;
        addPageBreakIfNeeded();
        const { dataUrl, totalH } = tfootH > 0
          ? slicePagePinned(start, splitAt, withHeader, i + 1, pageSplits.length)
          : slicePage(start, splitAt, withHeader, false, i + 1, pageSplits.length);
        pdf.addImage(dataUrl, "JPEG", M, M, contentW, totalH * mmPerPx);
        start = splitAt;
      });
    }

    return pdf.output("blob");
  } catch {
    return null;
  }
}
