-- PetGestor — informações importantes do pet (comportamento, restrições, cuidados)

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS important_notes text;

ALTER TABLE public.pets
  DROP CONSTRAINT IF EXISTS pets_important_notes_length;

ALTER TABLE public.pets
  ADD CONSTRAINT pets_important_notes_length CHECK (
    important_notes IS NULL
    OR char_length(important_notes) <= 3000
  );

COMMENT ON COLUMN public.pets.important_notes IS
  'Cuidados operacionais destacados: comportamento, restrições, medos, sensibilidades.';
