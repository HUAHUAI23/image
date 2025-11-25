# Security Policy

## Overview

This project implements automated security scanning through GitHub Actions to protect against common security vulnerabilities. All pull requests and commits are automatically scanned for security issues.

## Automated Security Checks

### 1. Secret Scanning

**Tools Used:**
- **Gitleaks** - Open-source secret scanner
- **TruffleHog** - Verified secret detection

**What We Check:**
- API keys and tokens
- Database connection strings
- Private keys and certificates
- OAuth tokens and credentials
- Cloud service credentials (AWS, GCP, Azure, etc.)
- Generic secrets and passwords

**When It Runs:**
- On every pull request
- On every push to main/master/develop branches
- Daily scheduled scans at 2 AM UTC
- Manual workflow dispatch

### 2. Dependency Vulnerability Scanning

**Tool Used:** pnpm audit

**What We Check:**
- Known vulnerabilities in npm packages
- Critical and high severity issues
- Outdated packages with security patches

**Severity Levels:**
- 🔴 **Critical** - Immediate action required, blocks merge
- 🟠 **High** - Immediate action required, blocks merge
- 🟡 **Moderate** - Should be fixed soon
- 🟢 **Low** - Nice to fix
- ℹ️ **Info** - For awareness only

## How to Handle Security Issues

### If Secret Scanning Fails

1. **Review the findings** in the GitHub Actions workflow
2. **Remove the exposed secrets** from your code immediately
3. **Rotate the compromised credentials**:
   - Change API keys
   - Reset passwords
   - Regenerate tokens
4. **Use proper secret management**:
   - Store secrets in `.env` file (never commit `.env`)
   - Use GitHub Secrets for CI/CD
   - Use environment variables in production

**Example Fix:**
```bash
# Bad - hardcoded secret
const apiKey = "sk-proj-abc123xyz789"

# Good - use environment variable
const apiKey = process.env.VOLCENGINE_API_KEY
```

### If Dependency Audit Fails

1. **Run audit locally** to see details:
   ```bash
   pnpm audit
   ```

2. **Review vulnerabilities**:
   ```bash
   pnpm audit --json > audit.json
   ```

3. **Update vulnerable packages**:
   ```bash
   # Automatic fix (if available)
   pnpm audit --fix

   # Manual update
   pnpm update <package-name>

   # Check for major version updates
   pnpm outdated
   ```

4. **Test after updates**:
   ```bash
   pnpm run build
   pnpm run lint
   ```

5. **If fix is not available**:
   - Check if the vulnerability affects your use case
   - Look for alternative packages
   - Consider accepting the risk temporarily (document in PR)

## Configuration Files

### `.gitleaks.toml`

Configures Gitleaks secret scanning:
- Custom rules for specific secret patterns
- Allowlists for false positives
- Path exclusions (node_modules, .next, etc.)

**Customization:**
```toml
# Add custom allowlist patterns
[[rules.allowlist]]
paths = [
  '''your-file-pattern\.ext$''',
]
```

### `.github/workflows/security.yml`

Main security scanning workflow:
- Runs all security checks
- Posts results to PR comments
- Generates security reports

## Best Practices

### Preventing Secret Leaks

1. **Never commit secrets** to version control
2. **Use `.env` files** for local development
3. **Add `.env` to `.gitignore`** (already configured)
4. **Use `.env.example`** for documentation
5. **Use GitHub Secrets** for CI/CD workflows
6. **Rotate secrets regularly**

### Dependency Management

1. **Keep dependencies updated**:
   ```bash
   pnpm update
   ```

2. **Review security advisories**:
   - Check GitHub Security tab
   - Review Dependabot alerts

3. **Pin critical dependencies** in production

4. **Use lockfiles** (pnpm-lock.yaml)

5. **Audit before releases**:
   ```bash
   pnpm audit --audit-level=moderate
   ```

## Security Workflow Results

### Understanding the PR Comment

After security scans complete, a comment will be posted to your PR with results:

**All Passed Example:**
```
✅ Security Scan Results: Passed

Security Checks
| Check | Status |
|-------|--------|
| 🔐 Gitleaks (Secret Scanning) | ✅ Passed |
| 🔍 TruffleHog (Secret Detection) | ✅ Passed |
| 📦 Dependency Audit | ✅ Passed |
```

**Issues Found Example:**
```
⚠️ Security Scan Results: Issues Found

Security Checks
| Check | Status |
|-------|--------|
| 🔐 Gitleaks (Secret Scanning) | ❌ Failed |
| 🔍 TruffleHog (Secret Detection) | ✅ Passed |
| 📦 Dependency Audit | ⚠️ Vulnerabilities Found |
```

## Scheduled Scans

Security scans run automatically:
- **Daily** at 2 AM UTC
- Checks entire codebase for new vulnerabilities
- Results posted to GitHub Actions

## Manual Scans

Trigger security scans manually:
1. Go to Actions tab
2. Select "Security Scanning" workflow
3. Click "Run workflow"
4. Choose branch and run

## Reporting Security Issues

If you discover a security vulnerability, please:

1. **Do NOT** open a public GitHub issue
2. **Do NOT** disclose the vulnerability publicly
3. **Contact** the project maintainers privately
4. Provide detailed information about the vulnerability

## Security Tools Reference

### Gitleaks
- **GitHub**: https://github.com/gitleaks/gitleaks
- **Docs**: https://github.com/gitleaks/gitleaks#readme
- **Version**: Latest via GitHub Actions

### TruffleHog
- **GitHub**: https://github.com/trufflesecurity/trufflehog
- **Docs**: https://github.com/trufflesecurity/trufflehog#readme
- **Version**: Latest via GitHub Actions

### pnpm audit
- **Docs**: https://pnpm.io/cli/audit
- **Advisory Database**: https://github.com/advisories

## Continuous Improvement

This security policy is continuously updated. Suggestions for improvements are welcome through pull requests.

**Last Updated**: 2025-11-24
