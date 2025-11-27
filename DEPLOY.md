# Guia de Deploy com CI/CD

Este guia explica como configurar o deploy automático do bot usando GitHub Actions.

## Pré-requisitos

1. ✅ Bot já rodando na máquina AWS
2. ✅ Docker e Docker Compose instalados na máquina AWS
3. ✅ Conta no Docker Hub (ou AWS ECR configurado)
4. ✅ Acesso SSH à máquina AWS

## Passo 1: Configurar Docker Hub

1. Acesse [Docker Hub](https://hub.docker.com/)
2. Crie uma conta ou faça login
3. Vá em **Account Settings** > **Security**
4. Crie um **New Access Token** (não use sua senha diretamente)
5. Anote o token criado

## Passo 2: Configurar Secrets no GitHub

1. Vá para o repositório no GitHub
2. Clique em **Settings** > **Secrets and variables** > **Actions**
3. Clique em **New repository secret** e adicione:

### Secrets Obrigatórios

| Secret | Descrição | Exemplo |
|--------|-----------|---------|
| `DOCKER_USERNAME` | Seu usuário do Docker Hub | `meuusuario` |
| `DOCKER_PASSWORD` | Token de acesso do Docker Hub | `dckr_pat_xxxxx...` |
| `AWS_SSH_PRIVATE_KEY` | Chave privada SSH (conteúdo completo) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `AWS_HOST` | IP ou hostname da máquina AWS | `54.123.45.67` ou `ec2-54-123-45-67.compute-1.amazonaws.com` |
| `AWS_USER` | Usuário SSH na AWS | `ubuntu` ou `ec2-user` |
| `AWS_PROJECT_PATH` | Caminho completo do projeto na AWS | `/home/ubuntu/my-instants-bot` |

### Como Obter a Chave SSH Privada

Se você já tem acesso SSH funcionando:

1. No seu computador local, encontre a chave privada (geralmente em `~/.ssh/`)
2. Copie o conteúdo completo do arquivo (incluindo `-----BEGIN` e `-----END`)
3. Cole no secret `AWS_SSH_PRIVATE_KEY`

**Importante**: A chave pública correspondente deve estar no `~/.ssh/authorized_keys` da máquina AWS.

## Passo 3: Configurar Docker Compose na AWS

Na sua máquina AWS, você tem duas opções:

### Opção A: Usar docker-compose.prod.yml (Recomendado)

1. Na máquina AWS, edite o `docker-compose.yml` ou renomeie `docker-compose.prod.yml`:

```bash
# Na máquina AWS
cd /caminho/do/projeto
# Edite docker-compose.yml e substitua a seção 'build' por 'image'
# Ou use o docker-compose.prod.yml como base
```

2. Atualize o `docker-compose.yml` para usar a imagem do registry:

```yaml
services:
  bot:
    image: SEU_USUARIO_DOCKER/my-instants-bot:latest  # Substitua SEU_USUARIO_DOCKER
    # Remova a seção 'build'
```

### Opção B: Manter build local (não recomendado para CI/CD)

Se preferir manter o build local, o workflow ainda funcionará, mas não será otimizado.

## Passo 4: Testar o Deploy

1. Faça um commit e push para a branch `main`:

```bash
git add .
git commit -m "Configurar CI/CD"
git push origin main
```

2. Vá para **Actions** no GitHub e acompanhe o workflow
3. Verifique os logs para garantir que tudo funcionou

## Passo 5: Verificar o Deploy

Após o workflow completar, verifique na máquina AWS:

```bash
# Conectar na máquina AWS
ssh usuario@host

# Verificar containers
docker-compose ps

# Ver logs
docker-compose logs -f bot
```

## Troubleshooting

### Erro: "Permission denied (publickey)"

- Verifique se a chave SSH privada está correta no secret
- Verifique se a chave pública está no `~/.ssh/authorized_keys` da AWS
- Teste a conexão SSH manualmente: `ssh usuario@host`

### Erro: "Cannot connect to the Docker daemon"

- Verifique se o usuário SSH tem permissão para usar Docker
- Adicione o usuário ao grupo docker: `sudo usermod -aG docker $USER`
- Faça logout e login novamente

### Erro: "docker-compose: command not found"

- Instale Docker Compose na máquina AWS
- Ou use `docker compose` (sem hífen) se for versão mais recente

### Erro: "Image pull failed"

- Verifique se `DOCKER_USERNAME` e `DOCKER_PASSWORD` estão corretos
- Verifique se a imagem foi criada no Docker Hub
- Verifique se o nome da imagem no `docker-compose.yml` está correto

### Workflow não dispara

- Verifique se está fazendo push para a branch `main`
- Verifique se o workflow está habilitado em **Settings** > **Actions** > **General**

## Execução Manual

Você também pode executar o workflow manualmente:

1. Vá para **Actions** no GitHub
2. Selecione o workflow **Build and Deploy**
3. Clique em **Run workflow**
4. Selecione a branch e clique em **Run workflow**

## Alternativa: Usar AWS ECR

Se preferir usar AWS ECR ao invés do Docker Hub:

1. Crie um repositório no ECR
2. Modifique o workflow para usar `aws-actions/amazon-ecr-login@v2`
3. Adicione os secrets `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY`
4. Atualize as tags da imagem para usar o registry do ECR

## Segurança

- ✅ Nunca commite secrets no código
- ✅ Use tokens ao invés de senhas
- ✅ Rotacione tokens regularmente
- ✅ Use chaves SSH específicas para CI/CD
- ✅ Limite permissões da chave SSH quando possível

