# 01 — Autenticação

> **Persona:** Gerente de Obra (role `manager`)
> **Método:** Supabase Auth — `signInWithPassword`

---

## Contexto

O gerente de obra **não se cadastra sozinho**. A conta é criada pelo engenheiro responsável no portal web via Supabase Auth Admin API, com e-mail e senha temporária definidos pelo engenheiro.

O gerente recebe as credenciais e faz login no APK. Ele pode alterar a senha pelo próprio APK, mas **não** pode criar contas nem alterar seu role.

---

## Fluxo de Login

### 1. Chamada de autenticação

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'gerente@exemplo.com',
  password: 'senha-definida-pelo-engenheiro',
});
```

**Resposta de sucesso (`data`):**

```json
{
  "session": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "v1.MjQ1Njc4OTAx...",
    "expires_in": 3600,
    "expires_at": 1735689600,
    "token_type": "bearer",
    "user": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "email": "gerente@exemplo.com",
      "role": "authenticated",
      "aud": "authenticated"
    }
  }
}
```

### 2. Verificação de role

Após login bem-sucedido, o APK **deve** consultar a tabela `profiles` para confirmar que o usuário é um gerente:

```typescript
const { data: profile, error } = await supabase
  .from('profiles')
  .select('id, full_name, role, is_active')
  .eq('id', session.user.id)
  .single();
```

**Resposta esperada:**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "full_name": "João da Silva",
  "role": "manager",
  "is_active": true
}
```

**Validação obrigatória:**

```typescript
if (profile.role !== 'manager') {
  // Exibir: "Acesso restrito a gerentes de obra."
  await supabase.auth.signOut();
  return;
}

if (!profile.is_active) {
  // Exibir: "Conta desativada. Entre em contato com o engenheiro responsável."
  await supabase.auth.signOut();
  return;
}
```

### 3. Persistência de sessão

O SDK do Supabase (`@supabase/supabase-js`) gerencia a sessão automaticamente:

- **Access token (JWT):** válido por 1 hora (3600s)
- **Refresh token:** usado para obter novo access token sem re-login
- O SDK renova o token automaticamente antes da expiração
- A sessão deve ser persistida no dispositivo (AsyncStorage / SecureStore)

Configuração recomendada para o APK:

```typescript
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

### 4. Formato do token

O `access_token` é um JWT padrão com os seguintes claims relevantes:

```json
{
  "sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "gerente@exemplo.com",
  "role": "authenticated",
  "aud": "authenticated",
  "exp": 1735689600,
  "iat": 1735686000
}
```

> **Nota:** O claim `role` no JWT é sempre `authenticated` (padrão do Supabase Auth). O role de negócio (`manager` / `engineer`) vive na tabela `profiles`, não no JWT.

---

## Fluxo de Refresh

O refresh de token é automático via SDK, mas caso o APK precise tratar manualmente:

```typescript
const { data, error } = await supabase.auth.refreshSession();

if (error) {
  // Sessão inválida — redirecionar para tela de login
}
```

**Quando o refresh falha:**

- Token expirado e refresh token também expirado → redirecionar para login
- Conta desativada pelo engenheiro → `signOut()` + mensagem de erro

---

## Fluxo de Logout

```typescript
await supabase.auth.signOut();
// Limpar dados locais, fila offline, cache
```

---

## Tratamento de Erros

| Cenário | `error.message` (Supabase) | Ação no APK |
| ------- | -------------------------- | ----------- |
| Credenciais inválidas | `Invalid login credentials` | Exibir: "E-mail ou senha incorretos." |
| Conta não encontrada | `Invalid login credentials` | Exibir: "E-mail ou senha incorretos." (mesmo erro, por segurança) |
| E-mail não confirmado | `Email not confirmed` | Exibir: "Conta pendente de confirmação. Entre em contato com o engenheiro." |
| Role incorreto | — (detectado via `profiles`) | Exibir: "Acesso restrito a gerentes de obra." + `signOut()` |
| Conta desativada | — (detectado via `profiles.is_active`) | Exibir: "Conta desativada. Entre em contato com o engenheiro responsável." + `signOut()` |
| Sessão expirada | `Auth session missing` / refresh falha | Redirecionar para tela de login |
| Sem conexão | Erro de rede | Exibir: "Sem conexão. Verifique sua internet." (não limpar sessão local) |

---

## Diagrama de Sequência

```
APK                         Supabase Auth              profiles (DB)
 │                               │                          │
 │─── signInWithPassword ───────►│                          │
 │                               │                          │
 │◄── session + JWT ─────────────│                          │
 │                               │                          │
 │─── SELECT role FROM profiles ─┼─────────────────────────►│
 │                               │                          │
 │◄── { role: 'manager' } ──────┼──────────────────────────│
 │                               │                          │
 │  [role OK → navegar para      │                          │
 │   tela "Minhas Obras"]        │                          │
```

---

## Tabelas envolvidas

### `profiles`

| Coluna      | Tipo         | Descrição |
| ----------- | ------------ | --------- |
| `id`        | `UUID` (PK)  | Mesmo ID do `auth.users` |
| `full_name` | `TEXT`        | Nome completo do gerente |
| `phone`     | `TEXT?`       | Telefone de contato |
| `email`     | `TEXT?`       | E-mail (espelhado de `auth.users`) |
| `role`      | `TEXT`        | `'engineer'` ou `'manager'` |
| `created_by`| `UUID?`      | ID do engenheiro que criou a conta (obrigatório para `manager`) |
| `is_active` | `BOOLEAN`    | `false` = conta desativada (soft delete) |
| `created_at`| `TIMESTAMPTZ` | Data de criação |
| `updated_at`| `TIMESTAMPTZ` | Última atualização |

**RLS:** O gerente só consegue ler seu próprio `profiles` (policy `profiles_select`).
