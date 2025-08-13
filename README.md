# 🚀 AWSENV

Secure AWS Parameter Store integration with zero-config magic.

[![Coverage](https://img.shields.io/badge/coverage-96.6%25-brightgreen)](.) [![AWS SDK v3](https://img.shields.io/badge/AWS-SDK%20v3-orange)](.) [![Tests](https://img.shields.io/badge/tests-98%20passing-green)](.)

## ⚡ Quick Start

```bash
# Install
npm i -g @vitta-health/awsenv

# Setup with AWS CLI profiles (zero-config)
awsenv init                           # Creates project config
awsenv --profile production           # Fetch parameters

# Or direct usage
awsenv -n /production/myapp           # Fetch from namespace
$(awsenv -n /prod/api) && node app.js # Inject into environment

# Sync .env TO Parameter Store
awsenv --sync .env -n /prod/api --dry-run    # Preview upload
awsenv --sync .env -n /prod/api --all-secure # Upload encrypted
```

## 🔧 Configuration

### AWS CLI Profiles
```bash
# Uses standard AWS CLI configuration
~/.aws/credentials      # AWS credentials
~/.aws/config          # AWS regions/settings
.awsenv/config         # AWSENV project settings
```

### Project Config (.awsenv/config)
```ini
[production]
namespace = /awsenv/app=myproject/env=production
all_secure = true

[staging]  
namespace = /awsenv/app=myproject/env=staging
```

## 📋 Examples

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
```

### Docker Integration
```bash
$(awsenv -n /prod/api) && docker run myapp
docker run --env-file <(awsenv -n /prod/api -w) myapp
```

## 🔐 **Authentication Guide**

### **🏢 Production (Recommended): IAM Roles**
```bash
# ECS Task Role Policy:
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ssm:GetParameter*", "ssm:PutParameter"],
    "Resource": "arn:aws:ssm:*:*:parameter/production/*"
  }]
}

# Zero configuration required - works automatically!
awsenv -n /production/myapp
```

### **💻 Development: AWS CLI Profiles**
```bash
# One-time setup
aws configure --profile development
aws configure --profile production

# Configure AWSENV settings
awsenv init

# Ready to use (auto-detects default profile):
awsenv                          # ← Magic! Uses default automatically
awsenv --profile development   # ← Or be explicit  
awsenv --profile production
```

### **🏭 CI/CD: Environment Variables**
```bash
# GitHub Actions / Jenkins
export AWS_ACCESS_KEY_ID=${{ secrets.AWS_ACCESS_KEY_ID }}
export AWS_SECRET_ACCESS_KEY=${{ secrets.AWS_SECRET_ACCESS_KEY }}
export AWS_REGION=us-east-1

awsenv -n /staging/myapp
```

## ✨ **Zero-Config Magic**

**The smartest secret management you've ever used.**

```bash
# Traditional way (error-prone):
awsenv --region us-east-1 --namespace /my-company/production/my-app --all-secure

# AWSENV magic way:
awsenv init     # ← Creates: /awsenv/app=my-app/env=production (auto-detected!)
awsenv          # ← Works instantly! Auto-detects default profile
```

### **🧠 How The Magic Works**

1. **Smart Namespace Generation**: Detects directory name and creates Parameter Store compliant paths
2. **Auto-Profile Detection**: Finds `.awsenv/config` and uses `default` profile automatically  
3. **Per-Project Isolation**: Each project gets its own config (no more global chaos)
4. **AWS CLI Integration**: Uses your existing `~/.aws/credentials` profiles

### **🎯 Key Benefits**

- **Intelligent Automation**: Auto-detects project context and generates compliant Parameter Store paths
- **Zero Configuration**: Works immediately after `awsenv init` with no additional setup required  
- **Enterprise Isolation**: Per-project configuration prevents cross-contamination between environments
- **AWS Native Integration**: Seamlessly integrates with existing AWS CLI profiles and IAM roles

## 📚 Examples & Use Cases

### Basic Usage
```bash
# Load environment variables
$(awsenv -n /staging/my-api)
node server.js  # server.js can access process.env.DATABASE_URL

