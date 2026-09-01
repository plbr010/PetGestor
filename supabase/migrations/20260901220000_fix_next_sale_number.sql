-- Corrige next_sale_number: FOR UPDATE não é permitido com agregados (max).
-- Usa advisory lock transacional por empresa para serializar numeração.

CREATE OR REPLACE FUNCTION private.next_sale_number(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_company_id::text));

  SELECT coalesce(max(sale_number), 0) + 1 INTO v_next
  FROM public.sales
  WHERE company_id = p_company_id;

  RETURN v_next;
END;
$$;
