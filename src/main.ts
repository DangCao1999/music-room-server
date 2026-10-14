import 'dotenv/config';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { type Env, EnvError, parseEnv } from './config/env';
import { MusicRoomIoAdapter } from './realtime/io-adapter';

async function bootstrap(): Promise<void> {
  let env: Env;
  try {
    env = parseEnv(process.env);
  } catch (e) {
    if (e instanceof EnvError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
  const app = await NestFactory.create(AppModule.forRoot(env), {
    logger: new ConsoleLogger({ json: env.NODE_ENV === 'production' }),
  });
  app.setGlobalPrefix('api');
  app.use(helmet());
  if (env.CORS_ORIGINS.length) app.enableCors({ origin: env.CORS_ORIGINS });
  app.useWebSocketAdapter(new MusicRoomIoAdapter(app, env));
  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
