# AWSENV

A secure way to handle environment variables in Docker with AWS Parameter Store.

## Install

```bash
$ npm i -g awsenv
```

## Usage ways

### Simple

#### First suggestion:

```bash
$ awsenv -r sa-east-1 \
  -n /staging/my-app

# this will result as:
export NODE_ENV=staging
export DB_USERNAME=root
export DB_PASSWORD=mysecretpassword

# so, you may use as:
$ $(awsenv -r sa-east-1 -n /staging/my-app)
```

#### Second suggestion:

With a combination of [dotenv](https://www.npmjs.com/package/dotenv), this is another solution at build stage:

```bash
$ awsenv --without-export \
  -r sa-east-1 \
  -n /staging/my-app

# this will result as:
NODE_ENV=staging
DB_USERNAME=root
DB_PASSWORD=mysecretpassword

# so, you may use as:
$ awsenv --without-export \
  -r sa-east-1 \
  -n /staging/my-app > /app/myapp/.env
$ cat /dre/mysapp/.env
NODE_ENV=staging
DB_USERNAME=root
DB_PASSWORD=mysecretpassword
```

### Using Environment Variables

```bash
# first you set your variables
export AWS_REGION=sa-east-1
export AWSENV_NAMESPACE=/staging/my-app

# exec it
$ awsenv

# this will result as:
export NODE_ENV=staging
export DB_USERNAME=root
export DB_PASSWORD=mysecretpassword

# or
$ awsenv --without-export > /app/myapp/.env
$ cat /app/mysapp/.env
NODE_ENV=staging
DB_USERNAME=root
DB_PASSWORD=mysecretpassword
```

## Contribuiting

Fork-it first, and:

```bash
$ npm link
$ awsenv version
1.0.1
```

Make your magic!
