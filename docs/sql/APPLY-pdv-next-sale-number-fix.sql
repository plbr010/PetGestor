-- PetGestor — corrigir numeração de vendas do PDV
-- Erro: FOR UPDATE is not allowed with aggregate functions
-- Aplique no SQL Editor antes de rodar o seed demo ou ao usar complete_product_sale.

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
