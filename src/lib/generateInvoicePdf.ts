/**
 * Shared invoice PDF generator — pass the #invoice-print-area element, returns a Blob or null on failure.
 * `copyLabels` concatenates multiple labeled copies into one PDF, each with its own page count.
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

    // Measure the <thead> (the banner/letterhead — repeated at the top of every page after page 1).
    const theadEl = el.querySelector("thead") as HTMLElement | null;
    const theadTop = theadEl ? Math.round((theadEl.getBoundingClientRect().top - elTop) * SCALE) : 0;
    const theadH   = theadEl ? Math.round(theadEl.getBoundingClientRect().height * SCALE) : 0;

    // A row marked `data-header-item-cols="true"` (the invoice's item column-header row) is a
    // SECOND, independent repeating region — measured separately from `theadEl` because it must
    // stay a normal <tbody> row, positioned right above the actual item rows on page 1 (after
    // Invoice No./Bill To/Place of Supply etc.), not inside <thead> (which would force it to the
    // very top of the table, under the banner, ahead of all that other content — wrong on page 1).
    // On a continuation page it's redrawn stacked directly under the repeated banner, but only when
    // that page actually has item rows on it — a page that overflowed purely because the trailing
    // Notes/Bank/Terms/Totals block didn't fit has no item rows at all, so printing column headers
    // ("Qty", "Rate", "GST"...) with nothing under them would look broken there.
    const colHeaderEl = el.querySelector('[data-header-item-cols="true"]') as HTMLElement | null;
    const colHeaderTop = colHeaderEl ? Math.round((colHeaderEl.getBoundingClientRect().top - elTop) * SCALE) : 0;
    const colHeaderH   = colHeaderEl ? Math.round(colHeaderEl.getBoundingClientRect().height * SCALE) : 0;

    // Item rows' own vertical ranges — used to decide, per continuation page, whether it actually
    // contains any item row (see colHeaderH above).
    const itemRowRects = Array.from(el.querySelectorAll('tbody tr[data-invoice-item-row]')).map((row) => {
      const rect = (row as HTMLElement).getBoundingClientRect();
      return {
        top: Math.round((rect.top - elTop) * SCALE),
        bottom: Math.round((rect.bottom - elTop) * SCALE),
      };
    });
    const pageHasItemRows = (start: number, end: number) => itemRowRects.some((r) => r.top < end && r.bottom > start);

    // Measure footer row (tfoot) — appended at bottom of every non-last page
    const tfootRowEl = el.querySelector("tfoot tr") as HTMLElement | null;
    const tfootTop = tfootRowEl ? Math.round((tfootRowEl.getBoundingClientRect().top - elTop) * SCALE) : 0;
    const tfootOwnBottom = tfootRowEl ? Math.round((tfootRowEl.getBoundingClientRect().bottom - elTop) * SCALE) : 0;

    // "Page No. X of Y" band below the tfoot is deliberately not a DOM element (would show stale
    // numbers or desync measurements) — blank canvas until stampPageMarker draws into it.
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

    // The Totals/Bank/Terms/Signature block shares one rowSpan'd cell across several <tr>s, so it can
    // only split at its start (pushed whole to the next page) or not at all — never mid-block.
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
          // First row in each table gets a top border; tfoot is excluded since the pinned-footer
          // renderer draws that border on the canvas itself (a DOM one would grow past the measured height).
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
      // Reserves room for BOTH the banner and the column-header on every continuation page while
      // computing where to split — even on a page that ends up not needing the column-header
      // (see colHeaderH above), since we don't know that yet at this point. Reserving the larger,
      // worst-case amount only ever costs a little unused whitespace, never an overflow.
      const page2HeightPx = pageHeightPx - theadH - colHeaderH;

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
            if (safe.length > 0) {
              splitAt = safe[safe.length - 1];
            } else {
              // No row boundary fits within this page's ideal content height — the very next row
              // is taller than a full page's remaining content area (only plausible for an
              // unusually tall row right after `start`). Push it whole onto this page instead of
              // slicing through its content: use the nearest row-boundary AFTER idealEnd, so
              // pagination degrades to "this one row makes the page slightly taller than ideal"
              // rather than a raw pixel cut through a row's middle.
              const next = tbodySplitPoints.find(b => b > start);
              splitAt = next !== undefined ? next : idealEnd;
            }
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

      // Slice a strip from the canvas. `bannerH` (theadTop, letterhead) and `colHeaderH`
      // (colHeaderTop, item column headers) are two INDEPENDENT source regions — not
      // contiguous in the original DOM (Invoice No./Bill To/etc. sits between them) — each
      // either drawn (its measured height) or skipped (0). Pass bannerH=0 for page 1 (already
      // shown in-flow); colHeaderH=0 for a continuation page with no item rows on it.
      const slicePage = (startPx: number, endPx: number, bannerH: number, colHeaderH: number, appendFooter: boolean, pageNum: number, totalPages: number) => {
        const sliceH = endPx - startPx;
        const hdrH  = bannerH + colHeaderH;
        const ftrH  = appendFooter ? tfootH : 0;
        const totalH = hdrH + sliceH + ftrH;
        const pc = document.createElement("canvas");
        pc.width  = canvas.width;
        pc.height = totalH;
        const ctx = pc.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, totalH);
        let y = 0;
        if (bannerH > 0) {
          ctx.drawImage(canvas, 0, theadTop, canvas.width, bannerH, 0, y, canvas.width, bannerH);
          y += bannerH;
        }
        if (colHeaderH > 0) {
          ctx.drawImage(canvas, 0, colHeaderTop, canvas.width, colHeaderH, 0, y, canvas.width, colHeaderH);
          y += colHeaderH;
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
        // PNG, not JPEG — this canvas is text/lines/borders on a flat white background (a rendered
        // document, not a photo), which PNG's lossless compression handles noticeably smaller than a
        // high-quality JPEG (JPEG's DCT-based compression struggles with sharp text/line edges).
        return { dataUrl: pc.toDataURL("image/png"), totalH };
      };

      // Renders a full page-height canvas with the footer pinned to the bottom, not floating under the
      // last content row; the blank gap above it gets canvas-stroked border lines (a stretched drawImage smeared).
      // `bannerH`/`colHeaderH` — see slicePage's comment above.
      const slicePagePinned = (startPx: number, endPx: number, bannerH: number, colHeaderH: number, pageNum: number, totalPages: number) => {
        const pc = document.createElement("canvas");
        pc.width = canvas.width;
        pc.height = pageHeightPx;
        const ctx = pc.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, pageHeightPx);
        let y = 0;
        if (bannerH > 0) {
          ctx.drawImage(canvas, 0, theadTop, canvas.width, bannerH, 0, y, canvas.width, bannerH);
          y += bannerH;
        }
        if (colHeaderH > 0) {
          ctx.drawImage(canvas, 0, colHeaderTop, canvas.width, colHeaderH, 0, y, canvas.width, colHeaderH);
          y += colHeaderH;
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
        // See slicePage's identical comment above — PNG compresses this flat-background,
        // sharp-edged document render smaller than JPEG, losslessly.
        return { dataUrl: pc.toDataURL("image/png"), totalH: pageHeightPx };
      };

      // Render — footer is pinned to the bottom of every page that shows it. pageNum/totalPages are scoped to this copy only (see header comment).
      let start = 0;
      pageSplits.forEach((splitAt, i) => {
        // Page 1 never gets a repeated banner/column-header (everything's already shown in-flow
        // there). A continuation page always repeats the banner; it additionally repeats the item
        // column-header only if this page actually contains an item row — a page that's purely the
        // trailing Notes/Bank/Terms/Totals block has none, so column headers with nothing under
        // them would look broken there.
        const bannerH = i === 0 ? 0 : theadH;
        const pageColHeaderH = i === 0 ? 0 : (pageHasItemRows(start, splitAt) ? colHeaderH : 0);
        addPageBreakIfNeeded();
        const { dataUrl, totalH } = tfootH > 0
          ? slicePagePinned(start, splitAt, bannerH, pageColHeaderH, i + 1, pageSplits.length)
          : slicePage(start, splitAt, bannerH, pageColHeaderH, false, i + 1, pageSplits.length);
        // jsPDF's `compression` param (undocumented default: "NONE") controls the FlateDecode level it
        // applies when re-embedding a PNG's raw pixel data into the PDF — unlike a JPEG's own DCT bytes,
        // which pass through as-is, jsPDF does NOT reuse the source PNG's own compressed bytes at all,
        // so omitting this silently embeds the image fully uncompressed (confirmed: without it, a single
        // invoice page inflates to ~10MB). "SLOW" = strongest compression; the CPU cost is a one-time,
        // non-blocking-UI cost per PDF generation, not a hot path.
        pdf.addImage(dataUrl, "PNG", M, M, contentW, totalH * mmPerPx, undefined, "SLOW");
        start = splitAt;
      });
    }

    return pdf.output("blob");
  } catch {
    return null;
  }
}
