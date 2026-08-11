"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { rules, validate } from "@/lib/validation";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { bustCachePrefix } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";
import { RateListFormBody } from "@/components/rateLists/RateListFormBody";
import { toNum, calcRateListItem, makeRateListLineItemKey, type RateListLineItem } from "@/lib/rateListForm";

export default function NewRateListPage() {
  const router = useRouter();
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<RateListLineItem[]>([{ key: makeRateListLineItemKey(), name: "", brand: "", unit: "Nos", isNetRate: false, discountPercent: "0", listRate: "" }]);
  const [itemsError, setItemsError] = useState<string | undefined>(undefined);
  const [itemsErrorFor, setItemsErrorFor] = useState<RateListLineItem[] | null>(null);
  const [saving, setSaving] = useState(false);

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
      const res = await fetch("/api/rate-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        bustCachePrefix("/api/rate-lists");
        toast({ type: "success", title: "Rate list created", message: `"${data.title}" saved.` });
        router.push(`/sales/rate-lists/${data.id}`);
      } else {
        toast({ type: "error", title: "Failed to save", message: data.error ?? "Failed to create rate list." });
      }
    } catch {
      toast({ type: "error", title: "Network error", message: "Please try again." });
    }
    setSaving(false);
  }

  const canSubmit = !saving && !!title.trim() && items.some((i) => i.name.trim());

  return (
    <>
    {saving && <OverlayLoader text="Creating rate list…" />}
    <div className="page-stack">
      <Breadcrumb items={[{ label: "Rate Lists", href: "/sales/rate-lists" }, { label: "New Rate List" }]} />
      <div>
        <h1 className="page-title">Create Rate List</h1>
        <p className="page-sub">Build a downloadable price sheet to share with customers</p>
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
                Create Rate List
              </Button>
              <Button variant="secondary" size="full" href="/sales/rate-lists">
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
