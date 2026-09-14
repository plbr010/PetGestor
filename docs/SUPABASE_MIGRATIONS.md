# Aplicar migrations no Supabase (também pelo celular)

O BLOCO 9 **já foi aplicado** no SQL Editor. Este guia é para as **próximas** migrations, sem copiar SQL.

Eu (agente Cloud) **não** consigo logar no seu Supabase daqui. A automação usa um secret no GitHub.

## Uma vez (celular)

1. Abra https://github.com/plbr010/PetGestor/settings/secrets/actions
2. **New repository secret**
3. Name: `SUPABASE_DB_URL`
4. Value: no Supabase → **Project Settings → Database → Connection string → URI**
   - Use **Direct connection** (porta `5432`), não o pooler (`6543`)
   - Troque `[YOUR-PASSWORD]` pela senha do banco
5. Save

Pronto. Cada migration nova que entrar na `main` o GitHub aplica sozinho.

## Testar no celular

GitHub → **Actions** → **Apply Supabase migrations** → **Run workflow**.

Run manual não reaplica o histórico (isso quebraria o banco). Ele só confirma que o secret existe. A aplicação automática acontece no **push para `main`** com arquivo novo em `supabase/migrations/`.

## Se a senha do banco não estiver no celular

Supabase → Project Settings → Database → **Reset database password**. Use a nova senha na URI e no secret.
