import { api } from "./api-client";
import { validateImage } from "./uploads.service";
import type { User } from "@/types";
export const profilePhotosService = {
  save(file: File) {
    validateImage(file);
    const data = new FormData(); data.append("file", file);
    return api.request<User>("/users/me/photo", { method: "POST", body: data });
  },
  remove: () => api.request<User>("/users/me/photo", { method: "DELETE" }),
};
