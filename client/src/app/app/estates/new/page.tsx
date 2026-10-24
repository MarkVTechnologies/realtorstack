"use client";

import { EstateEditor } from "@/components/app/EstateEditor";
import { PageHeader } from "@/components/ui";

export default function NewEstatePage() {
  return (
    <>
      <PageHeader title="Add estate" back={{ href: "/app/estates", label: "Estates" }} description="Save the estate first, then add products, prices and payment plans." />
      <EstateEditor />
    </>
  );
}
