"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { rules, validate } from "@/lib/validation";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Sk } from "@/components/ui/Skeleton";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { bustCachePrefix } from "@/lib/useCache";
import { invalidateCachedPdf } from "@/lib/pdfCache";
import { useToast } from "@/components/ui/Toast";
import { RateListFormBody } from "@/components/rateLists/RateListFormBody";
import { toNum, calcRateListItem, makeRateListLineItemKey, type RateListLineItem } from "@/lib/rateListForm";
import { useFormDraft, loadFormDraft, clearFormDraft } from "@/lib/useFormDraft";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { DiscardDraftConfirm } from "@/components/dialogs/DiscardDraftConfirm";

type RateListEditDraft = { title: string; note: string; items: RateListLineItem[] };

interface RateListApiItem {
  name: string; brand: string | null; unit: string; isNetRate: boolean; discountPercent: number; listRate: number;
}
interface RateListApi {
  id: string; title: string; note: string | null; deletedAt: string | null; items: RateListApiItem[];
}

export default function EditRateListPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<RateListLineItem[]>([]);
  const [itemsError, setItemsError] = useState<string | undefined>(undefined);
  const [itemsErrorFor, setItemsErrorFor] = useState<RateListLineItem[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Track initial state for dirty detection
  const [initialTitle, setInitialTitle] = useState("");
  const [initialNote, setInitialNote] = useState("");
  const [initialItems, setInitialItems] = useState<RateListLineItem[]>([]);

  const DRAFT_KEY = `rate-list:edit:${id}`;
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [confirmDiscardDraftOpen, setConfirmDiscardDraftOpen] = useState(false);

  function restoreDraft() {
    const draft = loadFormDraft<RateListEditDraft>(DRAFT_KEY);
    if (draft?.values) {
      setTitle(draft.values.title ?? "");
      setNote(draft.values.note ?? "");
      setItems(draft.values.items ?? []);
    }
    setShowDraftBanner(false);
    setDraftReady(true);
  }

  function dismissDraft() {
    setConfirmDiscardDraftOpen(true);
  }

  function discardDraft() {
    clearFormDraft(DRAFT_KEY);
    setShowDraftBanner(false);
    setDraftReady(true);
    setConfirmDiscardDraftOpen(false);
  }

  useEffect(() => {
    fetch(`/api/rate-lists/${id}`)
      .then((r) => r.json())
      .then((d: RateListApi & { error?: string }) => {
        if (d?.error) { setLoadError(d.error); setLoading(false); return; }
        if (d.deletedAt) { setLoadError("This rate list is in the bin — restore it before editing."); setLoading(false); return; }
        setTitle(d.title);
        setNote(d.note ?? "");
        const loadedItems = d.items.map((i) => ({
          key: makeRateListLineItemKey(),
          name: i.name,
          brand: i.brand ?? "",
          unit: i.unit,
          isNetRate: i.isNetRate,
          discountPercent: String(i.discountPercent),
          listRate: String(i.listRate),
        }));
        setItems(loadedItems);
        setInitialTitle(d.title);
        setInitialNote(d.note ?? "");
        setInitialItems(loadedItems);
        setLoading(false);
        if (loadFormDraft(DRAFT_KEY)) setShowDraftBanner(true);
        else setDraftReady(true);
      })
      .catch(() => { setLoadError("Failed to load rate list."); setLoading(false); });
  }, [id]);

  const visibleItemsError = itemsError && itemsErrorFor === items ? itemsError : undefined;

  // Dirty detection: compare current state against loaded values
  const isDirty = (() => {
    if (title.trim() !== initialTitle.trim()) return true;
    if ((note.trim() || "") !== (initialNote.trim() || "")) return true;
    const currentNonEmpty = items.filter((i) => i.name.trim() || toNum(i.listRate) > 0);
    const initialNonEmpty = initialItems.filter((i) => i.name.trim() || toNum(i.listRate) > 0);
    if (currentNonEmpty.length !== initialNonEmpty.length) return true;
    for (let i = 0; i < currentNonEmpty.length; i++) {
      const a = currentNonEmpty[i], b = initialNonEmpty[i];
      if (a.name.trim() !== b.name.trim() || a.brand.trim() !== b.brand.trim() || a.unit !== b.unit || a.isNetRate !== b.isNetRate || a.discountPercent !== b.discountPercent || a.listRate !== b.listRate) return true;
    }
    return false;
  })();

  useFormDraft(DRAFT_KEY, { title, note, items }, !draftReady || saving || !isDirty);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const titleErr = validate(title, rules.required("Title is required."), rules.minLength(2), rules.maxLength(200));
    setTitleError(titleErr ?? undefined);
    if (titleErr) return;

    function flagItemsError(message: string) { setItemsError(message); setItemsErrorFor(items); }
    const nonEmptyItems = items.filter((i) => i.name.trim() || toNum(i.listRate) > 0);
    if (nonEmptyItems.length === 0)                                    { flagItemsError("Add at least one item."); return; }
    if (nonEmptyItems.some((i) => validate(i.name, rules.required())))  { flagItemsError("All items must have a name."); return; }
    if (nonEmptyItems.some((i) => !i.unit.trim()))                      { flagItemsError("All items must have a unit."); return; }
    if (nonEmptyItems.some((i) => validate(i.listRate, rules.required(), rules.nonNegativeNumber()))) { flagItemsError("All items must have a valid list rate."); return; }
    setItemsError(undefined);

    const payload = {
      title: title.trim(),
      note: note.trim() || null,
      items: nonEmptyItems.map((i) => ({
        name: i.name.trim(),
        brand: i.brand.trim() || null,
        unit: i.unit,
        isNetRate: i.isNetRate,
        discountPercent: toNum(i.discountPercent),
        listRate: toNum(i.listRate),
        amount: calcRateListItem(i).amount,
      })),
    };

    setSaving(true);
    try {
      const res = await fetch(`/api/rate-lists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        clearFormDraft(DRAFT_KEY);
        bustCachePrefix("/api/rate-lists");
        await invalidateCachedPdf("rate-list", String(id));
        toast({ type: "success", title: "Rate list updated", message: `"${data.title}" saved.` });
        router.push(`/sales/rate-lists/${id}`);
      } else {
        toast({ type: "error", title: "Failed to save", message: data.error ?? "Failed to update rate list." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setSaving(false);
  }

  const canSubmit = !saving && !!title.trim() && items.some((i) => i.name.trim()) && isDirty;

  if (loading) {
    return (
      <div className="page-stack">
        <Sk h={24} w="16rem" />
        <Sk h={160} />
        <Sk h={320} />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="page-stack">
        <p>{loadError}</p>
        <Button variant="secondary" href="/sales/rate-lists">Back to Rate Lists</Button>
      </div>
    );
  }

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
    <div className="page-stack">
      <Breadcrumb items={[{ label: "Rate Lists", href: "/sales/rate-lists" }, { label: title, href: `/sales/rate-lists/${id}` }, { label: "Edit" }]} />
      <div>
        <h1 className="page-title">Edit Rate List</h1>
        <p className="page-sub">Update pricing, items, or details</p>
      </div>

      <DiscardDraftConfirm open={confirmDiscardDraftOpen} onConfirm={discardDraft} onCancel={() => setConfirmDiscardDraftOpen(false)} />
      {showDraftBanner && (
        <InfoBanner
          message="You have unsaved edits to this rate list from earlier — want to resume them?"
          actionLabel="Resume draft"
          onAction={restoreDraft}
          onDismiss={dismissDraft}
        />
      )}

      <form onSubmit={handleSubmit} noValidate>
        <RateListFormBody
          title={title}
          onTitleChange={(v) => { setTitle(v); setTitleError(undefined); }}
          titleError={titleError}
          note={note}
          onNoteChange={setNote}
          items={items}
          setItems={setItems}
          itemsError={visibleItemsError}
          footer={
            <div className="summary-actions">
              <Button type="submit" variant="primary" size="full" disabled={!canSubmit}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                Save Changes
              </Button>
              <Button variant="secondary" size="full" href={`/sales/rate-lists/${id}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Cancel
              </Button>
            </div>
          }
        />
      </form>
    </div>
    </>
  );
}
