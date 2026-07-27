import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { loadEnvFile } from './load-env.ts'

loadEnvFile()

const { AppModule } = await import('./app.module.ts')

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  app.enableCors()

  const port = process.env.RECOVERY_PORT ? Number(process.env.RECOVERY_PORT) : 3002
  await app.listen(port)
  console.log(`recovery listening on :${port}`)
}

void bootstrap()
