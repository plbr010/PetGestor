"use client";

import { useActionState, useId, useState } from "react";
import { Camera, FileUp, Loader2 } from "lucide-react";

import type { AttachmentActionState } from "@/features/attachments/actions";
import {
  prepareImageUpload,
  shouldOptimizeImage,
} from "@/features/attachments/image-client";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type UploadFieldProps = {
  action: (prevState: AttachmentActionState, formData: FormData) => Promise<AttachmentActionState>;
  hiddenFields: Record<string, string>;
  accept?: string;
  categoryOptions?: Array<{ value: string; label: string }>;
  phaseOptions?: Array<{ value: string; label: string }>;
  showDescription?: boolean;
  showPhase?: boolean;
  submitLabel?: string;
  fileLabel?: string;
};

const initialState: AttachmentActionState = {};

export function AttachmentUploadField({
  action,
  hiddenFields,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  categoryOptions,
  phaseOptions,
  showDescription = true,
  showPhase = false,
  submitLabel = "Enviar arquivo",
  fileLabel = "Arquivo",
}: UploadFieldProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const formId = useId();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];

    if (!file) {
      setLocalError("Selecione um arquivo.");
      return;
    }

    if (shouldOptimizeImage(file)) {
      try {
        const prepared = await prepareImageUpload(file);
        formData.set("file", new File([prepared.optimized], "upload.webp", { type: "image/webp" }));
        formData.set(
          "thumbFile",
          new File([prepared.thumb], "thumb.webp", { type: "image/webp" }),
        );
      } catch {
        setLocalError("Não foi possível processar a imagem.");
        return;
      }
    }

    formAction(formData);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border p-4">
      {Object.entries(hiddenFields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}

      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      {state.success ? <FormFeedback message={state.success} variant="success" /> : null}
      {localError ? <FormFeedback message={localError} variant="error" /> : null}

      <div className="space-y-2">
        <Label htmlFor={`${formId}-file`}>{fileLabel}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`${formId}-file`}
            name="file"
            type="file"
            accept={accept}
            className="min-h-11"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          />
          <div className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm text-muted-foreground">
            {accept.includes("image") ? <Camera className="size-4" /> : <FileUp className="size-4" />}
            {fileName ?? "Nenhum arquivo"}
          </div>
        </div>
      </div>

      {categoryOptions ? (
        <div className="space-y-2">
          <Label htmlFor={`${formId}-category`}>Tipo</Label>
          <Select id={`${formId}-category`} name="category" defaultValue={categoryOptions[0]?.value}>
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {showPhase && phaseOptions ? (
        <div className="space-y-2">
          <Label htmlFor={`${formId}-phase`}>Momento (opcional)</Label>
          <Select id={`${formId}-phase`} name="phase" defaultValue="">
            <option value="">Geral</option>
            {phaseOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {showDescription ? (
        <div className="space-y-2">
          <Label htmlFor={`${formId}-description`}>Observação (opcional)</Label>
          <Textarea
            id={`${formId}-description`}
            name="description"
            rows={2}
            maxLength={500}
            placeholder="Ex.: Carteira de vacinação atualizada."
          />
        </div>
      ) : null}

      <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Enviando...
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
