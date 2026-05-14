"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ProgramBuilder, programApiToState } from "../_components/ProgramBuilder";

export default function EditProgramPage() {
  const { id } = useParams<{ id: string }>();
  const [initial, setInitial] = useState<ReturnType<typeof programApiToState> | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/programs/${id}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => { if (data) setInitial(programApiToState(data)); });
  }, [id]);

  if (notFound) return <div className="p-8 text-muted-foreground">Program not found.</div>;
  if (!initial) return <div className="p-8"><div className="h-8 w-48 bg-muted rounded animate-pulse" /></div>;

  return <ProgramBuilder programId={id} initial={initial} />;
}
