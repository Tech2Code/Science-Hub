/**
 * Shared invoice PDF generator.
 * Pass the #invoice-print-area HTMLElement (from any page or iframe).
 * Returns a Blob or null on failure.
 *
 * Pass `copyLabels` to stamp and concatenate multiple labeled copies (e.g.
 * ["ORIGINAL COPY", "DUPLICATE COPY"]) into a single output PDF — each copy
 * renders as its own full paginated section, one after another.
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

    // "Page No. X of Y" marker — sits outside/below the table's own box, in the
    // borderless row right after </table>. Its wrapping row is captured and
    // moved together with the tfoot above as one combined "footer" block (this
    // is why tfootH is measured through the marker row's bottom, not the
    // tfoot's own), so it always lands directly under the footer whether that
    // block is appended after content or pinned to the page bottom.
    const pageMarkerEl = el.querySelector<HTMLElement>("#invoice-page-marker");
    const pmRect = pageMarkerEl?.getBoundingClientRect();
    const markerRowEl = pageMarkerEl?.parentElement as HTMLElement | null;
    const markerRowBottom = markerRowEl ? Math.round((markerRowEl.getBoundingClientRect().bottom - elTop) * SCALE) : tfootOwnBottom;
    const tfootH = Math.max(tfootOwnBottom, markerRowBottom) - tfootTop;

    const pmLeftPx     = pmRect ? Math.round((pmRect.left - elLeft) * SCALE) : 0;
    const pmOffsetTopPx = pmRect ? Math.round((pmRect.top - elTop) * SCALE) - tfootTop : 0;
    const pmWidthPx    = pmRect ? Math.round(pmRect.width  * SCALE) : 0;
    const pmHeightPx   = pmRect ? Math.round(pmRect.height * SCALE) : 0;

    // tbody row bottoms — safe split boundaries (tfoot is NOT a split point)
    const tbodySplitPoints = Array.from(el.querySelectorAll("tbody tr")).map(
      (row) => Math.round(((row as HTMLElement).getBoundingClientRect().bottom - elTop) * SCALE)
    );
    const lastTbodyBottom = tbodySplitPoints[tbodySplitPoints.length - 1] ?? 0;

    // Bottoms of the actual invoice line-item rows only — tagged with
    // data-invoice-item-row since the item rows sit among several static
    // rows (invoice meta, buyer/seller, column header, totals) inside the
    // same tbody, so a plain row index can't be used to count/locate them.
    const itemRowBottoms = Array.from(el.querySelectorAll("tbody tr[data-invoice-item-row]")).map(
      (row) => Math.round(((row as HTMLElement).getBoundingClientRect().bottom - elTop) * SCALE)
    );
    // From this many line items onward, everything from the 18th item down
    // through the footer (Terms/Bank/Totals) moves onto its own page —
    // the first page keeps only the first 17 items.
    const ITEM_COUNT_FOOTER_SPLIT = 18;
    const forcedItemSplitPoint =
      itemRowBottoms.length >= ITEM_COUNT_FOOTER_SPLIT
        ? itemRowBottoms[ITEM_COUNT_FOOTER_SPLIT - 2]
        : null;

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
          const badge = printEl.querySelector<HTMLElement>("#invoice-copy-badge");
          if (badge) {
            if (copyLabel) {
              badge.textContent = copyLabel;
              badge.style.display = "block";
            } else {
              badge.style.display = "none";
            }
          }

          // Receiver Signature block — only the Duplicate Copy (the seller's
          // own retained copy) needs the recipient to sign it as proof of receipt.
          const receiverSignature = printEl.querySelector<HTMLElement>("#invoice-receiver-signature");
          if (receiverSignature) {
            receiverSignature.style.display = copyLabel === "DUPLICATE COPY" ? "block" : "none";
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

      // Overwrites the baked-in "Page No. 1 of 1" text with the real page
      // number for this page — the footer image itself is a pixel copy from
      // a single html2canvas capture, so this is the only way to vary that
      // text per page instead of it repeating the same value everywhere.
      // For single-page invoices it just erases the baked-in text instead —
      // the page marker should only be visible when there's more than one page.
      // `footerY` is where the footer's top actually landed on this page's
      // composited canvas (appended, pinned to the bottom, or copied in place) —
      // pass null when this page doesn't carry a footer at all.
      const stampPageMarker = (ctx: CanvasRenderingContext2D, footerY: number | null, pageNum: number, totalPages: number) => {
        if (!pmWidthPx || !pmHeightPx || footerY == null) return;
        const y = footerY + pmOffsetTopPx;
        ctx.fillStyle = "#fff";
        ctx.fillRect(pmLeftPx, y, pmWidthPx, pmHeightPx);
        if (totalPages <= 1) return;
        ctx.fillStyle = BD;
        ctx.font = `${9 * SCALE}px Arial, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(`Page No. ${pageNum} of ${totalPages}`, pmLeftPx, y + pmHeightPx / 2);
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
      // floating directly under the last content row — used only for the
      // actual last page, and only when its content doesn't already reach
      // the bottom of the page on its own.
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
        const bodyEndPx = Math.min(tfootTop, endPx);
        const bodySliceH = Math.max(0, bodyEndPx - startPx);
        if (bodySliceH > 0) {
          ctx.drawImage(canvas, 0, startPx, canvas.width, bodySliceH, 0, y, canvas.width, bodySliceH);
        }
        y += bodySliceH;
        // Connect the table's left/right border lines straight down through
        // the blank gap, so the box reads as one continuous frame ending at
        // the footer instead of the footer looking detached at the bottom.
        // Drawn once here — not baked into the DOM — so it can't double up
        // with any border already present in the captured image.
        const footerTop = pageHeightPx - (tfootH > 0 ? tfootH : 0);
        const drawGapBorders = footerTop > y && tableRightPx > tableLeftPx;
        // A touch thicker than the table's own borders (SCALE) — a plain
        // canvas stroke over a large blank area comes out visibly fainter
        // than the same-width border baked into the busy, JPEG-compressed
        // table image, so match it by eye rather than by nominal px value.
        const BORDER_W = SCALE + 1;
        // A flat, full-opacity stroke of the exact border color reads darker
        // than the real borders, which come out softened by anti-aliasing
        // and JPEG compression once baked into the table image — dial the
        // opacity down to match instead of using BD at full strength.
        const BORDER_STROKE = "rgba(100, 116, 139, 0.75)"; // BD (#64748b) at 75% opacity
        if (drawGapBorders) {
          ctx.strokeStyle = BORDER_STROKE;
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
        if (drawGapBorders) {
          ctx.strokeStyle = BORDER_STROKE;
          ctx.lineWidth = BORDER_W;
          ctx.beginPath();
          ctx.moveTo(tableLeftPx, footerTop + 0.5);
          ctx.lineTo(tableRightPx, footerTop + 0.5);
          ctx.stroke();
        }
        stampPageMarker(ctx, tfootH > 0 ? footerTop : null, pageNum, totalPages);
        return { dataUrl: pc.toDataURL("image/jpeg", 0.95), totalH: pageHeightPx };
      };

      const addPageBreakIfNeeded = () => {
        if (!isFirstPageOverall) pdf.addPage();
        isFirstPageOverall = false;
      };

      // Pass 1: compute split points across the whole document (this runs
      // even when everything would otherwise fit on one page, since the
      // item-count rule below can still force a break).
      //   - forcedItemSplitPoint (15+ items): a hard cap on every page's end
      //     until it's crossed, so item 15 onward always starts a fresh
      //     page together with the footer — regardless of how much budget
      //     would otherwise be left on the page containing item 14.
      //   - Otherwise, tbody row bottoms are used as safe break points,
      //     reserving room for the footer on every page so it's never cut
      //     across a page break.
      const pageSplits: number[] = [];
      {
        let start = 0, pNum = 0;
        while (start < canvas.height) {
          const fullAvail    = pNum === 0 ? pageHeightPx : page2HeightPx;
          const contentAvail = fullAvail - tfootH;
          let idealEnd = Math.min(start + contentAvail, canvas.height);
          if (forcedItemSplitPoint != null && start < forcedItemSplitPoint) {
            idealEnd = Math.min(idealEnd, forcedItemSplitPoint);
          }
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

      // Pass 2: render — the footer (a repeated copy on every non-last page,
      // its real content on the last) is pinned to the bottom of every page
      // that shows it, not just floated directly under that page's content.
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
