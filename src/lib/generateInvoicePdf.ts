/**
 * Shared invoice PDF generator.
 * Pass the #invoice-print-area HTMLElement (from any page or iframe).
 * Returns a Blob or null on failure.
 *
 * Pass `copyLabels` to stamp and concatenate multiple labeled copies (e.g.
 * ["ORIGINAL COPY", "DUPLICATE COPY"]) into a single output PDF — each copy
 * renders as its own full paginated section, one after another, and the
 * "Page No. X of Y" marker is scoped to that copy alone (each copy's own
 * page count, not a grand total across every copy) — a copy that is itself
 * only one page shows no marker at all, even if concatenated with other
 * copies makes the overall PDF longer, since the marker describes "how many
 * pages is THIS copy", not "how many pages is this download".
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
    // Cushion reserved on top of the footer's own measured height when
    // deciding what fits on a page. Row-height measurements are taken from
    // the live DOM before html2canvas's own capture runs, and can be a few
    // px off from the actual captured canvas (font metrics / rounding) —
    // without this margin, a borderline page had zero slack and the footer
    // could end up pinned right at (or past) the physical page edge.
    const FOOTER_MARGIN_PX = 6 * SCALE;
    // Extra slack subtracted when deciding whether one more row fits on the
    // current page — separate from FOOTER_MARGIN_PX above (that one guards
    // the footer's own position; this one guards the LAST body row picked
    // for the page). html2canvas lays text out with its own approximation
    // of the browser's text engine, so a borderline-width cell (an item name
    // close to wrapping to a second line) can render one line taller in the
    // actual capture than it measured live — sized to roughly one extra
    // wrapped text line so that case still lands cleanly on the next page
    // instead of being sliced across both.
    const ROW_SAFETY_MARGIN_PX = Math.round(9 * 1.3 * SCALE);

    // Temporarily resize to A4 width to measure exact row boundary positions.
    // Measurement is layout-only and identical across copies (the copy-label
    // badge is an absolutely positioned overlay that doesn't affect flow).
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

    // "Page No. X of Y" marker — a band reserved right below the tfoot's own
    // content, on every page. There is deliberately no corresponding DOM
    // element for this any more (it used to be a live "Page No. 1 of 1"
    // span baked into the table and overwritten per page) — a real element
    // either shows a wrong/stale number on the on-screen detail page itself,
    // or (if hidden via display:none) collapses to zero height and desyncs
    // this function's measurements from what html2canvas actually renders.
    // Geometry here is a fixed, computed band instead of anything measured
    // off the DOM: it's always blank canvas background until stampPageMarker
    // draws real text into it, so there's never any stale/baked text to leak
    // through or need erasing.
    // MARKER_GAP_PX is the literal gap, in raw px, between the footer's
    // border and the TOP of the "Page No. X of Y" text glyphs (drawn with
    // textBaseline "top" below, so this is a direct offset, not a formula
    // derived from font-size/line-height) — tune this one number to move the
    // text closer to/further from the border above it.
    // Matches the "Original Copy" badge's own 4px top padding (line ~1125),
    // so the gap above the page marker reads the same as the gap below that
    // badge.
    const MARKER_GAP_PX = 4 * SCALE;
    // Total band height reserved below the tfoot's own content for the
    // marker line — picked directly, not decomposed into gap+line-height.
    // Must stay >= MARKER_GAP_PX + the 9px font's actual rendered glyph
    // height, or the text clips against the next page's content.
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

    // The closing Totals/Bank/Terms/Signature block (invoice/purchase-bill
    // detail pages only — tagged with data-invoice-summary-start) is really
    // several <tr>s, but they all share one rowSpan'd left-hand cell (Terms +
    // Bank + Notes + Signature) that visually spans the whole group. Each of
    // those <tr> bottoms is still a row boundary in the DOM, so without this
    // filter they'd look like ordinary safe split points — but slicing the
    // canvas between two of them crops that rowSpan cell's own content dead,
    // with no page it re-appears on. Drop every interior boundary so the only
    // way to split this block from the item rows above it is right at its
    // start (pushing the whole thing to the next page) or not at all. Scoped
    // to the summary row's OWN <tbody> only — a following Payment/Return
    // History <tbody> (plain one-row-per-line, no rowSpan) still splits
    // normally at its own row boundaries.
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

          // Stamp the copy-label badge (e.g. "ORIGINAL COPY") for this pass.
          // Uses visibility (not display) so the row keeps occupying the same
          // layout space it had on the live page during measurement above —
          // toggling display:none here would shrink this row only inside the
          // clone, shifting every row below it out of sync with the already-
          // captured tfootTop/tbodySplitPoints and corrupting the footer crop.
          const badge = printEl.querySelector<HTMLElement>("#invoice-copy-badge");
          if (badge) {
            if (copyLabel) {
              badge.textContent = copyLabel;
              badge.style.visibility = "visible";
            } else {
              badge.style.visibility = "hidden";
            }
          }

          // Receiver Signature block — only the Duplicate Copy (the seller's
          // own retained copy) needs the recipient to sign it as proof of
          // receipt. Uses visibility (not display), same as the badge above —
          // its live-DOM default reserves the row's layout space via
          // visibility:hidden so every pass renders at the same height as
          // what was measured before the loop. Toggling display here used to
          // add height only for the Duplicate Copy pass, desyncing that
          // copy's canvas from the shared tbodySplitPoints/tfootTop
          // measurements and forcing it onto an extra page with its own
          // (wrong) page count — e.g. Original showing "Page No. 1 of 1"
          // immediately followed by Duplicate showing "Page No. 1 of 2".
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
                // Use natural image dimensions capped to the logo's container rather
                // than a hardcoded pixel size, so the logo is never clipped on any
                // screen size or PDF scale factor.
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
          // First row in each table → add top border. Note: tfoot's row is
          // NOT given its own top border here — it sits immediately after
          // tbody's last row in the captured image (the pinned-footer
          // renderer only rearranges pixels *after* capture), so adding one
          // would double up with that row's existing bottom border and also
          // grow the row taller than the pre-capture height measurement,
          // cropping the slice. The pinned renderer draws that top border
          // itself, directly on the canvas, only where the gap exists.
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

      // Compute this copy's own split points (this runs even when everything
      // would otherwise fit on one page). tbody row bottoms are used as safe
      // break points, reserving room for the footer on every page so it's
      // never cut across a page break — this already fills page 1 with as
      // many items as actually fit (rather than an arbitrary fixed ratio),
      // and only pushes the closing Totals/Bank/Terms/Signature block to its
      // own page when it genuinely wouldn't fit alongside the last item.
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

      // Draws "Page No. X of Y" into the reserved band right below the
      // tfoot's own content — that band is always blank canvas background
      // (see the MARKER_ROW_H comment above; there's no DOM element baking
      // in stray text there to worry about), so single-page documents simply
      // never call fillText and the band stays blank. `footerY` is where the
      // footer's top actually landed on this page's composited canvas
      // (appended, pinned to the bottom, or copied in place) — pass null
      // when this page doesn't carry a footer at all.
      const stampPageMarker = (ctx: CanvasRenderingContext2D, footerY: number | null, pageNum: number, totalPages: number) => {
        if (!pmWidthPx || !pmHeightPx || footerY == null || totalPages <= 1) return;
        const y = footerY + pmOffsetTopPx;
        const text = `Page No. ${pageNum} of ${totalPages}`;
        ctx.fillStyle = BD;
        ctx.font = `${9 * SCALE}px Arial, sans-serif`;
        ctx.textAlign = "right";
        // Canvas's "top" baseline sits at the font's em-box top, not the
        // glyph's actual visible top — Arial reserves several px of internal
        // leading above the cap height there, so MARKER_GAP_PX alone couldn't
        // close the gap below it. actualBoundingBoxAscent measures from the
        // alphabetic baseline to the glyph's real ink top, so placing the
        // baseline that far below `y` puts the visible text exactly
        // MARKER_GAP_PX below the footer's own content, pixel for pixel.
        ctx.textBaseline = "alphabetic";
        const ascent = ctx.measureText(text).actualBoundingBoxAscent || 9 * SCALE;
        ctx.fillText(text, pmRightPx - MARKER_RIGHT_PAD_PX, y + MARKER_GAP_PX + ascent);
      };

      // Small right-aligned note drawn just below the last item row on every
      // page that isn't the copy's last — signals to the reader that the
      // table continues past the page break, since the item rows themselves
      // give no other visual cue that content was cut off here rather than
      // genuinely ending.
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
          // Footer wasn't explicitly appended, but this slice's own range
          // already covers it (e.g. a single-page invoice copied whole) —
          // it's present at its natural offset within the copied slice.
          footerY = hdrH + (tfootTop - startPx);
        }
        stampPageMarker(ctx, footerY, pageNum, totalPages);
        return { dataUrl: pc.toDataURL("image/jpeg", 0.95), totalH };
      };

      // Renders a full page-height canvas with the footer (the "Thank you…"
      // line + page marker) pinned to the very bottom of the page instead of
      // floating directly under the last content row.
      //
      // The blank gap above a pinned footer needs its own left/right border
      // lines to read as a continuous table frame, drawn on top of the plain
      // white background already filled above. A prior attempt tried to
      // reuse a captured border row by drawImage-stretching it vertically —
      // wrong, because that row's full width also carries whatever cell
      // content/shading sits at that row (not just the two border columns),
      // and stretching that content produced vertical smears/gradient bars
      // instead of clean border lines. A plain canvas stroke, using the
      // table's own border color and width, has no such risk since it only
      // ever paints the two thin lines themselves.
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
        // Pinned flush to the very bottom of the page canvas — FOOTER_MARGIN_PX
        // is only a cushion for the body-content-fit calculation above (so a
        // borderline row-height measurement error still lands the split
        // before the footer's reserved band), not a gap to leave below the
        // footer itself. Subtracting it here as well used to leave the
        // footer's own bottom edge sitting FOOTER_MARGIN_PX short of the
        // page's actual bottom border on every multi-page invoice, even
        // though single-page copies (which use slicePage, not this pinned
        // path) always rendered flush.
        const footerTop = pageHeightPx - (tfootH > 0 ? tfootH : 0);
        const bodyEndPx = Math.min(tfootTop, endPx);
        // Capped at footerTop so a stale/under-measured row height can never
        // push body content into (or past) the footer's reserved band — worst
        // case a sliver of the last row is capped rather than the footer
        // silently landing off the bottom of this fixed-height canvas.
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
          // A CSS border sits INSIDE the box's edge, not centered on it: a
          // left border occupies [edge, edge+width), a right border occupies
          // [edge-width, edge). A canvas stroke centers on its coordinate, so
          // match that by offsetting the left line inward (+) and the right
          // line inward (-) by half the width.
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
        // Footer's top border, drawn last so it paints over the footer image
        // instead of being covered by it — not baked into the DOM (which
        // would double up with the preceding row's existing bottom border).
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

      // Render — the footer (a repeated copy on every non-last page, its
      // real content on the last) is pinned to the bottom of every page
      // that shows it, not just floated directly under that page's content.
      // pageNum/totalPages are scoped to THIS copy only — see the header
      // comment on why the marker doesn't count across copies.
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
