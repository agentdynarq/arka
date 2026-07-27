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

  const port = process.env.IDENTITY_PORT ? Number(process.env.IDENTITY_PORT) : 3001
  await app.listen(port)
  console.log(`identity listening on :${port}`)
}

void bootstrap()
