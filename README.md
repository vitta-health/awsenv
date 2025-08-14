# 🚀 AWSENV

Secure AWS Parameter Store integration with zero-config magic.

[![Coverage](https://img.shields.io/badge/coverage-96.6%25-brightgreen)](.) [![AWS SDK v3](https://img.shields.io/badge/AWS-SDK%20v3-orange)](.) [![Tests](https://img.shields.io/badge/tests-98%20passing-green)](.)

## ⚡ Quick Start

```bash
pnpm add -g @vitta-health/awsenv

# Initialize and use
awsenv init                           # Creates .awsenv config
awsenv --profile production           # Fetch with AWS CLI profile
awsenv -n /prod/myapp                 # Direct namespace usage

# Sync environment variables
awsenv sync -f .env -n /prod/api      # Upload from file
cat .env | awsenv sync -n /prod/api   # Upload from stdin
```

## 🔧 Configuration

### Files Structure
```bash
~/.aws/credentials      # AWS credentials
~/.aws/config          # AWS settings  
.awsenv                # Project config
```

### Simple .awsenv Config
```ini
# Minimal
[default]
namespace = /production/myapp

# Full example
[production]
namespace = "/prod/myapp"    # Quotes optional
encrypt = true               # Force SecureString
paranoid = true             # Block purge

[staging]  
namespace = /staging/myapp
encrypt = false
```

## 📋 Command Reference

### Fetch Parameters
```bash
awsenv -n /prod/api                   # Basic fetch
awsenv --profile prod                 # Use AWS profile
awsenv -n /prod/api -w > .env        # Export without 'export'
$(awsenv -n /prod/api) && pnpm start  # Direct injection
```

### Sync to Parameter Store  
```bash
awsenv sync -f .env -n /prod/api --dry-run   # Preview
awsenv sync -f .env -n /prod/api --encrypt   # All encrypted
cat .env | awsenv sync -n /prod/api          # From stdin
```

### Purge (DANGEROUS!)
```bash
awsenv purge -n /test/app              # Double confirmation required
awsenv purge -n /prod/app --paranoid   # BLOCKED by safety
```

## 🔐 Authentication Methods

### Production: IAM Roles (Recommended)
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ssm:GetParameter*", "ssm:PutParameter", "ssm:DeleteParameter"],
    "Resource": "arn:aws:ssm:*:*:parameter/production/*"
  }]
}
```

### Development: AWS CLI Profiles
```bash
aws configure --profile development
awsenv init
awsenv --profile development
```

### CI/CD: Environment Variables
```bash
export AWS_ACCESS_KEY_ID=${{ secrets.AWS_ACCESS_KEY_ID }}
export AWS_SECRET_ACCESS_KEY=${{ secrets.AWS_SECRET_ACCESS_KEY }}
awsenv -n /staging/myapp
```

## ✨ Commands

| Command | Description | Example |
|---------|-------------|---------|
| `init` | Create project config | `awsenv init` |
| `list` | Show AWS profiles | `awsenv list` |
| `sync` | Upload to Parameter Store | `awsenv sync -f .env -n /prod` |
| `purge` | Delete all parameters | `awsenv purge -n /test` |

## 🎯 Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--namespace` | `-n` | Parameter Store path | *required* |
| `--region` | `-r` | AWS region | `us-east-1` |
| `--profile` | `-p` | AWS CLI profile | |
| `--dry-run` | `-d` | Preview only | `false` |
| `--encrypt` | `-e` | Force SecureString | `false` |
| `--paranoid` | | Block destructive ops | `false` |
| `--verbose` | `-v` | Detailed output | `false` |
| `--without-exporter` | `-w` | No 'export' prefix | `false` |

## 🧠 Smart Features

### Auto-Detection
- Finds `.awsenv` config automatically
- Uses `default` profile if exists
- Smart namespace generation: `/envstore/app_name/env_prod`

### Secret Detection  
Automatically encrypts variables matching:
- `*PASSWORD*`, `*SECRET*`, `*KEY*`, `*TOKEN*`
- `*AUTH*`, `*CREDENTIAL*`, `*PRIVATE*`
- Long random strings (>20 chars)

Use `--encrypt` to force ALL as SecureString.

### Safety Features
- Parallel uploads (concurrency: 3) with rate limit protection
- Double confirmation for purge
- Paranoid mode blocks destructive operations
- Detailed error reporting with recovery suggestions

## 🐳 Docker Integration

```dockerfile
FROM node:22-alpine
RUN npm install -g @vitta-health/awsenv
WORKDIR /app
COPY . .
CMD $(awsenv -n $AWSENV_NAMESPACE) && pnpm start
```

### Docker Compose
```yaml
version: '3.8'
services:
  app:
    environment:
      - AWS_REGION=us-east-1
      - AWSENV_NAMESPACE=/production/app
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      serviceAccountName: app-sa  # with IAM role
      containers:
      - name: app
        env:
        - name: AWSENV_NAMESPACE
          value: "/production/app"
        command: ["sh", "-c", "$(awsenv) && pnpm start"]
```

## 📊 Examples

### Multi-Environment Workflow
```bash
# Development
awsenv -n /dev/app > .env && pnpm run dev

# Staging with Docker
$(awsenv -n /staging/app) && docker-compose up

# Production with Kubernetes  
$(awsenv -n /prod/app) && kubectl apply -f k8s/
```

### Compliance & Security
```bash
# Encrypt everything for compliance
awsenv sync -f .env -n /prod/api --encrypt

# Regulated environment deployment
export AWS_PROFILE=production-compliant
awsenv -n /prod/api
```

### CI/CD Pipeline
```yaml
# GitHub Actions
- name: Deploy
  run: |
    pnpm add -g @vitta-health/awsenv
    $(awsenv -n /prod/api) && ./deploy.sh
```

## 🏗️ Parameter Store Structure

```
/production/my-app/
├── NODE_ENV          → "production"
├── DATABASE_URL      → "postgres://..."  
├── API_SECRET        → "encrypted-key"
└── REDIS_URL         → "redis://..."
```

AWSENV automatically:
- ✅ Extracts parameter names from paths
- ✅ Decrypts SecureString parameters
- ✅ Formats as environment variables

## 🔄 Bidirectional Sync

```bash
# Push TO Parameter Store
awsenv sync -f .env -n /prod/api

# Pull FROM Parameter Store
awsenv -n /prod/api -w > .env
```

## 🛡️ Enterprise Security

| Feature | Description | Compliance |
|---------|-------------|------------|
| **End-to-End Encryption** | AWS KMS encryption | SOX, PCI DSS |
| **Audit Logging** | CloudTrail integration | HIPAA, SOX |
| **Role-Based Access** | IAM permissions | ISO 27001 |
| **Zero-Knowledge** | Secrets never on disk | GDPR |

## 🧪 Development

```bash
# Setup
git clone https://github.com/developers-vitta/awsenv.git
cd awsenv
pnpm install
pnpm link --global

# Test (95%+ coverage required)
pnpm test
pnpm run test:coverage

# Build
pnpm run build
```

## 📄 License

MIT © [Vitta Health](https://github.com/developers-vitta)

---

<p align="center">
🔐 Keep your secrets safe with AWSENV 🔐
</p>