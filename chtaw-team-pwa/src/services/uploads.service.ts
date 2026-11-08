import { api, ApiClient, ApiError, errorMessage } from "./api-client";
import type { Message } from "@/types";
export function validateImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type))
    throw new ApiError(400, "Choisissez une image JPG, PNG, WebP ou GIF.");
  if (file.size > 5 * 1024 * 1024) throw new ApiError(400, "Choisissez une image de 5 Mo maximum.");
}
export class UploadsService {
  constructor(private client: ApiClient = api) {}
  async photo(
    groupId: string,
    file: File,
    caption: string,
    onProgress?: (percent: number) => void,
    retried = false,
  ): Promise<Message> {
    validateImage(file);
    if (typeof XMLHttpRequest === "undefined") {
      const data = new FormData();
      data.append("file", file);
      if (caption) data.append("caption", caption);
      return this.client.request<Message>(`/groups/${encodeURIComponent(groupId)}/photos`, {
        method: "POST",
        body: data,
      });
    }
    const token = await this.client.accessToken();
    const upload = (): Promise<Message> =>
      new Promise((resolve, reject) => {
        const data = new FormData();
        data.append("file", file);
        if (caption) data.append("caption", caption);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", this.client.url(`/groups/${encodeURIComponent(groupId)}/photos`));
        xhr.withCredentials = true;
        xhr.timeout = 120000;
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onerror = () => reject(new ApiError(0, "Téléversement interrompu. Réessayez."));
        xhr.ontimeout = () => reject(new ApiError(0, "Téléversement trop long. Réessayez."));
        xhr.onload = () => {
          let body: unknown;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            reject(new ApiError(xhr.status, "Réponse illisible."));
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve(body as Message);
          else reject(new ApiError(xhr.status, errorMessage(body)));
        };
        xhr.send(data);
      });
    try {
      return await upload();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && !retried) {
        await this.client.refresh();
        return this.photo(groupId, file, caption, onProgress, true);
      }
      throw error;
    }
  }
}
export const uploadsService = new UploadsService();
