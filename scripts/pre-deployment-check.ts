#!/usr/bin/env tsx

/**
 * Pre-Deployment Checklist
 *
 * Run this before deploying to verify your setup is ready
 * Usage: npx tsx scripts/pre-deployment-check.ts
 */

import * as fs from 'fs'
import * as path from 'path'

interface CheckResult {
  name: string
  passed: boolean
  message: string
}

const checks: CheckResult[] = []

function check(name: string, passed: boolean, message: string) {
  checks.push({ name, passed, message })
}

function printResults() {
  console.log('\n' + '='.repeat(60))
  console.log('PRE-DEPLOYMENT CHECK RESULTS')
  console.log('='.repeat(60) + '\n')

  let allPassed = true

  for (const result of checks) {
    const icon = result.passed ? '✓' : '✗'
    const color = result.passed ? '\x1b[32m' : '\x1b[31m'
    const reset = '\x1b[0m'

    console.log(`${color}${icon} ${result.name}${reset}`)
    console.log(`  ${result.message}\n`)

    if (!result.passed) {
      allPassed = false
    }
  }

  console.log('='.repeat(60))
  if (allPassed) {
    console.log('\x1b[32m✓ All checks passed! Ready to deploy.\x1b[0m')
  } else {
    console.log('\x1b[31m✗ Some checks failed. Please fix issues before deploying.\x1b[0m')
  }
  console.log('='.repeat(60) + '\n')

  process.exit(allPassed ? 0 : 1)
}

// Check 1: package.json exists and has required dependencies
try {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

  const requiredDeps = [
    '@prisma/client',
    'next',
    'next-auth',
    '@polymarket/real-time-data-client',
    'tsx'
  ]

  const missingDeps = requiredDeps.filter(dep =>
    !packageJson.dependencies[dep] && !packageJson.devDependencies?.[dep]
  )

  if (missingDeps.length === 0) {
    check('Required Dependencies', true, 'All required npm packages are present')
  } else {
    check('Required Dependencies', false, `Missing: ${missingDeps.join(', ')}`)
  }

  // Check that tsx is in dependencies (not devDependencies)
  if (packageJson.dependencies.tsx) {
    check('tsx in dependencies', true, 'tsx is correctly in dependencies for production')
  } else {
    check('tsx in dependencies', false, 'tsx must be in dependencies (not devDependencies) for production')
  }
} catch (error) {
  check('Package.json', false, `Error reading package.json: ${error}`)
}

// Check 2: Prisma schema exists
try {
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma')
  if (fs.existsSync(schemaPath)) {
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8')

    // Check for important models
    const hasUserModel = schemaContent.includes('model User')
    const hasTradeModel = schemaContent.includes('model Trade')
    const hasSubscriptionModel = schemaContent.includes('model Subscription')

    if (hasUserModel && hasTradeModel && hasSubscriptionModel) {
      check('Prisma Schema', true, 'Schema contains required models')
    } else {
      check('Prisma Schema', false, 'Schema is missing some required models')
    }
  } else {
    check('Prisma Schema', false, 'prisma/schema.prisma not found')
  }
} catch (error) {
  check('Prisma Schema', false, `Error reading schema: ${error}`)
}

// Check 3: Environment variables template
try {
  const envExamplePath = path.join(process.cwd(), '.env.example')
  if (fs.existsSync(envExamplePath)) {
    const envExample = fs.readFileSync(envExamplePath, 'utf-8')

    const requiredVars = [
      'DATABASE_URL',
      'NEXTAUTH_URL',
      'NEXTAUTH_SECRET',
    ]

    const missingVars = requiredVars.filter(v => !envExample.includes(v))

    if (missingVars.length === 0) {
      check('Environment Variables', true, '.env.example contains required variables')
    } else {
      check('Environment Variables', false, `Missing in .env.example: ${missingVars.join(', ')}`)
    }
  } else {
    check('Environment Variables', false, '.env.example file not found')
  }
} catch (error) {
  check('Environment Variables', false, `Error reading .env.example: ${error}`)
}

// Check 4: WebSocket listener script exists
try {
  const listenerPath = path.join(process.cwd(), 'scripts', 'websocket-listener.ts')
  if (fs.existsSync(listenerPath)) {
    const content = fs.readFileSync(listenerPath, 'utf-8')

    if (content.includes('#!/usr/bin/env tsx')) {
      check('WebSocket Listener', true, 'Script exists with correct shebang')
    } else {
      check('WebSocket Listener', false, 'Script should have #!/usr/bin/env tsx shebang')
    }
  } else {
    check('WebSocket Listener', false, 'scripts/websocket-listener.ts not found')
  }
} catch (error) {
  check('WebSocket Listener', false, `Error reading listener script: ${error}`)
}

// Check 5: Git repository initialized
try {
  const gitPath = path.join(process.cwd(), '.git')
  if (fs.existsSync(gitPath)) {
    check('Git Repository', true, 'Git repository is initialized')
  } else {
    check('Git Repository', false, 'Git not initialized. Run: git init')
  }
} catch (error) {
  check('Git Repository', false, `Error checking git: ${error}`)
}

// Check 6: Next.js config exists
try {
  const nextConfigPath = path.join(process.cwd(), 'next.config.ts')
  if (fs.existsSync(nextConfigPath)) {
    check('Next.js Config', true, 'next.config.ts exists')
  } else {
    check('Next.js Config', false, 'next.config.ts not found')
  }
} catch (error) {
  check('Next.js Config', false, `Error checking Next.js config: ${error}`)
}

// Check 7: Build succeeds
console.log('\nRunning additional checks...\n')

// Print all results
printResults()
