"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import {
  createCategoryAction,
  updateCategoryAction,
  archiveCategoryAction,
  type InventoryActionState,
} from "@/features/inventory/actions";
import type { ProductCategoryItem } from "@/features/inventory/types";
import { FormFeedback } from "@/components/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: InventoryActionState = {};

function CreateCategoryForm() {
  const [state, formAction, isPending] = useActionState(createCategoryAction, initialState);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      {state.success ? <FormFeedback message={state.success} variant="success" /> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1 space-y-2">
          <Label htmlFor="name" className="sr-only">
            Nova categoria
          </Label>
          <Input id="name" name="name" placeholder="Nome da categoria" required />
        </div>
        <Button type="submit" className="min-h-11 sm:self-end" disabled={isPending}>
          {isPending ? "Salvando..." : "Criar"}
        </Button>
      </div>
    </form>
  );
}

function EditCategoryRow({ category }: { category: ProductCategoryItem }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updateCategoryAction.bind(null, category.id),
    initialState,
  );
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isArchiving, startArchive] = useTransition();

  function handleArchive() {
    if (!window.confirm(`Arquivar a categoria “${category.name}”?`)) {
      return;
    }

    startArchive(async () => {
      const result = await archiveCategoryAction(category.id);
      if (result.error) {
        setArchiveError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="space-y-2 rounded-xl border p-3">
      {state.error ? <FormFeedback message={state.error} variant="error" /> : null}
      {state.success ? <FormFeedback message={state.success} variant="success" /> : null}
      {archiveError ? <FormFeedback message={archiveError} variant="error" /> : null}
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <Input name="name" defaultValue={category.name} required />
        <div className="flex gap-2">
          <Button type="submit" variant="outline" className="min-h-11 flex-1" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 flex-1"
            disabled={isArchiving}
            onClick={handleArchive}
          >
            {isArchiving ? "Arquivando..." : "Arquivar"}
          </Button>
        </div>
      </form>
    </li>
  );
}

export function CategoryManager({ categories }: { categories: ProductCategoryItem[] }) {
  const active = categories.filter((category) => !category.archived_at);

  return (
    <div className="space-y-6">
      <CreateCategoryForm />
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma categoria ativa.</p>
      ) : (
        <ul className="space-y-3">
          {active.map((category) => (
            <EditCategoryRow key={category.id} category={category} />
          ))}
        </ul>
      )}
    </div>
  );
}
