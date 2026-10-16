import "reflect-metadata";

import { authNodeHandler } from "@utilitaire/auth";
import { NestFactory } from "@nestjs/core";
import express from "express";
import type { Express } from "express";

import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({ origin: true, credentials: true });

  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.all("/api/auth/*splat", authNodeHandler);
  expressApp.use(express.json());
  expressApp.use(express.urlencoded({ extended: true }));

  await app.listen(Number(process.env.API_PORT ?? 3000));
}

void bootstrap();
