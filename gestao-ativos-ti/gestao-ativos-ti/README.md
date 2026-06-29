# 🖥️ Gestão de Ativos e Inventário de TI

Sistema completo com autenticação real via **Supabase** + hospedagem gratuita no **GitHub Pages**.

---

## 📁 Estrutura do projeto

```
gestao-ativos-ti/
├── index.html              ← página principal
├── css/
│   └── style.css           ← estilos
├── js/
│   ├── supabase-config.js  ← ⚠️ CONFIGURE AQUI suas chaves
│   └── app.js              ← lógica do sistema
└── sql/
    └── schema.sql          ← execute no Supabase
```

---

## 🚀 Passo a passo para colocar em produção

### ETAPA 1 — Criar projeto no Supabase (gratuito)

1. Acesse **https://supabase.com** e crie uma conta
2. Clique em **"New project"**
3. Escolha um nome (ex: `gestao-ativos-ti`) e uma senha forte
4. Aguarde ~2 minutos para o projeto inicializar

### ETAPA 2 — Criar as tabelas

1. No painel Supabase, clique em **SQL Editor** (menu lateral)
2. Clique em **"New query"**
3. Cole todo o conteúdo do arquivo `sql/schema.sql`
4. Clique em **"Run"** (▶)
5. Deve aparecer "Success" para cada comando

### ETAPA 3 — Obter as chaves da API

1. No painel Supabase, vá em **Settings → API**
2. Copie:
   - **Project URL** → ex: `https://abcdefgh.supabase.co`
   - **anon / public key** → chave longa que começa com `eyJ...`

### ETAPA 4 — Configurar o projeto

Abra o arquivo `js/supabase-config.js` e substitua:

```javascript
const SUPABASE_URL = 'https://SEU_PROJECT_ID.supabase.co';  // ← cole aqui
const SUPABASE_ANON_KEY = 'SUA_ANON_KEY_AQUI';               // ← cole aqui
```

### ETAPA 5 — Criar o primeiro usuário (admin)

1. No painel Supabase, vá em **Authentication → Users**
2. Clique em **"Add user" → "Create new user"**
3. Informe e-mail e senha do administrador
4. Após criar, vá em **Table Editor → profiles**
5. Encontre o usuário recém-criado e mude o campo `role` para `admin`

### ETAPA 6 — Publicar no GitHub Pages

1. Crie uma conta em **https://github.com** (se não tiver)
2. Clique em **"New repository"**
3. Nome: `gestao-ativos-ti` | Visibilidade: **Public**
4. Faça upload de todos os arquivos deste projeto
5. Vá em **Settings → Pages**
6. Em "Source", selecione: **Branch: main / folder: / (root)**
7. Clique em **Save**
8. Aguarde ~1 minuto e acesse a URL gerada:
   `https://SEU_USUARIO.github.io/gestao-ativos-ti`

### ETAPA 7 — Configurar domínio permitido no Supabase

1. No painel Supabase, vá em **Authentication → URL Configuration**
2. Em **"Site URL"**, coloque: `https://SEU_USUARIO.github.io`
3. Em **"Redirect URLs"**, adicione: `https://SEU_USUARIO.github.io/gestao-ativos-ti`
4. Clique em **Save**

---

## 👤 Perfis de acesso

| Perfil   | Cadastrar | Editar | Excluir | Licenças | Usuários |
|----------|-----------|--------|---------|----------|----------|
| Admin    | ✅        | ✅     | ✅      | ✅       | ✅       |
| Técnico  | ✅        | ✅     | ❌      | ✅       | ❌       |
| Auditor  | ❌        | ❌     | ❌      | ✅       | ❌       |

Para criar novos usuários: **Supabase → Authentication → Users → Add user**
Para definir o perfil: **Supabase → Table Editor → profiles → editar campo `role`**

---

## 💡 Dicas

- O plano **gratuito** do Supabase suporta até 50.000 linhas e 500 MB de banco
- O GitHub Pages é **100% gratuito** para repositórios públicos
- Para domínio próprio (ex: `ativos.suaempresa.com`), configure em Settings → Pages → Custom domain

---

## 🔧 Tecnologias utilizadas

- **Frontend**: HTML + CSS + JavaScript puro
- **Banco de dados**: Supabase (PostgreSQL)
- **Autenticação**: Supabase Auth
- **Hospedagem**: GitHub Pages
- **Gráficos**: Chart.js
- **Ícones**: Tabler Icons
