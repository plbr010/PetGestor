"use client";

import { useState } from "react";
import { Download, Eye, FileText, Trash2 } from "lucide-react";

import {
  archivePetAttachmentAction,
  archiveServiceOrderAttachmentAction,
  type AttachmentActionState,
} from "@/features/attachments/actions";
import {
  PET_ATTACHMENT_CATEGORY_LABELS,
  SERVICE_ORDER_ATTACHMENT_CATEGORY_LABELS,
} from "@/features/attachments/constants";
import type { AttachmentView } from "@/features/attachments/types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";

type AttachmentGridProps = {
  attachments: AttachmentView[];
  scope: "pet" | "service_order";
};

export function AttachmentGrid({ attachments, scope }: AttachmentGridProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AttachmentActionState>({});

  if (attachments.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum arquivo enviado ainda.</p>;
  }

  return (
    <div className="space-y-4">
      {feedback.error ? <FormFeedback message={feedback.error} variant="error" /> : null}
      {feedback.success ? <FormFeedback message={feedback.success} variant="success" /> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {attachments.map((attachment) => {
          const label =
            scope === "pet"
              ? (PET_ATTACHMENT_CATEGORY_LABELS[
                  attachment.category as keyof typeof PET_ATTACHMENT_CATEGORY_LABELS
                ] ?? attachment.category)
              : (SERVICE_ORDER_ATTACHMENT_CATEGORY_LABELS[
                  attachment.category as keyof typeof SERVICE_ORDER_ATTACHMENT_CATEGORY_LABELS
                ] ?? attachment.category);

          return (
            <article key={attachment.id} className="overflow-hidden rounded-xl border">
              <button
                type="button"
                className="block w-full"
                onClick={() => {
                  if (attachment.isImage && attachment.fileUrl) {
                    setPreviewUrl(attachment.fileUrl);
                  }
                }}
              >
                <div className="aspect-square bg-muted/40">
                  {attachment.isImage && attachment.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.thumbUrl}
                      alt={attachment.fileName}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center text-sm text-muted-foreground">
                      <FileText className="size-8" />
                      PDF
                    </div>
                  )}
                </div>
              </button>

              <div className="space-y-2 p-3 text-sm">
                <p className="truncate font-medium">{attachment.fileName}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
                {attachment.description ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {attachment.description}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {attachment.fileUrl ? (
                    <>
                      <a
                        href={attachment.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-sm"
                      >
                        <Eye className="size-4" />
                        Ver
                      </a>
                      <a
                        href={attachment.fileUrl}
                        download={attachment.fileName}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-sm"
                      >
                        <Download className="size-4" />
                        Baixar
                      </a>
                    </>
                  ) : null}

                  <form
                    action={async () => {
                      const result =
                        scope === "pet"
                          ? await archivePetAttachmentAction(attachment.id)
                          : await archiveServiceOrderAttachmentAction(attachment.id);
                      setFeedback(result);
                    }}
                  >
                    <Button type="submit" variant="ghost" size="sm" className="min-h-9 text-destructive">
                      <Trash2 className="size-4" />
                      Remover
                    </Button>
                  </form>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {previewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Fechar preview"
            onClick={() => setPreviewUrl(null)}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Preview"
            className="relative max-h-[90vh] max-w-full rounded-xl object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
