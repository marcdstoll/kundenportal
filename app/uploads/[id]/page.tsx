"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useUploads } from "@/lib/upload-manager";
import { UploadStatus } from "@/app/components/upload-tree";

// Stand eines Upload-Vorgangs (läuft nur im Browser – die Daten kommen aus dem Upload-Manager)
export default function UploadPage() {
  const { id } = useParams<{ id: string }>();
  const v = useUploads().find((x) => x.id === id);

  return (
    <div className="max-w-2xl space-y-4 px-4 pb-10 pt-6 sm:px-6 sm:pt-8 md:px-10">
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Projekt-Upload</h1>
      {v ? (
        <>
          <UploadStatus vorgang={v} />
          {(v.status === "laeuft" || v.status === "wartet") && (
            <p className="text-sm text-muted">
              Du kannst im Portal weiterarbeiten oder ein weiteres Projekt anlegen – der Upload läuft weiter. Nur diesen
              Tab bitte nicht schließen.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-2 rounded-xl border border-dashed border-line p-6 text-sm text-muted">
          <p>Dieser Upload ist abgeschlossen oder nicht mehr vorhanden.</p>
          <Link href="/dashboard" className="text-accent hover:underline">
            Zu den Projekten
          </Link>
        </div>
      )}
    </div>
  );
}
