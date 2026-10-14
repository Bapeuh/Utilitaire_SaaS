import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller.js";
import { PrivateController } from "./private.controller.js";
import { WorkspacesController } from "./workspaces.controller.js";

@Module({ controllers: [HealthController, PrivateController, WorkspacesController] })
export class AppModule {}
