import { NextResponse } from "next/server";

import { uploadPetPhoto } from "@/features/attachments/upload-pet-photo";
import { rethrowNavigationErrors } from "@/lib/server-action-errors";
import { isValidUuid } from "@/lib/security/uuid";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "Pet inválido." }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const result = await uploadPetPhoto(id, formData);

    if (result.error) {
      const status = result.error.includes("migration") ? 503 : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    rethrowNavigationErrors(error);
    console.error("[api:pets:photo]", error);
    return NextResponse.json(
      { error: "Não foi possível enviar a foto. Tente novamente." },
      { status: 500 },
    );
  }
}
