import {
  ATTACHMENT_PHASES,
  ATTACHMENT_PHASE_LABELS,
  SERVICE_ORDER_ATTACHMENT_CATEGORIES,
  SERVICE_ORDER_ATTACHMENT_CATEGORY_LABELS,
} from "@/features/attachments/constants";
import { uploadServiceOrderAttachmentAction } from "@/features/attachments/actions";
import { buildBeforeAfterPair } from "@/features/attachments/queries";
import type { AttachmentView } from "@/features/attachments/types";
import { AttachmentGrid } from "@/features/attachments/components/attachment-grid";
import { AttachmentUploadField } from "@/features/attachments/components/attachment-upload-field";
import { BeforeAfterView } from "@/features/attachments/components/before-after-view";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ServiceOrderAttachmentsPanel({
  serviceOrderId,
  attachments,
}: {
  serviceOrderId: string;
  attachments: AttachmentView[];
}) {
  const beforeAfter = buildBeforeAfterPair(attachments);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fotos e anexos</CardTitle>
        <CardDescription>Registros visuais deste atendimento.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <AttachmentUploadField
          action={uploadServiceOrderAttachmentAction}
          hiddenFields={{ serviceOrderId }}
          categoryOptions={SERVICE_ORDER_ATTACHMENT_CATEGORIES.map((value) => ({
            value,
            label: SERVICE_ORDER_ATTACHMENT_CATEGORY_LABELS[value],
          }))}
          phaseOptions={ATTACHMENT_PHASES.map((value) => ({
            value,
            label: ATTACHMENT_PHASE_LABELS[value],
          }))}
          showPhase
          submitLabel="Adicionar foto"
          fileLabel="Imagem ou PDF"
        />

        <BeforeAfterView pair={beforeAfter} />
        <AttachmentGrid attachments={attachments} scope="service_order" />
      </CardContent>
    </Card>
  );
}
