# GitHub Actions CI/CD

This directory contains CI/CD workflows for automatic bot deployment.

## Configuration

For the workflow to work, you need to configure the following secrets on GitHub:

### Required Secrets

1. **DOCKER_USERNAME**: Your Docker Hub username
2. **DOCKER_PASSWORD**: Docker Hub access token (don't use your password, create a token in Account Settings > Security)
3. **AWS_SSH_PRIVATE_KEY**: SSH private key to access AWS machine
4. **AWS_HOST**: IP address or hostname of AWS machine
5. **AWS_USER**: SSH user on AWS machine (usually `ubuntu`, `ec2-user`, or `admin`)
6. **AWS_PROJECT_PATH**: Full project path on AWS machine (e.g., `/home/ubuntu/my-instants-bot`)

### How to Configure Secrets

1. Go to your repository on GitHub
2. Click **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Add each of the secrets listed above

### Alternative: Use AWS ECR instead of Docker Hub

If you prefer to use AWS ECR instead of Docker Hub, you can modify the workflow to:

1. Use `aws-actions/amazon-ecr-login@v2` to log in to ECR
2. Use ECR registry instead of Docker Hub
3. Add the secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

### Deployment Structure

The workflow executes the following steps:

1. ✅ Checks out the code
2. 🏗️ Builds Docker image using Docker Buildx
3. 📤 Pushes image to registry
4. 🔐 Connects via SSH to AWS machine
5. 🔑 Logs in to Docker Hub (for private images)
6. 📥 Pulls the new image
7. 🛑 Stops existing containers
8. 🚀 Starts containers with the new image
9. 🧹 Cleans up unused old images
10. 🔓 Logs out from Docker Hub
11. ✅ Verifies deployment status

**Note**: The workflow automatically handles Docker Hub authentication when pulling private images. Make sure your `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets are correctly configured.

### When the Workflow Triggers

- **Push to `main`**: Automatic deployment when code is merged to the main branch
- **Workflow Dispatch**: Allows manual execution through GitHub Actions interface

