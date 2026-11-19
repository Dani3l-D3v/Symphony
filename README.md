# Symphony — painel administrativo

Painel administrativo responsivo para acompanhar solicitações, equipe e disponibilidade de serviços. Construído com React, TypeScript, FastAPI e PostgreSQL.

## Executar com Docker

Requer Docker Desktop com o Compose v2. No PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Abra `http://localhost:5173`. A documentação interativa da API fica em `http://localhost:8000/docs`.

No primeiro início, os dados de demonstração e o administrador inicial são criados automaticamente:

- E-mail: `admin@example.com`
- Senha: `DevOnly-ChangeThis123!`

Essas credenciais são somente para desenvolvimento. Antes de publicar, altere `ADMIN_PASSWORD`, `POSTGRES_PASSWORD` e `JWT_SECRET` no `.env`, configure `COOKIE_SECURE=true` com HTTPS e use uma conta com privilégios mínimos. Não publique o arquivo `.env`.

Para encerrar sem apagar os dados:

```powershell
docker compose down
```

Para apagar também o banco e os dados de demonstração:

```powershell
docker compose down --volumes
```

## Executar localmente sem Docker

Tenha Python 3.10+, Node.js 20.19+ ou 22.12+ e PostgreSQL 16 em execução. Crie um banco chamado `symphony`, copie `.env.example` para `.env` e ajuste `DATABASE_URL` para `localhost`. No primeiro terminal:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:DATABASE_URL = "postgresql+psycopg://symphony:dev-only-change-this-password@localhost:5432/symphony"
$env:JWT_SECRET = "local-development-secret-change-before-deploy"
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "DevOnly-ChangeThis123!"
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Em outro terminal:

```powershell
npm install
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://127.0.0.1:5173`.

## Recursos

- Login com sessão JWT em cookie `HttpOnly`, hash Argon2id e expiração de 12 horas.
- Contas com funções de administrador e equipe. Somente administradores gerenciam os acessos.
- Cadastro e gestão de usuários; protege contra suspensão ou remoção do último administrador.
- Histórico de solicitações: cadastro, busca, filtro por status, alteração de andamento e exclusão.
- Cadastro de serviços e atualização de estado: operacional, manutenção ou instabilidade.
- Indicadores, solicitações recentes e gráficos calculados com base nos dados salvos.
- Perfil, sair da conta, feedback por e-mail e layout adaptado para celular.

As senhas não são retornadas pela API. Os dados iniciais são exemplos locais; cadastre os usuários reais pela tela de equipe. Para publicação multiusuário, use HTTPS, segredo aleatório, credenciais fortes, backup do PostgreSQL, migrações versionadas e proteção contra abuso.

## Testes

```powershell
python -m unittest discover -s tests -v
npm run build
```
