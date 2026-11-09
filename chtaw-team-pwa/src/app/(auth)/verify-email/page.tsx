import { Suspense } from "react";
import { FirebaseActions } from "@/components/auth/firebase-actions";
export default function Page() {
  return <Suspense fallback={<p>Chargement…</p>}><FirebaseActions screen="verify" /></Suspense>;
}
