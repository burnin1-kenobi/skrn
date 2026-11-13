import { Suspense } from "react";
import { EditorRoute } from "./EditorRoute";

export default function EditorPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-faint">Abrindo editor…</p>}>
      <EditorRoute />
    </Suspense>
  );
}
