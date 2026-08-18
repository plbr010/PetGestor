"use client";

import type { AttachmentView, BeforeAfterPair } from "@/features/attachments/types";

export function BeforeAfterView({ pair }: { pair: BeforeAfterPair }) {
  if (!pair.before && !pair.after) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Antes e depois</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <PhotoCard title="Antes" attachment={pair.before} />
        <PhotoCard title="Depois" attachment={pair.after} />
      </div>
    </div>
  );
}

function PhotoCard({
  title,
  attachment,
}: {
  title: string;
  attachment: AttachmentView | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="border-b px-3 py-2 text-sm font-medium">{title}</div>
      {attachment?.fileUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attachment.fileUrl} alt={title} className="aspect-square w-full object-cover" />
      ) : (
        <div className="flex aspect-square items-center justify-center bg-muted/30 text-sm text-muted-foreground">
          Sem foto
        </div>
      )}
      {attachment?.description ? (
        <p className="p-3 text-xs text-muted-foreground">{attachment.description}</p>
      ) : null}
    </div>
  );
}
