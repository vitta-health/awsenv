# 🚀 AWSENV

<p align="center">
Secure AWS Parameter Store integration with zero-config magic.
</p>

<p align="center">
<a href="."><img src="https://img.shields.io/badge/coverage-96.6%25-brightgreen" alt="Coverage"></a>
<a href="."><img src="https://img.shields.io/badge/AWS-SDK%20v3-orange" alt="AWS SDK v3"></a>
<a href="."><img src="https://img.shields.io/badge/tests-98%20passing-green" alt="Tests"></a>
</p>

## ⚡ Quick Start

```bash
# Install
npm i -g @vitta-health/awsenv

# Initialize project config
awsenv init                           # Creates .awsenv with smart defaults

# Fetch parameters
awsenv --profile production           # Use AWS CLI profile
awsenv -n /prod/myapp                 # Direct namespace
$(awsenv -n /prod/api) && node app.js # Inject into environment

# Sync environment variables
awsenv sync -f .env -n /prod/api     # Upload from file
cat .env | awsenv sync -n /prod/api  # Upload from stdin
echo "KEY=value" | awsenv sync -n /test/app

# Purge parameters (DANGEROUS!)
awsenv purge -n /test/app            # Double confirmation required
```

## 🔧 Configuration

### Files Structure
```bash
~/.aws/credentials      # AWS credentials
~/.aws/config          # AWS regions/settings
.awsenv                # Per-project AWSENV config
```

### Project Config (.awsenv)

#### Simple Example (Most Common)
```ini
[default]
namespace = /production/myapp
```

#### Multiple Environments
```ini
[production]
namespace = "/production/myapp"     # Quotes are optional
encrypt = true                      # Encrypt all parameters
paranoid = true                     # Block purge operations

[staging]  
namespace = /staging/myapp          # Without quotes works too
encrypt = false
paranoid = false

[development]
namespace = '/dev/myapp'            # Single quotes also work
all_secure = true                   # Old name still supported (→ encrypt)
```

## 📋 Commands & Examples

### Fetch Parameters
```bash
awsenv -n /prod/payments-api          # Basic fetch
awsenv --profile prod -w              # Without 'export' prefix
awsenv -r us-west-2 -n /global/config # Specific region
```

### Sync to Parameter Store
```bash
awsenv sync -f .env -n /prod/api --dry-run    # Preview changes
awsenv sync -f .env -n /prod/api --encrypt    # Force all encrypted
awsenv sync -f prod.env -n /prod/api          # Direct upload, no confirmation

# Pipe support for CI/CD
cat .env | awsenv sync -n /prod/api           # Read from stdin
echo "KEY=value" | awsenv sync -n /test/app   # Quick single var
```

### Purge Parameters (NEW DANGEROUS COMMAND!)
```bash
awsenv purge -n /test/myapp                   # Double confirmation required
awsenv purge -n /test/myapp --force           # Skip first confirmation
awsenv purge -n /prod/myapp --paranoid        # BLOCKED - safety mode

# Safety: Add to .awsenv config to permanently block:
# paranoid = true
```

### Docker Integration
```bash
$(awsenv -n /prod/api) && docker run myapp
docker run --env-file <(awsenv -n /prod/api -w) myapp
```

## 🔐 Authentication Guide

### 🏢 Production: IAM Roles (Recommended)
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ssm:GetParameter*", "ssm:PutParameter"],
    "Resource": "arn:aws:ssm:*:*:parameter/production/*"
  }]
}
```
Zero configuration required - works automatically!

### 💻 Development: AWS CLI Profiles
```bash
# One-time setup
aws configure --profile development
awsenv init

# Ready to use
awsenv                          # Auto-detects default profile
awsenv --profile development   # Or be explicit
```

### 🏭 CI/CD: Environment Variables
```bash
export AWS_ACCESS_KEY_ID=${{ secrets.AWS_ACCESS_KEY_ID }}
export AWS_SECRET_ACCESS_KEY=${{ secrets.AWS_SECRET_ACCESS_KEY }}
export AWS_REGION=us-east-1
awsenv -n /staging/myapp
```

## ✨ Zero-Config Magic

**The smartest secret management you've ever used.**

```bash
# Traditional way (error-prone):
awsenv --region us-east-1 --namespace /my-company/production/my-app --encrypt

# AWSENV magic way:
awsenv init     # Creates smart namespace like /envstore/app_myapp/env_production
awsenv          # Works instantly with auto-detected profile!
```

### 🧠 How It Works
1. **Smart Namespace Generation**: Auto-detects project name and environment
2. **Auto-Profile Detection**: Finds `.awsenv` and uses `default` profile
3. **Per-Project Isolation**: Each project gets its own config
4. **AWS CLI Integration**: Uses existing profiles seamlessly

## 🎯 Command Reference

### Commands
```bash
awsenv init                     # Initialize project config
awsenv list                     # List AWS CLI profiles  
awsenv sync -f .env -n /path   # Push to Parameter Store
awsenv purge -n /path          # Delete all parameters
```

### Options
| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--namespace` | `-n` | Parameter Store path | *required* |
| `--region` | `-r` | AWS region | `us-east-1` |
| `--profile` | `-p` | AWS CLI profile | |
| `--dry-run` | `-d` | Preview only | `false` |
| `--encrypt` | `-e` | Force all as SecureString | `false` |
| `--paranoid` | | Block destructive ops | `false` |
| `--verbose` | `-v` | Detailed output | `false` |
| `--without-exporter` | `-w` | No 'export' prefix | `false` |