# Generate .env file
awsenv -n /production/web --without-exporter > .env
docker run --env-file .env my-app:latest
```

### Multi-Environment Workflow
```bash
# Development
awsenv -n /dev/myapp > .env && npm run dev

# Staging with Docker Compose
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

## 🔄 **Bi-Directional Sync: Push & Pull**

```bash
# Push local .env TO Parameter Store
awsenv --sync .env -n /prod/api --all-secure

# Pull FROM Parameter Store to local
awsenv -n /prod/api --without-exporter > .env.downloaded
```

## 🛡️ **Enterprise Security Features**

| Feature | Description | Compliance |
|---------|-------------|------------|
| **End-to-End Encryption** | All secrets encrypted with AWS KMS | ✅ SOX, PCI DSS |
| **Audit Logging** | Complete CloudTrail integration | ✅ HIPAA, SOX |
| **Role-Based Access** | IAM-powered permissions | ✅ ISO 27001 |
| **Secret Rotation** | AWS-native rotation support | ✅ PCI DSS |
| **Zero-Knowledge** | Secrets never touch local disk | ✅ GDPR |

## 🎯 **Command Reference**

```bash
# Smart Profiles (Recommended)
awsenv                                  # Auto-detects default profile (zero config!)
awsenv --profile production             # Use specific profile  
awsenv list                             # See all your environments
awsenv init                             # Smart setup with auto-generated namespaces

# Classic Commands (Still Supported)
awsenv -n /namespace                    # Load secrets to environment
awsenv -n /namespace > .env             # Export to file
awsenv --sync .env -n /namespace        # Push secrets to AWS

# Power User Options
--encrypt, -e                           # Force encrypt everything
--paranoid                              # Block destructive operations
--dry-run, -d                          # Preview changes  
--without-exporter, -w                  # Skip "export" prefix
--verbose, -v                           # Show detailed execution info
```

## 🔧 **Project Configuration**

**Each project gets its own `.awsenv/config`. No more global chaos.**

```bash
# Before (repetitive and error-prone)
awsenv --region us-east-1 --namespace /company/production --all-secure true

# After (uses your existing AWS CLI profile + AWSENV settings) 
awsenv --profile production
```

### **How It Works**

1. **Use your existing AWS CLI profiles** (`~/.aws/credentials` and `~/.aws/config`)
2. **Extend with AWSENV-specific settings** in `~/.awsenv/config`
3. **Combine automatically** when using `--profile`

### **Setup Example**

**Step 1: Configure AWS CLI profile** (if not already done)
```bash
aws configure --profile production
# This creates ~/.aws/credentials and ~/.aws/config
```

**Step 2: Create AWSENV configuration**
```bash
awsenv init  # Creates .awsenv/config in current project
```

**Step 3: Edit .awsenv/config**
```ini
[production]
namespace = /my-company/production
all_secure = true

[development] 
namespace = /my-company/development
all_secure = false
```

**Step 4: Use your profiles**
```bash
# Zero-config magic - auto-detects default profile:
awsenv                          # ← Uses default profile automatically!

# Or be explicit:  
awsenv --profile production     # ← Uses specific profile
```

### **Configuration Files**

| File | Purpose | Example |
|------|---------|----------|
| `~/.aws/credentials` | AWS credentials & regions | `[production]`<br/>`aws_access_key_id = AKIA...`<br/>`region = us-west-2` |
| `~/.aws/config` | AWS CLI settings | `[profile production]`<br/>`region = us-west-2`<br/>`output = json` |
| `~/.awsenv/config` | AWSENV extensions | `[production]`<br/>`namespace = /company/prod`<br/>`all_secure = true` |

