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

  useEffect(() => {
    fetch(`/api/rate-lists/${id}`)
      .then((r) => r.json())
      .then((d: RateListApi & { error?: string }) => {
        if (d?.error) { setLoadError(d.error); setLoading(false); return; }
        if (d.deletedAt) { setLoadError("This rate list is in the bin — restore it before editing."); setLoading(false); return; }
        setTitle(d.title);
        setNote(d.note ?? "");
        setItems(d.items.map((i) => ({
          key: makeRateListLineItemKey(),
          name: i.name,
          brand: i.brand ?? "",
          unit: i.unit,
          isNetRate: i.isNetRate,
          discountPercent: String(i.discountPercent),
          listRate: String(i.listRate),
        })));
        setLoading(false);
      })
      .catch(() => { setLoadError("Failed to load rate list."); setLoading(false); });
  }, [id]);

  const visibleItemsError = itemsError && itemsErrorFor === items ? itemsError : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const titleErr = validate(title, rules.required("Title is required."));
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

  const canSubmit = !saving && !!title.trim() && items.some((i) => i.name.trim());

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
