"use client";

import { TaxonomyDetailPage } from "@/components/catalog/TaxonomyDetailPage";

export default function CategoryViewPage() {
  return (
    <TaxonomyDetailPage
      entityLabel="Category"
      apiBase="/api/categories"
      listHref="/categories"
      listLabel="Categories"
    />
  );
}
