"use client";

import { TaxonomyDetailPage } from "@/components/catalog/TaxonomyDetailPage";

export default function BrandViewPage() {
  return (
    <TaxonomyDetailPage
      entityLabel="Brand"
      apiBase="/api/brands"
      listHref="/brands"
      listLabel="Brands"
    />
  );
}
