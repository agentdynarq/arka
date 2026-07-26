import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.ts'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const port = process.env.GATEWAY_PORT ? Number(process.env.GATEWAY_PORT) : 3000
  await app.listen(port)
}

void bootstrap()
