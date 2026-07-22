"use client";

import { Input, Textarea, Select, FormField } from "@/components/ui/Input";
import { PRODUCT_UNITS, PRODUCT_GST_RATES, type ProductFormData, type ProductFieldErrors } from "@/lib/productForm";

interface Brand { id: string; name: string; }
interface Category { id: string; name: string; }

interface ProductFormFieldsProps {
  form: ProductFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  fieldErrors: ProductFieldErrors;
  brands: Brand[];
  categories: Category[];
  disabled?: boolean;
  stockLabel?: string;
}

// Product name/SKU/description/unit/price/GST/stock/brand/category fields —
// shared by the New Product and Edit Product pages so the two forms can't drift apart.
export function ProductFormFields({ form, onChange, fieldErrors, brands, categories, disabled, stockLabel = "Opening Stock" }: ProductFormFieldsProps) {
  return (
    <>
      <div className="form-grid-2">
        <FormField label="Product Name" required error={fieldErrors.name}>
          <Input name="name" value={form.name} onChange={onChange} placeholder="e.g. Beaker 250ml Borosilicate" disabled={disabled} />
        </FormField>
        <FormField label="SKU / Item Code">
          <Input name="sku" value={form.sku} onChange={onChange} placeholder="e.g. BKR-250-BOR" mono disabled={disabled} />
        </FormField>
      </div>

      <FormField label="Description">
        <Textarea name="description" rows={2} value={form.description} onChange={onChange} placeholder="Brief product description…" disabled={disabled} />
      </FormField>

      <div className="form-grid-3">
        <FormField label="Unit">
          <Select name="unit" value={form.unit} onChange={onChange} disabled={disabled}>
            {PRODUCT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </FormField>
        <FormField label="Selling Price (₹)" required error={fieldErrors.price}>
          <Input name="price" type="number" min="0" step="0.01" value={form.price} onChange={onChange} placeholder="0.00" disabled={disabled} />
        </FormField>
        <FormField label="GST Rate">
          <Select name="gstRate" value={form.gstRate} onChange={onChange} disabled={disabled}>
            {PRODUCT_GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
          </Select>
        </FormField>
      </div>

      <div className="form-grid-2">
        <FormField label="Purchase Price (₹)" hint="Used to auto-fill the rate on Purchase Bills." error={fieldErrors.purchasePrice}>
          <Input name="purchasePrice" type="number" min="0" step="0.01" value={form.purchasePrice} onChange={onChange} placeholder="0.00" disabled={disabled} />
        </FormField>
      </div>

      <div className="form-grid-2">
        <FormField label={stockLabel} error={fieldErrors.stock}>
          <Input name="stock" type="number" min="0" value={form.stock} onChange={onChange} disabled={disabled} />
        </FormField>
        <FormField label="Minimum Stock" hint="Alert triggers when stock drops to or below this." error={fieldErrors.minStock}>
          <Input name="minStock" type="number" min="0" value={form.minStock} onChange={onChange} disabled={disabled} />
        </FormField>
      </div>

      <div className="form-grid-2">
        <FormField label="Brand">
          <Select name="brandId" value={form.brandId} onChange={onChange} disabled={disabled}>
            <option value="">— None —</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Category">
          <Select name="categoryId" value={form.categoryId} onChange={onChange} disabled={disabled}>
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FormField>
      </div>
    </>
  );
}
