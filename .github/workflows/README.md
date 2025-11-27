# GitHub Actions CI/CD

Este diretório contém os workflows de CI/CD para deploy automático do bot.

## Configuração

Para que o workflow funcione, você precisa configurar os seguintes secrets no GitHub:

### Secrets Necessários

1. **DOCKER_USERNAME**: Seu usuário do Docker Hub
2. **DOCKER_PASSWORD**: Token de acesso do Docker Hub (não use sua senha, crie um token em Account Settings > Security)
3. **AWS_SSH_PRIVATE_KEY**: Chave privada SSH para acessar a máquina AWS
4. **AWS_HOST**: Endereço IP ou hostname da máquina AWS
5. **AWS_USER**: Usuário SSH na máquina AWS (geralmente `ubuntu`, `ec2-user`, ou `admin`)
6. **AWS_PROJECT_PATH**: Caminho completo do projeto na máquina AWS (ex: `/home/ubuntu/my-instants-bot`)

### Como Configurar os Secrets

1. Vá para o repositório no GitHub
2. Clique em **Settings** > **Secrets and variables** > **Actions**
3. Clique em **New repository secret**
4. Adicione cada um dos secrets listados acima

### Alternativa: Usar AWS ECR ao invés de Docker Hub

Se preferir usar AWS ECR ao invés do Docker Hub, você pode modificar o workflow para:

1. Usar `aws-actions/amazon-ecr-login@v2` para login no ECR
2. Usar o registry do ECR no lugar do Docker Hub
3. Adicionar as secrets `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY`

### Estrutura do Deploy

O workflow executa os seguintes passos:

1. ✅ Faz checkout do código
2. 🏗️ Builda a imagem Docker usando Docker Buildx
3. 📤 Faz push da imagem para o registry
4. 🔐 Conecta via SSH na máquina AWS
5. 📥 Faz pull da nova imagem
6. 🛑 Para os containers existentes
7. 🚀 Inicia os containers com a nova imagem
8. 🧹 Limpa imagens antigas não utilizadas
9. ✅ Verifica o status do deploy

### Quando o Workflow Dispara

- **Push para `main`**: Deploy automático quando código é mergeado na branch principal
- **Workflow Dispatch**: Permite execução manual através da interface do GitHub Actions

