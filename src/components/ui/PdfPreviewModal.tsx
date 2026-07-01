"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import styles from "./PdfPreviewModal.module.css";

interface PdfPreviewModalProps {
  url: string;
  fileName: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function PdfPreviewModal({ url, fileName, title, subtitle, onClose }: PdfPreviewModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || window.innerWidth < 768;
    setIsMobile(mobile);
  }, []);

  function handleDownload() {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleOpenInBrowser() {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.fileIcon}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="15" y2="17"/>
              <polyline points="9 9 10 9 11 9"/>
            </svg>
          </div>

          <div className={styles.titleWrap}>
            <div className={styles.title}>{title}</div>
            {subtitle && (
              <div className={styles.subtitle}>{subtitle} &middot; Review before downloading</div>
            )}
          </div>

          <div className={styles.actions}>
            <Button variant="primary" size="sm" onClick={handleDownload}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </Button>
            <button onClick={onClose} title="Close preview" className={styles.closeBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* PDF viewer */}
        {isMobile ? (
          <div className={styles.mobileView}>
            <div className={styles.mobileIconWrap}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="9" y1="13" x2="15" y2="13"/>
                <line x1="9" y1="17" x2="15" y2="17"/>
              </svg>
            </div>
            <div className={styles.mobileTextWrap}>
              <div className={styles.mobileTitle}>{title}</div>
              <div className={styles.mobileSubtext}>
                PDF preview is not supported on mobile browsers.
              </div>
            </div>
            <div className={styles.mobileActions}>
              <Button variant="primary" size="md" onClick={handleDownload} style={{ justifyContent: "center" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download PDF
              </Button>
              <button onClick={handleOpenInBrowser} className={styles.openBrowserBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open in Browser
              </button>
            </div>
          </div>
        ) : (
          <iframe
            src={url}
            className={styles.iframe}
            title={`${title} PDF Preview`}
          />
        )}
      </div>
    </div>
  );
}
