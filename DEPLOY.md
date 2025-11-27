# CI/CD Deployment Guide

This guide explains how to set up automatic bot deployment using GitHub Actions.

## Prerequisites

1. ✅ Bot already running on AWS machine
2. ✅ Docker and Docker Compose installed on AWS machine
3. ✅ Docker Hub account (or AWS ECR configured)
4. ✅ SSH access to AWS machine

## Step 1: Configure Docker Hub

1. Go to [Docker Hub](https://hub.docker.com/)
2. Create an account or log in
3. Go to **Account Settings** > **Security**
4. Create a **New Access Token** (don't use your password directly)
5. Note the created token

**Note**: The workflow automatically handles login to Docker Hub on the AWS machine when pulling private images. If your image is set to private, make sure the `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets are correctly configured.

## Step 2: Configure GitHub Secrets

1. Go to your repository on GitHub
2. Click **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret** and add:

### Required Secrets

| Secret                | Description                    | Example                                                      |
| --------------------- | ------------------------------ | ------------------------------------------------------------ |
| `DOCKER_USERNAME`     | Your Docker Hub username       | `myuser`                                                     |
| `DOCKER_PASSWORD`     | Docker Hub access token        | `dckr_pat_xxxxx...`                                          |
| `AWS_SSH_PRIVATE_KEY` | SSH private key (full content) | `-----BEGIN OPENSSH PRIVATE KEY-----...`                     |
| `AWS_HOST`            | IP or hostname of AWS machine  | `54.123.45.67` or `ec2-54-123-45-67.compute-1.amazonaws.com` |
| `AWS_USER`            | SSH user on AWS                | `ubuntu` or `ec2-user`                                       |
| `AWS_PROJECT_PATH`    | Full project path on AWS       | `/home/ubuntu/my-instants-bot`                               |

### How to Get the SSH Private Key

If you already have SSH access working:

1. On your local computer, find the private key (usually in `~/.ssh/`)
2. Copy the complete file content (including `-----BEGIN` and `-----END`)
3. Paste it into the `AWS_SSH_PRIVATE_KEY` secret

**Important**: The corresponding public key must be in the `~/.ssh/authorized_keys` of the AWS machine.

## Step 3: Configure Docker Compose on AWS

On your AWS machine, you have two options:

### Option A: Use docker-compose.prod.yml (Recommended)

1. On the AWS machine, edit `docker-compose.yml` or rename `docker-compose.prod.yml`:

```bash
# On AWS machine
cd /path/to/project
# Edit docker-compose.yml and replace 'build' section with 'image'
# Or use docker-compose.prod.yml as base
```

2. Update `docker-compose.yml` to use the registry image:

```yaml
services:
  bot:
    image: YOUR_DOCKER_USER/my-instants-bot:latest # Replace YOUR_DOCKER_USER
    # Remove the 'build' section
```

### Option B: Keep local build (not recommended for CI/CD)

If you prefer to keep the local build, the workflow will still work, but it won't be optimized.

## Step 4: Test Deployment

1. Make a commit and push to the `main` branch:

```bash
git add .
git commit -m "Configure CI/CD"
git push origin main
```

2. Go to **Actions** on GitHub and monitor the workflow
3. Check the logs to ensure everything worked

## Step 5: Verify Deployment

After the workflow completes, verify on the AWS machine:

```bash
# Connect to AWS machine
ssh user@host

# Check containers
docker-compose ps

# View logs
docker-compose logs -f bot
```

## Troubleshooting

### Error: "Permission denied (publickey)"

- Verify that the SSH private key is correct in the secret
- Verify that the public key is in AWS `~/.ssh/authorized_keys`
- Test SSH connection manually: `ssh user@host`

### Error: "Cannot connect to the Docker daemon"

- Verify that the SSH user has permission to use Docker
- Add user to docker group: `sudo usermod -aG docker $USER`
- Log out and log in again

### Error: "docker-compose: command not found" or "unknown shorthand flag: 'd' in -d"

- The workflow automatically detects and uses the correct Docker Compose command (`docker-compose` or `docker compose`)
- If you still get this error, verify that Docker is installed and the user has permissions
- For newer Docker versions, `docker compose` (without hyphen) is used automatically as a plugin

### Error: "Image pull failed"

- Verify that `DOCKER_USERNAME` and `DOCKER_PASSWORD` are correct
- Verify that the image was created on Docker Hub
- Verify that the image name in `docker-compose.yml` is correct
- If your image is private, the workflow automatically logs in to Docker Hub before pulling. Make sure the credentials are correct
- Check if you have access to the private repository on Docker Hub

### Workflow doesn't trigger

- Verify that you're pushing to the `main` branch
- Verify that the workflow is enabled in **Settings** > **Actions** > **General**

## Manual Execution

You can also run the workflow manually:

1. Go to **Actions** on GitHub
2. Select the **Build and Deploy** workflow
3. Click **Run workflow**
4. Select the branch and click **Run workflow**

## Alternative: Use AWS ECR

If you prefer to use AWS ECR instead of Docker Hub:

1. Create a repository in ECR
2. Modify the workflow to use `aws-actions/amazon-ecr-login@v2`
3. Add the secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
4. Update image tags to use ECR registry

## Security

- ✅ Never commit secrets in code
- ✅ Use tokens instead of passwords
- ✅ Rotate tokens regularly
- ✅ Use SSH keys specific for CI/CD
- ✅ Limit SSH key permissions when possible
