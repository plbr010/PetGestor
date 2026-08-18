import {
  ATTACHMENT_PHASE_LABELS,
  PET_ATTACHMENT_CATEGORIES,
  PET_ATTACHMENT_CATEGORY_LABELS,
} from "@/features/attachments/constants";
import { uploadPetAttachmentAction } from "@/features/attachments/actions";
import type { AttachmentView } from "@/features/attachments/types";
import { AttachmentGrid } from "@/features/attachments/components/attachment-grid";
import { AttachmentUploadField } from "@/features/attachments/components/attachment-upload-field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PetAttachmentsPanel({
  petId,
  attachments,
}: {
  petId: string;
  attachments: AttachmentView[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Arquivos e documentos</CardTitle>
        <CardDescription>Carteira de vacinação, laudos, PDFs e fotos do pet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <AttachmentUploadField
          action={uploadPetAttachmentAction}
          hiddenFields={{ petId }}
          categoryOptions={PET_ATTACHMENT_CATEGORIES.map((value) => ({
            value,
            label: PET_ATTACHMENT_CATEGORY_LABELS[value],
          }))}
          submitLabel="Adicionar arquivo"
          fileLabel="Imagem ou PDF"
        />
        <AttachmentGrid attachments={attachments} scope="pet" />
      </CardContent>
    </Card>
  );
}

export function PetGalleryPanel({
  petId,
  initialPage,
  gallery,
}: {
  petId: string;
  initialPage: number;
  gallery: import("@/features/attachments/types").PetGalleryPage;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Galeria</CardTitle>
        <CardDescription>Fotos do pet e dos atendimentos, mais recentes primeiro.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {gallery.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma foto na galeria ainda.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.items.map((item) => (
              <a
                key={`${item.source}-${item.id}`}
                href={item.fileUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-xl border"
              >
                {item.thumbUrl || item.fileUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbUrl ?? item.fileUrl ?? ""}
                    alt={item.fileName}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square bg-muted/30" />
                )}
                <div className="p-2 text-xs text-muted-foreground">
                  {item.phase ? ATTACHMENT_PHASE_LABELS[item.phase] : item.category}
                </div>
              </a>
            ))}
          </div>
        )}

        {gallery.hasMore ? (
          <a
            href={`/dashboard/pets/${petId}?galeria=${initialPage + 1}#galeria`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium"
          >
            Carregar mais
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
