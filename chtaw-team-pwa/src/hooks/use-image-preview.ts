"use client";
import { useEffect, useState } from "react";
import { validateImage } from "@/services/uploads.service";
export function useImagePreview() {
  const [selected, setSelected] = useState<{ file: File; url: string }>();
  useEffect(
    () => () => {
      if (selected) URL.revokeObjectURL(selected.url);
    },
    [selected],
  );
  return {
    file: selected?.file,
    preview: selected?.url,
    select: (file?: File) => {
      if (!file) {
        setSelected(undefined);
        return;
      }
      validateImage(file);
      setSelected({ file, url: URL.createObjectURL(file) });
    },
  };
}
