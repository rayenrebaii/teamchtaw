import { AccountAction } from "@/components/auth/account-action";
import { Suspense } from "react";
import { FirebaseActions } from "@/components/auth/firebase-actions";
export default function Page() {
  return process.env.NEXT_PUBLIC_AUTH_PROVIDER === "firebase"
    ? <Suspense><FirebaseActions screen="forgot" /></Suspense>
    : <AccountAction forgot />;
}
