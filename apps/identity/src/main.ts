import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { loadEnvFile } from './load-env.ts'

loadEnvFile()

const { AppModule } = await import('./app.module.ts')
const { buildIdentityService } = await import('./identity-provider.ts')
const { bootstrapDemoData } = await import('./bootstrap-demo.ts')

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  app.enableCors()
  await bootstrapDemoData(buildIdentityService())

  if (process.env.DEMO_MFA_ENDPOINT_ENABLED === 'true') {
    console.log('')
    console.log('[DEMO MODE] GET /v1/auth/demo/mfa-code is ENABLED. Returns a live TOTP code for any demo')
    console.log('[DEMO MODE] username with no auth. Judge convenience only, never set this in production.')
    console.log('')
  }

  const port = process.env.IDENTITY_PORT ? Number(process.env.IDENTITY_PORT) : 3001
  await app.listen(port)
  console.log(`identity listening on :${port}`)
}

void bootstrap()
