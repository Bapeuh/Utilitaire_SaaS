import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller.js";
import { PrivateController } from "./private.controller.js";

@Module({ controllers: [HealthController, PrivateController] })
export class AppModule {}