## 📋 Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--region` | `-r` | AWS region for SSM parameters | `us-east-1` |
| `--namespace` | `-n` | Parameter Store path prefix | *required* |
| `--without-exporter` | `-w` | Output without `export` prefix | `false` |
| `--dry-run` | `-d` | Show what would be synced (no upload) | `false` |
| `--encrypt` | `-e` | **Force ALL parameters as SecureString** | `false` |
| `--paranoid` | | Block destructive operations (purge) | `false` |
| `--help` | `-h` | Show help information | |
| `--version` | `-v` | Show version number | |

## 🔧 Configuration

### Using Environment Variables

Set these environment variables to avoid repeating options:

```bash
export AWS_REGION=us-west-2
export AWSENV_NAMESPACE=/production/my-service

# Now you can just run:
awsenv
```

### AWS Credentials

AWSENV works with all standard AWS authentication methods:

- 🏷️ **IAM Roles** (recommended for EC2, ECS, Lambda)
- 🔑 **Environment variables** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- 📁 **AWS credentials file** (`~/.aws/credentials`)
- 👤 **IAM instance profiles**
- 🎭 **Assumed roles**

## 🏗️ Parameter Store Setup

Structure your parameters in AWS Systems Manager Parameter Store like this:

```
/production/my-app/
├── NODE_ENV          → "production"
├── DATABASE_URL      → "postgres://prod-db:5432/myapp"  
├── REDIS_URL         → "redis://prod-redis:6379"
├── API_SECRET        → "super-secret-key-123"
└── THIRD_PARTY_TOKEN → "token-abc-xyz-789"
```

AWSENV will automatically:
- ✅ Extract the parameter name from the path
- ✅ Decrypt SecureString parameters
- ✅ Clean up multiline values
- ✅ Format as environment variables

## 🧠 Smart Secret Detection

When syncing `.env` files to Parameter Store, AWSENV automatically detects which variables should be encrypted as `SecureString`:

### 🔒 Auto-encrypted variables (SecureString)
Variables matching these patterns are automatically encrypted:
- `*PASSWORD*`, `*SECRET*`, `*KEY*`, `*TOKEN*`
- `*AUTH*`, `*CREDENTIAL*`, `*PRIVATE*`
- `*CERT*`, `*SSL*`, `*TLS*`, `*HASH*`, `*SALT*`
- Long random strings (>20 characters with mixed alphanumeric)

### 📝 Plain text variables (String)
Everything else is stored as plain text:
- Configuration values: `NODE_ENV`, `PORT`, `DEBUG`
- URLs: `DATABASE_URL`, `REDIS_URL` 
- Simple values: `APP_NAME`, `LOG_LEVEL`

### Force All Secure Mode (`--all-secure`)
When you want **maximum security**, use the `--all-secure` flag to encrypt **ALL** parameters as SecureString, regardless of their content:

```bash
# Normal mode (smart detection)
awsenv --sync .env --namespace /prod/app --dry-run
# Result: 3 parameters encrypted, 6 as plain text

# All-secure mode (everything encrypted)
awsenv --sync .env --namespace /prod/app --all-secure --dry-run  
# Result: ALL 9 parameters encrypted as SecureString
```

**Perfect for:**
- High-security production environments
- Compliance requirements (PCI, SOX, HIPAA)
- When you prefer "encrypt everything" approach
- Sensitive microservices handling financial/healthcare data

### Example Detection:
```bash
# 🔒 These become SecureString (encrypted) - SMART MODE
JWT_SECRET=abc123def456ghi789
API_SECRET_KEY=sk-1234567890abcdef
DB_PASSWORD=super-secret-password
STRIPE_SECRET_KEY=sk_test_1234567890

# 📝 These stay as String (plain text) - SMART MODE
NODE_ENV=production
PORT=3000
APP_NAME=MyApp
DATABASE_URL=postgres://localhost:5432/db

# 🔒 With --all-secure flag: EVERYTHING becomes SecureString
NODE_ENV=production          # ← Now encrypted too!
PORT=3000                    # ← Now encrypted too!
APP_NAME=MyApp               # ← Now encrypted too!
DATABASE_URL=postgres://...  # ← Now encrypted too!
```

