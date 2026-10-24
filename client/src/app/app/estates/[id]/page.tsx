"use client";

import { useParams } from "next/navigation";
import { useApi } from "@/lib/api";
import { EstateEditor, type EstateDoc } from "@/components/app/EstateEditor";
import { ErrorNote, Loading, PageHeader } from "@/components/ui";

export default function EditEstatePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useApi<EstateDoc>(`/estates/${id}`, { revalidateOnFocus: false });
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHeader title={data.name} back={{ href: "/app/estates", label: "Estates" }} />
      <EstateEditor key={data._id} initial={data} />
    </>
  );
}