## 🔄 Bi-Directional Sync

```bash
# Push local .env TO Parameter Store
awsenv sync -f .env -n /prod/api --encrypt
cat .env | awsenv sync -n /prod/api  # From stdin

# Pull FROM Parameter Store to local
awsenv -n /prod/api --without-exporter > .env.downloaded
```

## 🛡️ Enterprise Security Features

| Feature | Description | Compliance |
|---------|-------------|------------|
| **End-to-End Encryption** | All secrets encrypted with AWS KMS | ✅ SOX, PCI DSS |
| **Audit Logging** | Complete CloudTrail integration | ✅ HIPAA, SOX |
| **Role-Based Access** | IAM-powered permissions | ✅ ISO 27001 |
| **Secret Rotation** | AWS-native rotation support | ✅ PCI DSS |
| **Zero-Knowledge** | Secrets never touch local disk | ✅ GDPR |

## 🧠 Smart Secret Detection

When syncing, AWSENV automatically encrypts variables matching:
- `*PASSWORD*`, `*SECRET*`, `*KEY*`, `*TOKEN*`
- `*AUTH*`, `*CREDENTIAL*`, `*PRIVATE*`
- `*CERT*`, `*SSL*`, `*TLS*`, `*HASH*`, `*SALT*`
- Long random strings (>20 characters)

### Force Encrypt Mode (`--encrypt`)
```bash
# Smart detection
awsenv sync -f .env -n /prod/app --dry-run
# Result: 3 encrypted, 6 plain text

# Force all encrypted
awsenv sync -f .env -n /prod/app --encrypt --dry-run  
# Result: ALL 9 encrypted as SecureString
```

## 🏗️ Parameter Store Setup

Structure your parameters like this:
```
/production/my-app/
├── NODE_ENV          → "production"
├── DATABASE_URL      → "postgres://prod-db:5432/myapp"  
├── REDIS_URL         → "redis://prod-redis:6379"
├── API_SECRET        → "super-secret-key-123"
└── THIRD_PARTY_TOKEN → "token-abc-xyz-789"
```

AWSENV automatically:
- ✅ Extracts parameter name from path
- ✅ Decrypts SecureString parameters
- ✅ Cleans multiline values
- ✅ Formats as environment variables

## 🐳 Docker & Kubernetes

### Docker
```dockerfile
FROM node:18-alpine
RUN npm install -g @vitta-health/awsenv
WORKDIR /app
CMD $(awsenv -n $AWSENV_NAMESPACE) && npm start
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
        command: ["sh", "-c", "$(awsenv) && npm start"]
```

### CI/CD Integration
```yaml
# GitHub Actions
- name: Deploy with secrets
  run: |
    npm install -g @vitta-health/awsenv
    $(awsenv -n /production/api) && ./deploy.sh

# GitLab CI
deploy:
  script:
    - $(awsenv -n /production/api) && helm upgrade app ./chart
```

## 📊 Real-World Examples

### Multi-Environment Workflow
```bash
# Development
awsenv -n /dev/myapp > .env && npm run dev

# Staging with Docker
$(awsenv -n /staging/payments-api) && docker-compose up

# Production with Kubernetes
$(awsenv -n /prod/payments-api) && kubectl apply -f k8s/
```

### Compliance & Security
```bash
# Sync with all secrets encrypted for compliance
awsenv sync -f .env.prod -n /fintech/prod/core --encrypt

# HIPAA-compliant deployment
export AWS_PROFILE=hipaa-compliant
awsenv -n /healthcare/prod/patient-api
```

## 🧪 Testing & Quality

**96% code coverage** with comprehensive tests:
- ✅ Bi-directional sync functionality
- ✅ Smart secret detection
- ✅ AWS SDK v3 integration
- ✅ Parallel operations with rate limiting
- ✅ Error handling and recovery

```bash
# Run tests
npm test

# Coverage report
npm run test:coverage

# Development
npm link
awsenv --version
```

## 🤝 Contributing

```bash
# Clone and setup
git clone https://github.com/developers-vitta/awsenv.git
cd awsenv
npm install
npm link

# Test (95%+ coverage required)
npm test
npm run test:coverage

# Build binaries
npm run build
```

## 📄 License

MIT © [Vitta Health](https://github.com/developers-vitta)

---

<p align="center">
Made with ❤️ for secure, scalable applications<br>
🔐 Keep your secrets safe with AWSENV 🔐
</p>