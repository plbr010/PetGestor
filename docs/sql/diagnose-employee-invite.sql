-- Diagnóstico rápido: convite de funcionário (rode no SQL Editor do Supabase)
-- Troque o e-mail abaixo pelo Gmail do funcionário.

-- 1) Funções necessárias existem?
SELECT
  to_regprocedure('public.lookup_pending_invite_by_email(text)') IS NOT NULL AS has_lookup,
  to_regprocedure('public.peek_pending_invite()') IS NOT NULL AS has_peek,
  to_regprocedure('private.expire_stale_member_invites()') IS NOT NULL AS has_expire;

-- 2) Convites para o e-mail
SELECT id, company_id, employee_id, email, status, expires_at, created_at, accepted_at
FROM public.company_member_invites
WHERE lower(email) = lower('COLE_O_EMAIL_AQUI@gmail.com')
ORDER BY created_at DESC;

-- 3) Usuário Auth para o e-mail (confirmado ou só convidado?)
SELECT id, email, email_confirmed_at, invited_at, created_at, last_sign_in_at
FROM auth.users
WHERE lower(email) = lower('COLE_O_EMAIL_AQUI@gmail.com');