## 🐳 Docker Integration

### Basic Docker Usage

```dockerfile
FROM node:18-alpine

# Install awsenv using pnpm (faster)
RUN npm install -g pnpm && pnpm add -g @vitta-health/awsenv

# Your app code
WORKDIR /app
COPY . .
RUN pnpm install

# Load env vars and start app
CMD $(awsenv -r $AWS_REGION -n $AWSENV_NAMESPACE) && npm start
```

### Docker Compose

```yaml
version: '3.8'
services:
  my-app:
    build: .
    environment:
      - AWS_REGION=us-east-1
      - AWSENV_NAMESPACE=/production/my-app
    # IAM role attached to ECS task or EC2 instance handles auth
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      serviceAccountName: my-app-service-account  # with IAM role
      containers:
      - name: my-app
        image: my-app:latest
        env:
        - name: AWS_REGION
          value: "us-east-1"
        - name: AWSENV_NAMESPACE
          value: "/production/my-app"
        command: 
        - sh
        - -c
        - "$(awsenv) && npm start"
```

### CI/CD Integration
```yaml
# GitHub Actions
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v1
      with:
        role-to-assume: arn:aws:iam::123456789:role/GitHubActions
        aws-region: us-east-1
    
    - name: Deploy with environment
      run: |
        npm install -g @vitta-health/awsenv
        $(awsenv -n /production/api) && ./deploy.sh

# GitLab CI
deploy:production:
  script:
    - $(awsenv -n /production/api) && helm upgrade app ./chart
```

## 🧪 Testing & Quality

This project maintains **96% code coverage** with comprehensive tests covering:

- ✅ Bi-directional sync functionality (fetch & push)
- ✅ Smart secret detection and encryption
- ✅ All CLI parameter combinations
- ✅ AWS SDK v3 integration
- ✅ Environment variable processing  
- ✅ Error handling and edge cases
- ✅ ES6 module compatibility
- ✅ **Powered by Vitest**: Modern testing framework with native ES6 support

```bash
# Run tests
pnpm test

# Run with coverage report (powered by V8)
pnpm run test:coverage

# Watch mode (re-runs tests on file changes)
pnpm run test:watch

# Interactive UI mode
pnpm run test:ui

# Run specific test suites
pnpm test -- src/sync.test.js    # Test sync functionality
pnpm test -- src/app.test.js     # Test CLI application logic
```

## 🤝 Contributing

We love contributions! Here's how to get started:

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/yourusername/awsenv.git`
3. **Install** dependencies: `pnpm install`
4. **Link** for local development: `pnpm link --global`
5. **Test** your changes: `pnpm test`
6. **Build** binaries: `pnpm run build`
7. **Submit** a pull request

### Development Setup

```bash
# Clone and setup
git clone https://github.com/developers-vitta/awsenv.git
cd awsenv

# Install with pnpm (recommended)
pnpm install
pnpm link --global

# Or with npm (if you prefer npm over pnpm)
npm install
npm link

# Verify installation
awsenv --version

# Run tests (must maintain 100% coverage!)
pnpm test:coverage  # or npm run test:coverage

# Test sync functionality
pnpm run sync-example  # or npm run sync-example
```

### 🔧 Development Commands

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Run tests
pnpm test
pnpm test:coverage
pnpm test:watch

# Build binaries
pnpm build

# Clean up
pnpm clean
```

## 📄 License

MIT © [Vitta Health](https://github.com/developers-vitta)

---

<p align="center">
Made with ❤️ for secure, scalable applications<br>
🔐 Keep your secrets safe with AWSENV 🔐
</p>