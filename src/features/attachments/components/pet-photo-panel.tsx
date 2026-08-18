"use client";

import { useActionState, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";

import {
  removePetPhotoAction,
  uploadPetPhotoAction,
  type AttachmentActionState,
} from "@/features/attachments/actions";
import { prepareImageUpload } from "@/features/attachments/image-client";
import type { PetPhotoView } from "@/features/attachments/types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AttachmentActionState = {};

export function PetPhotoPanel({
  petId,
  petName,
  photo,
}: {
  petId: string;
  petName: string;
  photo: PetPhotoView;
}) {
  const [uploadState, uploadAction, isUploading] = useActionState(
    uploadPetPhotoAction,
    initialState,
  );
  const [removeState, removeAction, isRemoving] = useActionState(
    removePetPhotoAction.bind(null, petId),
    initialState,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];

    if (!file) {
      setLocalError("Selecione uma foto.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setLocalError("Use uma imagem JPG, PNG ou WebP.");
      return;
    }

    try {
      const prepared = await prepareImageUpload(file);
      formData.set("file", new File([prepared.optimized], "photo.webp", { type: "image/webp" }));
      formData.set("thumbFile", new File([prepared.thumb], "thumb.webp", { type: "image/webp" }));
    } catch {
      setLocalError("Não foi possível processar a imagem.");
      return;
    }

    uploadAction(formData);
  }

  const initials = petName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
      <Avatar className="size-24">
        {photo.photoUrl || photo.thumbUrl ? (
          <AvatarImage src={photo.thumbUrl ?? photo.photoUrl ?? undefined} alt={petName} />
        ) : null}
        <AvatarFallback className="text-lg">{initials || "P"}</AvatarFallback>
      </Avatar>

      <div className="flex-1 space-y-3">
        <div>
          <h3 className="font-medium">Foto do pet</h3>
          <p className="text-sm text-muted-foreground">
            Aparece na ficha e em listagens quando disponível.
          </p>
        </div>

        {uploadState.error || removeState.error || localError ? (
          <FormFeedback
            message={uploadState.error ?? removeState.error ?? localError ?? ""}
            variant="error"
          />
        ) : null}
        {uploadState.success || removeState.success ? (
          <FormFeedback
            message={uploadState.success ?? removeState.success ?? ""}
            variant="success"
          />
        ) : null}

        <form onSubmit={handleUpload} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="petId" value={petId} />
          <Input
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="min-h-11"
          />
          <Button type="submit" className="min-h-11" disabled={isUploading}>
            {isUploading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Camera className="size-4" />
                {photo.photoUrl ? "Trocar foto" : "Adicionar foto"}
              </>
            )}
          </Button>
        </form>

        {photo.photoUrl ? (
          <form action={removeAction}>
            <Button type="submit" variant="outline" className="min-h-11" disabled={isRemoving}>
              <Trash2 className="size-4" />
              Remover foto
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
