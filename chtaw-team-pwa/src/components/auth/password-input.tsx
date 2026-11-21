"use client";
import { useCopy } from "@/lib/i18n";
import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "./password-input.module.css";

export function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const { t } = useCopy();
  const [visible, setVisible] = useState(false);
  return (
    <span className={styles.field}>
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className={styles.toggle}
        aria-label={visible ? t("Masquer le mot de passe") : t("Afficher le mot de passe")}
        aria-controls={props.id}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </button>
    </span>
  );
}
