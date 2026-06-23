"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OverlayLoader } from "@/components/ui/Spinner";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { Input, Textarea, Select, FormField } from "@/components/ui/Input";
import { bustCache } from "@/lib/useCache";
import { useToast } from "@/components/ui/Toast";

const INDIA_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan",
  "Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Delhi","Jammu and Kashmir","Ladakh",
  "Lakshadweep","Puducherry",
];

export default function NewCustomerPage() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "", gstin: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Customer name is required."); return; }
    setError("");
    setSaving(true);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      bustCache("/api/customers");
      toast({ type: "success", title: "Customer created", message: "New customer added." });
      router.push("/customers");
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d?.error ?? "Failed to create customer.");
    }
  }

  return (
    <>
    {saving && <OverlayLoader text="Saving…" />}
    <div className="page-stack" style={{ maxWidth: "42rem" }}>
      <Breadcrumb items={[{ label: "Customers", href: "/customers" }, { label: "New Customer" }]} />

      <div>
        <h1 className="page-title">New Customer</h1>
        <p className="page-sub">Add a new customer to your directory</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="form-card">
        <FormField label="Customer Name" required>
          <Input name="name" required value={form.name} onChange={handleChange} placeholder="e.g. ABC Enterprises" autoFocus />
        </FormField>

        <div className="form-grid-2">
          <FormField label="Phone">
            <Input name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="10-digit mobile" />
          </FormField>
          <FormField label="Email">
            <Input name="email" type="email" value={form.email} onChange={handleChange} placeholder="billing@customer.com" />
          </FormField>
        </div>

        <FormField label="Address">
          <Textarea name="address" rows={2} value={form.address} onChange={handleChange} placeholder="Street address, building, floor…" />
        </FormField>

        <div className="form-grid-3">
          <FormField label="City">
            <Input name="city" value={form.city} onChange={handleChange} placeholder="City" />
          </FormField>
          <FormField label="State">
            <Select name="state" value={form.state} onChange={handleChange}>
              <option value="">Select state</option>
              {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>
          <FormField label="Pincode">
            <Input name="pincode" value={form.pincode} onChange={handleChange} placeholder="6-digit PIN" maxLength={6} />
          </FormField>
        </div>

        <FormField label="GSTIN" hint="Leave blank if customer is unregistered.">
          <Input name="gstin" value={form.gstin} onChange={handleChange} placeholder="15-character GST number" maxLength={15} mono />
        </FormField>

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}>
            Add Customer
          </Button>
          <Button variant="secondary" href="/customers">Cancel</Button>
        </div>
      </form>
    </div>
    </>
  );
}
